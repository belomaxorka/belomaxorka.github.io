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

    // Код моей кнопки 88x31 в буфер обмена; подписи на языке страницы в data-атрибутах.
    Alpine.data('copyCode', () => ({
      label: '',
      init() { this.label = this.$root.querySelector('[data-copy]').dataset.copy; },
      copy(btn) {
        const done = () => { this.label = btn.dataset.done; setTimeout(() => { this.label = btn.dataset.copy; }, 1600); };
        const fallback = () => { const d = this.$root.querySelector('details'); d.open = true; d.querySelector('input').select(); };
        if (!navigator.clipboard) return fallback();
        navigator.clipboard.writeText(btn.dataset.code).then(done, fallback);
      },
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

    // Рисунки гостевой открываются крупно в <dialog>, листаются стрелками и клавишами.
    Alpine.data('lightbox', () => ({
      i: 0,
      n: 0,
      links: [],
      show(a) {
        this.links = [...this.$root.querySelectorAll('a.pic')];
        this.n = this.links.length;
        this.i = Math.max(0, this.links.indexOf(a));
        this.render();
        this.$refs.dlg.showModal();
      },
      step(d) { if (this.n) { this.i = (this.i + d + this.n) % this.n; this.render(); } },
      render() { this.$refs.img.src = this.links[this.i].href; },
      close() { this.$refs.dlg.close(); },
    }));

    // Выдвижной юнит: ручка на левом ухе. Без JS это ссылка на /u/<имя> (страница с выдвинутым юнитом), с JS
    // htmx подгружает ящик под юнит (/fragments/unit/<имя>), повторное нажатие задвигает.
    Alpine.data('pull', () => ({
      toggle() {
        const el = this.$el, name = el.dataset.unit, box = document.getElementById('drawer-' + name);
        if (!box || !window.htmx) { location.href = el.href; return; }
        if (box.classList.contains('open')) { box.dispatchEvent(new CustomEvent('drawer:shut')); return; }
        el.setAttribute('aria-busy', 'true');
        htmx.ajax('GET', '/fragments/unit/' + name, { target: box, swap: 'outerHTML' })
          .finally(() => el.removeAttribute('aria-busy'));
      },
    }));

    // Ящик выдвинутого юнита: выезжает, ручке ставит aria-expanded, задвигается кнопкой, Esc или ручкой.
    Alpine.data('drawer', () => ({
      init() {
        // Сам ящик — корень компонента. В методах this.$el — элемент, на котором сработало событие (кнопка
        // «задвинуть»), поэтому ящик запоминаем здесь.
        const el = this.box = this.$root, name = el.id.replace('drawer-', '');
        this.handle = document.querySelector(`.pull[data-unit="${name}"]`);
        if (this.handle) this.handle.setAttribute('aria-expanded', 'true');
        el.addEventListener('drawer:shut', () => this.shut());
        // Выезжает сам (CSS @starting-style); стойку пересчитать сразу и когда доедет.
        const layout = () => document.dispatchEvent(new Event('rack:layout'));
        layout();
        el.addEventListener('transitionend', layout, { once: true });
      },
      shut() {
        const el = this.box;
        const done = () => {
          if (!el.isConnected) return;
          const empty = document.createElement('div');
          empty.className = 'drawer';
          empty.id = el.id;
          el.replaceWith(empty);
          if (this.handle && this.handle.isConnected) {
            this.handle.setAttribute('aria-expanded', 'false');
            this.handle.focus({ preventScroll: true });
          }
          document.dispatchEvent(new Event('rack:layout'));
        };
        if (!motion()) return done();
        el.style.minHeight = '';
        el.classList.add('closing');
        el.addEventListener('transitionend', done, { once: true });
        setTimeout(done, 450);
      },
    }));
  });

  // ---------- высота юнитов кратна U, номера на рейках ----------
  // Выдвинутый ящик тоже занимает место в стойке: считается, как юнит.
  function snap() {
    const body = document.getElementById('rack-body');
    if (!body) return;
    const U = parseFloat(getComputedStyle(body).getPropertyValue('--U'));
    const units = [...body.querySelectorAll(':scope > .u, :scope > .drawer.open')];
    let total = 0;
    units.forEach(u => {
      u.style.minHeight = '';
      const n = Math.ceil((u.offsetHeight - 1) / U);
      if (!u.classList.contains('closing')) u.style.minHeight = n * U + 'px';
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
  // Структурированная разводка (вариант B): короткие патч-корды из гнёзд кольца на патч-панели через щёточный
  // органайзер в верхний ряд коммутатора; сетевая карта каждого юнита — в левый вертикальный органайзер и по нему
  // вверх, к нижнему ряду коммутатора; роутер (на главной) — в коммутатор, его WAN жёлтой оптикой через крышу
  // «в интернет»; на остальных стойках из SFP коммутатора оптика уходит к R1. Всё в одном SVG поверх комнаты,
  // клики проходят насквозь. Силовые кабели рисует power.js.
  const NS = 'http://www.w3.org/2000/svg';
  const RING = ['#e0b93a', '#3a7bd5', '#e0b93a', '#e0b93a'];
  const DATA = '#3a7bd5', MGMT = '#9b6bd6', LAN = '#3daa63', FIBER = '#e8c21a', UPFIBER = '#2bb3c0';
  // Юниты с сетевой картой: как питаемые в power.js, плюс контейнеры /lab (data-power).
  const NETWORKED = ['mgmt', 'srv', 'media', 'mon', 'disks', 'log', 'sw', 'kvm', 'pve'];

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

  // Сетевые карты юнитов и вертикальный органайзер: декор, который есть только с JS (как разъёмы питания).
  function wire() {
    const body = document.getElementById('rack-body');
    if (!body || !body.querySelector(':scope > .tor')) return [];
    if (!body.querySelector(':scope > .vm')) {
      const vm = document.createElement('div');
      vm.className = 'vm';
      vm.setAttribute('aria-hidden', 'true');
      body.prepend(vm);
    }
    const units = [...body.querySelectorAll(':scope > .u')].filter(u => u.dataset.power || NETWORKED.some(k => u.classList.contains(k)));
    units.forEach((u, i) => {
      if (u.querySelector(':scope > .nic')) return;
      const n = document.createElement('span');
      n.className = 'nic';
      n.setAttribute('aria-hidden', 'true');
      n.style.setProperty('--d', (i * 0.37 % 1.3).toFixed(2) + 's');
      n.innerHTML = '<i class="led"></i><i class="jack"></i>';
      u.classList.add('has-nic');
      u.appendChild(n);
    });
    return units;
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
      return { x: b.left - R.left, y: b.top - R.top, r: b.right - R.left, b: b.bottom - R.top, cx: b.left - R.left + b.width / 2, cy: b.top - R.top + b.height / 2, w: b.width, h: b.height };
    };
    const rack = document.getElementById('rack');
    const tor = rack?.querySelector('#rack-body > .tor');
    if (!rack || !tor) return;
    const rk = box(rack), cap = box(rack.querySelector('.cap'));
    const port = (n) => tor.querySelector(`.tp[data-port="${n - 1}"]`);
    const used = new Set();
    const lit = (n) => { used.add(n); port(n)?.classList.add('link'); };
    tor.querySelectorAll('.tp.link').forEach(t => t.classList.remove('link'));

    // Кольцо: гнёзда 1–4 патч-панели → порты 1, 3, 5, 7 (верхний ряд), сверху вниз через щётку. Если гнёзда
    // переносятся в два ряда (телефон), корды только из нижнего: из верхнего они легли бы поверх подписей.
    const jacks = [...rack.querySelectorAll('.patch .ring .jack')].map(box);
    const lowest = Math.max(...jacks.map(j => j.y));
    jacks.forEach((j, i) => {
      const n = 1 + i * 2, t = port(n);
      if (!t || !t.offsetParent || lowest - j.y > 4) return;
      const p = box(t.querySelector('.jack'));
      cable(svg, `M${j.cx} ${j.b - 3} C${j.cx} ${j.b + 26}, ${p.cx} ${p.y - 30}, ${p.cx} ${p.y + 3}`, RING[i], 3.5);
      plug(svg, j.cx, j.b - 5, RING[i], 9, 10);
      plug(svg, p.cx, p.y + 5, RING[i], 8, 9);
      lit(n);
    });

    // Оптика (WAN роутера или аплинк коммутатора): вверх в щётку под коммутатором, по ней влево в вертикальный
    // органайзер, по нему через ввод в крыше вверх, к лоткам. Данные идут слева, питание — справа.
    const vmEl = rack.querySelector('#rack-body > .vm');
    const lowEl = tor.nextElementSibling?.classList.contains('brush') ? tor.nextElementSibling : null;
    const fiber = (from, color, label) => {
      if (!vmEl || !vmEl.offsetParent) return;
      const v = box(vmEl), x = v.x + v.w - 4;
      const y = lowEl ? box(lowEl).cy + 6 : from.y - 14;
      cable(svg, `M${from.cx} ${from.y + 2} C${from.cx} ${y + 8}, ${from.cx - 10} ${y}, ${from.cx - 24} ${y} L${x + 14} ${y} C${x + 4} ${y}, ${x} ${y - 6}, ${x} ${y - 18} L${x} ${cap.y + 4} C${x} ${cap.y - 16}, ${x} ${cap.y - 30}, ${x} -10`, color, 3);
      plug(svg, from.cx, from.y + 4, color, 8, 9);
      if (label) el('text', { x: x + 10, y: cap.y - 5, class: 'lbl small' }, svg).textContent = label;
    };

    // Роутер: LAN → последний порт нижнего ряда, WAN — оптикой к лоткам.
    const rtr = rack.querySelector('#rack-body > .rtr');
    let next = 2; // нижний ряд: чётные порты по порядку
    const bottom = () => { while (next <= 24 && (used.has(next) || !port(next)?.offsetParent)) next += 2; return next <= 24 ? next : 0; };
    if (rtr) {
      const lan = box(rtr.querySelector('[data-port="lan"]'));
      const last = [...tor.querySelectorAll('.tp')].filter(t => t.offsetParent && Number(t.dataset.port) % 2 === 1).pop();
      if (last) {
        const p = box(last.querySelector('.jack')), n = Number(last.dataset.port) + 1;
        cable(svg, `M${lan.cx} ${lan.y + 2} C${lan.cx} ${lan.y - 22}, ${p.cx} ${p.b + 22}, ${p.cx} ${p.b - 3}`, LAN, 3.5);
        plug(svg, lan.cx, lan.y + 4, LAN, 8, 9);
        plug(svg, p.cx, p.b - 5, LAN, 8, 9);
        lit(n);
      }
      fiber(box(rtr.querySelector('[data-port="wan"]')), FIBER, svg.dataset.uplink);
    } else {
      // Остальные стойки: оптика из SFP коммутатора к R1.
      const sfp = tor.querySelector('.sfp');
      if (sfp && sfp.offsetParent) fiber(box(sfp), UPFIBER, svg.dataset.uplinkR1);
    }

    // Сетевые карты: влево в вертикальный органайзер, по нему вверх до коммутатора, под ним вправо к порту.
    const vm = rack.querySelector('#rack-body > .vm');
    if (!vm || !vm.offsetParent) return;
    const lane = box(vm);
    const nics = [...rack.querySelectorAll('#rack-body > .u > .nic')];
    // Поперёк — через щёточный органайзер под коммутатором (если он есть), иначе прямо под коммутатором.
    const low = tor.nextElementSibling?.classList.contains('brush') ? box(tor.nextElementSibling) : null;
    const yBase = low ? low.cy - 6 : box(tor).b + 6;
    nics.forEach((nic, i) => {
      const n = bottom();
      if (!n) return;
      used.add(n);
      const u = nic.parentElement, j = box(nic.querySelector('.jack')), p = box(port(n).querySelector('.jack'));
      const x = lane.x + 4 + (i % 6) * 2.2;              // жилы в органайзере рядом, не одна поверх другой
      const y = yBase + (i % 6) * 2.4;                   // и поперёк — своими полосками
      const color = u.classList.contains('mgmt') ? MGMT : DATA;
      cable(svg, `M${j.x + 2} ${j.cy} C${j.x - 14} ${j.cy}, ${x + 10} ${j.cy}, ${x} ${j.cy - 12} L${x} ${y + 10} C${x} ${y}, ${x + 6} ${y}, ${x + 14} ${y} L${p.cx - 12} ${y} C${p.cx - 3} ${y}, ${p.cx} ${y - 4}, ${p.cx} ${p.b - 3}`, color, 2.4);
      plug(svg, j.x + 4, j.cy, color, 7, 8);
      plug(svg, p.cx, p.b - 5, color, 7, 8);
      if (!u.classList.contains('off')) port(n).classList.add('link');
    });
  }

  function layout() { wire(); snap(); cables(); document.dispatchEvent(new Event('rack:laidout')); }

  let pending = 0;
  const later = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(layout); };
  document.addEventListener('DOMContentLoaded', layout);
  addEventListener('load', layout);
  if (document.fonts) document.fonts.ready.then(later);
  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });
  document.addEventListener('htmx:afterSettle', later);
  // Журнал раз в минуту приходит целиком: прокрутку списка сохранить.
  let logScroll = 0;
  document.addEventListener('htmx:beforeSwap', (e) => {
    if (e.detail.target?.id === 'unit-syslog') logScroll = e.detail.target.querySelector('ol')?.scrollTop || 0;
  });
  document.addEventListener('htmx:afterSettle', () => {
    const ol = document.querySelector('#unit-syslog ol');
    if (ol && logScroll) ol.scrollTop = logScroll;
  });
  document.addEventListener('rack:layout', later);

  // Стойку подменили без перезагрузки (assets/js/aisle.js): разложить сразу, пока её не показали.
  document.addEventListener('rack:swap', layout);
  // Доехала: провода по местам и протягиваются от гнезда к роутеру, вилки встают в порты (cables.css, .draw).
  let drawn = 0;
  document.addEventListener('rack:landed', (e) => {
    layout();
    const svg = document.getElementById('cables');
    if (!svg || e.detail?.quiet || !motion()) return;
    let i = -1, k = 0;
    for (const n of svg.children) {
      if (n.tagName === 'g') {
        i++; k = 0;
        n.querySelectorAll('path').forEach(p => p.setAttribute('pathLength', '100'));
      }
      n.style.setProperty('--i', Math.max(0, i));
      if (n.tagName !== 'g') n.style.setProperty('--k', k++);
    }
    svg.classList.add('draw');
    clearTimeout(drawn);
    drawn = setTimeout(() => svg.classList.remove('draw'), 1600);
  });
})();
