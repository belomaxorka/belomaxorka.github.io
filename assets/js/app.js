// Поведение стойки. Разметку и данные рендерит site-api, htmx обновляет живые юниты,
// здесь только то, что нужно браузеру: Alpine-компоненты, высота юнитов, номера на рейках и провода.
(() => {
  const root = document.documentElement;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const motion = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches;

  // ---------- Alpine ----------
  document.addEventListener('alpine:init', () => {
    const Alpine = window.Alpine;

    // Цвет ЖК: из обложки (палитру присылает site-api) или обычный янтарь. Подписи кнопок — в data-атрибутах
    // на языке страницы.
    Alpine.store('lcd', {
      cover: root.dataset.lcd !== 'amber',
      toggle() {
        this.cover = !this.cover;
        root.dataset.lcd = this.cover ? 'cover' : 'amber';
        store.set('lcd', root.dataset.lcd);
      },
    });

    Alpine.data('lcdToggle', () => ({
      init() { this.$el.hidden = false; },
      get label() { return this.$store.lcd.cover ? this.$root.dataset.cover : this.$root.dataset.amber; },
      toggle() { this.$store.lcd.toggle(); },
    }));

    Alpine.data('themeToggle', () => ({
      dark: isDark(),
      init() { this.$el.hidden = false; },
      get label() { return this.dark ? this.$root.dataset.dark : this.$root.dataset.light; },
      toggle() {
        this.dark = !this.dark;
        root.dataset.theme = this.dark ? 'dark' : 'light';
        store.set('theme', root.dataset.theme);
      },
    }));

    // Бегущие строки на ЖК: первая видна и без JS, дальше по кругу.
    Alpine.data('cycle', (ms) => ({
      init() {
        const items = [...this.$el.querySelectorAll('li')];
        if (items.length < 2 || !motion()) return;
        let i = 0;
        this.timer = setInterval(() => {
          items[i].classList.remove('on');
          i = (i + 1) % items.length;
          items[i].classList.add('on');
        }, ms);
      },
      destroy() { clearInterval(this.timer); },
    }));

    // VU-метр: живёт, только пока что-то играет.
    Alpine.data('vu', (playing) => ({
      init() {
        const rows = [...this.$el.querySelectorAll('.row')];
        rows.forEach(r => {
          for (let i = 0; i < 14; i++) {
            const s = document.createElement('i');
            if (i >= 12) s.className = 'e'; else if (i >= 9) s.className = 'w';
            r.appendChild(s);
          }
        });
        const lv = [7, 6];
        const tick = () => rows.forEach((r, k) => {
          lv[k] = playing ? Math.max(2, Math.min(14, lv[k] + Math.random() * 6 - 3.1)) : 0;
          [...r.children].forEach((s, i) => s.classList.toggle('on', i < lv[k]));
        });
        tick();
        if (playing && motion()) this.timer = setInterval(tick, 120);
      },
      destroy() { clearInterval(this.timer); },
    }));

    // Аватарки: листаются и без JS (scroll-snap); здесь стрелки, счётчик и прокрутка по кругу.
    Alpine.data('gallery', () => ({
      i: 0,
      n: 1,
      init() { this.n = this.$refs.slides.children.length; },
      sync() { const s = this.$refs.slides; this.i = Math.round(s.scrollLeft / s.clientWidth); },
      go(d) {
        const s = this.$refs.slides;
        this.i = (this.i + d + this.n) % this.n;
        s.scrollTo({ left: this.i * s.clientWidth, behavior: motion() ? 'smooth' : 'auto' });
      },
    }));

    // Рисовалка гостевой: палитра из цветов стойки (ЖК, лампы, ленты), картинка уходит в скрытое поле
    // после каждого штриха, так что её отправит и htmx, и обычная форма.
    Alpine.data('oekaki', () => ({
      open: false,
      size: 3,
      color: '#000000',
      colors: [],
      init() {
        const cs = getComputedStyle(root);
        const pick = ['--lcd', '--accent', '--tape-r', '--tape-b', '--led-ok', '--led-warn'].map(v => cs.getPropertyValue(v).trim()).filter(Boolean);
        this.colors = [...new Set(['#111111', ...pick, '#ffffff'])];
        this.color = this.colors[0];
        const c = this.$refs.pad, g = c.getContext('2d');
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, c.width, c.height);
        const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
        let last = null;
        const stroke = (a, b) => {
          g.strokeStyle = g.fillStyle = this.color; g.lineWidth = this.size; g.lineCap = g.lineJoin = 'round';
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        };
        c.addEventListener('pointerdown', (e) => { last = pos(e); c.setPointerCapture(e.pointerId); stroke(last, [last[0] + .1, last[1]]); });
        c.addEventListener('pointermove', (e) => { if (!last) return; const p = pos(e); stroke(last, p); last = p; });
        const end = () => { if (last) { last = null; this.$refs.drawing.value = c.toDataURL('image/png'); } };
        c.addEventListener('pointerup', end);
        c.addEventListener('pointercancel', end);
        this.g = g;
        // Открытый холст меняет высоту юнита: пересчитать стойку и провода.
        this.$watch('open', () => this.$nextTick(() => document.dispatchEvent(new Event('rack:layout'))));
      },
      clear() {
        const c = this.$refs.pad;
        this.g.fillStyle = '#ffffff';
        this.g.fillRect(0, 0, c.width, c.height);
        this.$refs.drawing.value = '';
      },
    }));
  });

  // ---------- высота юнитов кратна U, номера на рейках ----------
  function snap() {
    const body = document.getElementById('rack-body');
    if (!body) return;
    const U = parseFloat(getComputedStyle(body).getPropertyValue('--U'));
    const units = [...body.querySelectorAll(':scope > .u')];
    let total = 0;
    units.forEach(u => {
      u.style.minHeight = '';
      const n = Math.ceil((u.offsetHeight - 1) / U);
      u.style.minHeight = n * U + 'px';
      total += n;
    });
    body.querySelectorAll('.rail').forEach(rail => {
      rail.querySelectorAll('.n').forEach(n => n.remove());
      for (let i = 0; i < total; i++) {
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = total - i;
        n.style.top = (i * U + U / 2) + 'px';
        rail.appendChild(n);
      }
    });
  }

  // ---------- провода ----------
  // Патч-корды от вебринга к роутеру, свитч к роутеру по правой рейке, аплинк из роутера наружу,
  // питание ИБП в розетку. Всё в одном SVG поверх комнаты, клики проходят насквозь.
  const NS = 'http://www.w3.org/2000/svg';
  const PATCH = ['#3a7bd5', '#e0b93a', '#d9534f', '#3daa63'];
  const SWITCH = '#9b6bd6';
  const UPLINK = '#5b6068';
  const POWER = '#26292e';

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function cable(svg, d, color, w) {
    const g = el('g', {}, svg);
    const line = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    el('path', { ...line, stroke: 'rgba(0,0,0,.35)', 'stroke-width': w + 3, transform: 'translate(0 2)' }, g);
    el('path', { ...line, stroke: color, 'stroke-width': w }, g);
    el('path', { ...line, stroke: 'rgba(255,255,255,.28)', 'stroke-width': Math.max(1, w * .3), transform: `translate(${-w * .2} ${-w * .2})` }, g);
  }

  function plug(svg, x, y, color, w = 9, h = 11) {
    el('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 2, fill: color, stroke: 'rgba(0,0,0,.45)' }, svg);
  }

  function cables() {
    const svg = document.getElementById('cables');
    const room = document.getElementById('room');
    if (!svg || !room) return;
    svg.replaceChildren();
    const R = room.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${R.width} ${R.height}`);
    const box = (node) => {
      const b = node.getBoundingClientRect();
      return { x: b.left - R.left, y: b.top - R.top, r: b.right - R.left, b: b.bottom - R.top, cx: b.left - R.left + b.width / 2, cy: b.top - R.top + b.height / 2 };
    };
    const rack = document.getElementById('rack');
    if (!rack) return;
    const rk = box(rack);
    const cap = box(rack.querySelector('.cap'));
    const railW = parseFloat(getComputedStyle(root).getPropertyValue('--rail-w')) || 34;
    const ports = {};
    rack.querySelectorAll('.rport').forEach(p => { ports[p.dataset.port] = box(p); });

    // Патч-корды: только первый ряд гнёзд, иначе провода лягут поверх соседних портов.
    const jacks = [...rack.querySelectorAll('.patch .jack')].map(box);
    const top = Math.min(...jacks.map(j => j.y));
    jacks.forEach((j, i) => {
      const p = ports[String(i + 1)];
      if (!p || Math.abs(j.y - top) > 4) return;
      cable(svg, `M${j.cx} ${j.y + 3} C${j.cx} ${j.y - 40}, ${p.cx} ${p.cy + 54}, ${p.cx} ${p.cy}`, PATCH[i], 4);
      plug(svg, j.cx, j.y + 6, PATCH[i]);
      plug(svg, p.cx, p.cy, PATCH[i], 8, 9);
    });

    // Свитч: из крайнего гнезда вниз, к правой рейке, по ней вверх и в роутер.
    const sw = [...rack.querySelectorAll('.sw .jack')].map(box).pop();
    const p5 = ports['5'];
    if (sw && p5) {
      const x = rk.r - railW / 2;
      cable(svg, `M${sw.cx} ${sw.b - 4} C${sw.cx} ${sw.b + 22}, ${x} ${sw.b + 22}, ${x} ${sw.b - 12} L${x} ${cap.b + 12} C${x} ${cap.y - 24}, ${p5.cx} ${p5.cy + 40}, ${p5.cx} ${p5.cy}`, SWITCH, 4);
      plug(svg, sw.cx, sw.b - 6, SWITCH);
      plug(svg, p5.cx, p5.cy, SWITCH, 8, 9);
    }

    // Аплинк: из WAN-порта наружу. Есть место справа — уходит за край комнаты, нет — вверх.
    const wan = ports.wan;
    if (wan) {
      if (R.width - rk.r > 130) {
        cable(svg, `M${wan.cx} ${wan.cy} C${wan.cx} ${wan.cy - 30}, ${rk.r - 20} ${wan.cy - 24}, ${R.width + 10} ${wan.cy - 8}`, UPLINK, 5);
        el('text', { x: rk.r + 16, y: wan.cy - 26, class: 'lbl' }, svg).textContent = svg.dataset.uplink || '';
      } else {
        cable(svg, `M${wan.cx} ${wan.cy} C${wan.cx} ${wan.cy - 24}, ${wan.cx - 30} ${wan.cy - 20}, ${wan.cx - 30} -10`, UPLINK, 5);
      }
      plug(svg, wan.cx, wan.cy, UPLINK, 8, 9);
    }

    // Питание: из ИБП вниз, по полу в розетку.
    const ups = rack.querySelector('.ups');
    if (ups) {
      const u = box(ups);
      const floor = rk.b + 34;
      const sx = rk.x + railW + 46;
      const wall = rk.x > 110;
      const ox = wall ? rk.x - 62 : rk.x + railW + 120;
      const oy = wall ? rk.b - 40 : floor + 26;
      el('rect', { x: ox - 16, y: oy - 18, width: 32, height: 36, rx: 5, class: 'outlet' }, svg);
      el('circle', { cx: ox - 6, cy: oy - 4, r: 2.6, class: 'outlet-hole' }, svg);
      el('circle', { cx: ox + 6, cy: oy - 4, r: 2.6, class: 'outlet-hole' }, svg);
      const py = oy + 12;
      cable(svg, `M${sx} ${u.b - 6} C${sx} ${floor + 30}, ${ox} ${floor + 40}, ${ox} ${py + 8}`, POWER, 6);
      el('rect', { x: ox - 9, y: py - 4, width: 18, height: 14, rx: 3, fill: POWER, stroke: 'rgba(0,0,0,.5)' }, svg);
      if (wall) el('text', { x: ox - 22, y: oy - 26, class: 'lbl' }, svg).textContent = svg.dataset.power || '';
    }
  }

  function layout() { snap(); cables(); }

  let pending = 0;
  const later = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(layout); };
  document.addEventListener('DOMContentLoaded', layout);
  addEventListener('load', layout);
  if (document.fonts) document.fonts.ready.then(later);
  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });
  document.addEventListener('htmx:afterSettle', later);
  document.addEventListener('rack:layout', later);
})();
