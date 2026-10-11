// Поведение стойки. Разметку и данные рендерит site-api, htmx обновляет живые юниты,
// здесь только то, что нужно браузеру: Alpine-компоненты, высота юнитов, номера на рейках и провода.
(() => {
  const root = document.documentElement;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const motion = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The drawer of a unit for the rack on screen (a unit can stand on more than one rack).
  const drawerURL = (name) => '/fragments/unit/' + encodeURIComponent(name) + '?rack=' + encodeURIComponent(document.getElementById('room')?.dataset.rack || '');
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
        // Буфера обмена нет (http, старый браузер): код открыть и выделить, адрес кошелька — выделить.
        const fallback = () => {
          const d = this.$root.querySelector('details'), code = this.$root.querySelector('input.code');
          if (d) d.open = true;
          if (code) { code.select(); return; }
          const addr = this.$root.querySelector('.addr');
          if (!addr) return;
          const r = document.createRange(), sel = getSelection();
          r.selectNodeContents(addr);
          sel.removeAllRanges();
          sel.addRange(r);
        };
        if (!navigator.clipboard) return fallback();
        navigator.clipboard.writeText(btn.dataset.code).then(done, fallback);
      },
    }));

    // Аватарки: листаются и без JS (scroll-snap); здесь стрелки, счётчик и прокрутка по кругу.
    Alpine.data('gallery', () => ({
      i: 0,
      n: 1,
      init() { this.n = this.$refs.slides.children.length; },
      sync() { const s = this.$refs.slides; this.i = Math.round(s.scrollLeft / s.clientWidth); this.light(); },
      go(d) {
        const s = this.$refs.slides;
        this.i = (this.i + d + this.n) % this.n;
        s.scrollTo({ left: this.i * s.clientWidth, behavior: motion() ? 'smooth' : 'auto' });
        this.light();
      },
      // Лампы под фото: горит та, чьё фото на экране.
      light() { [...(this.$refs.leds?.children || [])].forEach((l, k) => l.classList.toggle('off', k !== this.i)); },
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
    // htmx подгружает ящик под юнит (/fragments/unit/<имя>), повторное нажатие задвигает. Запрос идёт от ручки:
    // так net.js знает, чей это ящик, и у юнита без сети вместо загрузки выдвигает ящик с ошибкой.
    Alpine.data('pull', () => ({
      toggle() {
        const el = this.$el, name = el.dataset.unit, box = document.getElementById('drawer-' + name);
        if (!box || !window.htmx) { location.href = el.href; return; }
        if (box.classList.contains('open')) { box.dispatchEvent(new CustomEvent('drawer:shut')); return; }
        el.setAttribute('aria-busy', 'true');
        htmx.ajax('GET', drawerURL(name), { source: el, target: box, swap: 'outerHTML' })
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
        // Открыт со страницы /u/<имя> (без JS-ящика): адрес возвращается к стойке, без перезагрузки.
        const back = el.querySelector('.shut')?.getAttribute('href')?.split('#')[0];
        const done = () => {
          if (!el.isConnected) return;
          if (back && new URLSearchParams(location.search).has('open')) history.replaceState(history.state, '', back);
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
  const RING = ['#e0b93a', '#3a7bd5', '#e0b93a', '#e0b93a'];
  const GUEST = '#c9ccd2';  // корды гостей онлайн (assets/js/live.js)
  let drawnGuests = 0;      // сколько их уже нарисовано: новый корд протягивается, остальные просто на месте
  const DATA = '#3a7bd5', MGMT = '#9b6bd6', LAN = '#3daa63', FIBER = '#e8c21a', UPFIBER = '#2bb3c0';
  const keyOf = (u) => Rack.keyOf(u, Rack.WIRED); // units with a network card (rack.js)
  const el = Rack.svg;

  function cable(svg, d, color, w) {
    Rack.setCord(Rack.cord(el('g', {}, svg), color, w), d);
  }

  function plug(svg, x, y, color, w = 9, h = 11) {
    el('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 2, fill: color, stroke: 'rgba(0,0,0,.45)' }, svg);
  }

  // Штекер, вставленный в гнездо: по его центру и почти во всё гнездо, по краю видна только рамка.
  function seat(svg, b, color) {
    plug(svg, b.cx, b.cy, color, Math.max(6, b.w - 5), Math.max(6, b.h - 4));
    el('rect', { x: b.cx - b.w * .18, y: b.cy - b.h * .16, width: b.w * .36, height: b.h * .32, rx: 1, fill: 'rgba(0,0,0,.22)', class: 'boot' }, svg);
  }

  // Кубическая кривая [a, b, c, d] делится в точке t на две (де Кастельжо).
  function split([a, b, c, d], t) {
    const m = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    const ab = m(a, b), bc = m(b, c), cd = m(c, d), abc = m(ab, bc), bcd = m(bc, cd), x = m(abc, bcd);
    return [[a, ab, abc, x], [x, bcd, cd, d]];
  }
  const xy = (p) => `${p.x} ${p.y}`;

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
    const units = [...body.querySelectorAll(':scope > .u')].filter(keyOf);
    // Экраны подключённых юнитов знают, что показать без связи (CSS: network.css, «нет связи»). После каждого
    // обновления htmx юнит приходит заново, поэтому подписи ставятся при каждой раскладке. Счётчик фото под
    // аватарками (.gal-ctl) — не экран сети: фото свои, и надпись туда не влезет. Хост Proxmox и контейнеры (/lab)
    // говорят только с локальной сетью: без линка — «связь потеряна», а без интернета им показывать нечего другого.
    units.forEach(u => u.querySelectorAll('.lcd, .screen').forEach(d => {
      if (d.closest('.gal-ctl')) return;
      d.dataset.nolink = body.dataset.nolink || '';
      if (u.matches('.pve, .ct')) delete d.dataset.nonet;
      else d.dataset.nonet = body.dataset.nonet || '';
    }));
    units.forEach((u) => {
      // Класс — каждый раз: htmx, подменив юнит, на settle возвращает ему class из ответа, а карта уже вставлена.
      u.classList.add('has-nic');
      if (u.querySelector(':scope > .nic')) return;
      const n = document.createElement('span');
      n.className = 'nic';
      n.setAttribute('aria-hidden', 'true');
      n.innerHTML = '<i class="led"></i><i class="jack"></i>';
      u.appendChild(n);
    });
    return units;
  }

  // Где кубическая кривая (монотонная по высоте) проходит высоту y: t от 0 до 1.
  function cross(c, y) {
    const at = (t) => (1 - t) ** 3 * c[0].y + 3 * (1 - t) ** 2 * t * c[1].y + 3 * (1 - t) * t * t * c[2].y + t ** 3 * c[3].y;
    const up = at(1) < at(0);
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if ((at(m) > y) === up) lo = m; else hi = m; }
    return Math.min(.85, Math.max(.15, (lo + hi) / 2));
  }

  // Возвращает корды стойки для assets/js/net.js (получает их с rack:laidout): у каждого ключ, порт коммутатора (его
  // лампу net.js зажигает, когда линк есть), номер провода в SVG (по нему — когда вилка встаёт в порт при протяжке).
  // У тех, что можно выдернуть, ещё гнездо, хвост — кривая от вилки до места, где корд держит органайзер (оттуда
  // выдернутый и свисает), и куда хватать.
  function cables() {
    const svg = document.getElementById('cables');
    const room = document.getElementById('room');
    const cords = [];
    if (!svg || !room) return cords;
    svg.replaceChildren();
    const R = room.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${R.width} ${R.height}`);
    const box = (node) => {
      const b = node.getBoundingClientRect();
      return { x: b.left - R.left, y: b.top - R.top, r: b.right - R.left, b: b.bottom - R.top, cx: b.left - R.left + b.width / 2, cy: b.top - R.top + b.height / 2, w: b.width, h: b.height };
    };
    const rack = document.getElementById('rack');
    const tor = rack?.querySelector('#rack-body > .tor');
    if (!rack || !tor) return cords;
    const cap = box(rack.querySelector('.cap'));
    const port = (n) => tor.querySelector(`.tp[data-port="${n - 1}"]`);
    const used = new Set();
    const wireNo = () => svg.querySelectorAll(':scope > g').length - 1;
    // Лампы портов зажигает net.js — у кого линк есть.
    tor.querySelectorAll('.tp.link').forEach(t => t.classList.remove('link'));

    // Какие корды этой стойки выдернуты, знает net.js: хвост и вилку такого корда рисует он, здесь — остальной путь
    // до коммутатора (или до лотков).
    const pulled = Rack.pulled();
    // Корд с хвостом tail ([от вилки, …, до органайзера]) и путём дальше rest (продолжение: «L…», «C…»). Вилку в гнезде
    // at ставит сам, на дальнем конце — тот, кто позвал. hit — куда хватать (по умолчанию само гнездо).
    const pullable = (key, type, port, at, color, w, tail, rest, hit) => {
      const out = pulled.has(key);
      cable(svg, out ? `M${xy(tail[3])} ${rest}` : `M${xy(tail[0])} C${xy(tail[1])}, ${xy(tail[2])}, ${xy(tail[3])} ${rest}`, color, w);
      if (!out) seat(svg, at, color);
      cords.push({ key, type, port, wire: wireNo(), grab: true, color, w, tail, at: { x: at.cx, y: at.cy }, hit: hit || { x: at.cx, y: at.cy, r: 15 } });
      return out;
    };

    // Кольцо: гнёзда 1–4 патч-панели → порты 1, 3, 5, 7 (верхний ряд), сверху вниз через щётку. Если гнёзда
    // переносятся в два ряда (телефон), корды только из нижнего: из верхнего они легли бы поверх подписей.
    const jacks = [...rack.querySelectorAll('.patch .ring .jack')].map(box);
    const lowest = Math.max(...jacks.map(j => j.y));
    jacks.forEach((j, i) => {
      const n = 1 + i * 2, t = port(n);
      if (!t || !t.offsetParent || lowest - j.y > 4) return;
      const p = box(t.querySelector('.jack'));
      cable(svg, `M${j.cx} ${j.b - 3} C${j.cx} ${j.b + 26}, ${p.cx} ${p.y - 30}, ${p.cx} ${p.y + 3}`, RING[i], 3.5);
      seat(svg, j, RING[i]);
      seat(svg, p, RING[i]);
      used.add(n);
      // Корды кольца не выдёргиваются: их гнёзда — ссылки кольца, а оно работает всегда.
      cords.push({ key: 'ring' + (i + 1), type: 'ring', port: t, wire: wireNo() });
    });

    // Гости онлайн (assets/js/live.js ставит data-guests на <html>): по корду на каждого другого гостя — из свободного
    // гнезда патч-панели (5, 6, …) в свободный порт верхнего ряда коммутатора (9, 11, …), сколько влезет на этой ширине
    // (на телефоне свободных гнёзд не видно — и гостей нет). Пришёл новый — его корд протягивается (.fresh).
    const guests = +document.documentElement.dataset.guests || 0;
    const spare = [...rack.querySelectorAll('.patch .pp-free .jack')].filter(j => j.offsetParent).map(box);
    let g = 0;
    for (let n = 9; g < guests && g < spare.length; g++, n += 2) {
      const t = port(n);
      if (!t || !t.offsetParent) break;
      const j = spare[g], p = box(t.querySelector('.jack'));
      cable(svg, `M${j.cx} ${j.b - 3} C${j.cx} ${j.b + 26}, ${p.cx} ${p.y - 30}, ${p.cx} ${p.y + 3}`, GUEST, 2.6);
      if (g >= drawnGuests && motion()) {
        const fresh = svg.lastElementChild;
        fresh.classList.add('fresh');
        fresh.querySelectorAll('path').forEach(q => q.setAttribute('pathLength', '100'));
      }
      seat(svg, j, GUEST);
      seat(svg, p, GUEST);
      used.add(n);
      cords.push({ key: 'guest' + (g + 1), type: 'guest', port: t, wire: wireNo() });
    }
    drawnGuests = g;

    // Оптика (WAN роутера или аплинк коммутатора): вверх в щётку под коммутатором, по ней влево в вертикальный
    // органайзер, по нему через ввод в крыше вверх, к лоткам. Данные идут слева, питание — справа.
    const vmEl = rack.querySelector('#rack-body > .vm');
    const lowEl = tor.nextElementSibling?.classList.contains('brush') ? tor.nextElementSibling : null;
    // Над стойкой — в жёлтый короб на потолке: точка ввода на его оси (метки .mark в зале, hall.css) на высоте
    // ~40 px, над табличками прохода; к ней по потолку и в короб через ввод, повёрнутый вдоль короба. Потолка нет
    // (светлая тема) или короб ниже крыши стойки — просто вверх. Хвост — от гнезда до щётки: выдернутая свисает из неё.
    const fiber = (key, from, color, label) => {
      if (!vmEl || !vmEl.offsetParent) return;
      const v = box(vmEl), x = v.x + v.w - 4;
      const y = lowEl ? box(lowEl).cy + 6 : from.y - 14;
      const marks = [...document.querySelectorAll('.hall .mark')].filter(m => m.offsetParent).map(box);
      const j = marks.reduce((a, m) => (!a || Math.abs(m.cy - 40) < Math.abs(a.cy - 40) ? m : a), null);
      const r = 14, s = j && Math.sign(j.cx - x) || 1;
      const top = j && j.cy < cap.y - 30
        ? `L${x} ${j.cy + r} Q${x} ${j.cy}, ${x + s * r} ${j.cy} L${j.cx} ${j.cy}`
        : `C${x} ${cap.y - 16}, ${x} ${cap.y - 30}, ${x} -10`;
      const tail = [{ x: from.cx, y: from.y + 2 }, { x: from.cx, y: y + 8 }, { x: from.cx - 10, y }, { x: from.cx - 24, y }];
      pullable(key, key, null, from, color, 3, tail, `L${x + 14} ${y} C${x + 4} ${y}, ${x} ${y - 6}, ${x} ${y - 18} L${x} ${cap.y + 4} ${top}`);
      if (j && j.cy < cap.y - 30) {
        const n = marks[Math.max(0, marks.indexOf(j) - 1)];
        const len = Math.hypot(n.cx - j.cx, n.cy - j.cy) || 1;
        const ux = (n.cx - j.cx) / len * 11, uy = (n.cy - j.cy) / len * 11, vx = -uy * .6, vy = ux * .6;
        const p = (a, b) => `${(j.cx + a * ux + b * vx).toFixed(1)} ${(j.cy + a * uy + b * vy).toFixed(1)}`;
        el('path', { d: `M${p(-1, -1)} L${p(1, -1)} L${p(1, 1)} L${p(-1, 1)} Z`, class: 'inlet' }, svg);
      }
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
        const c = [{ x: lan.cx, y: lan.y + 2 }, { x: lan.cx, y: lan.y - 22 }, { x: p.cx, y: p.b + 22 }, { x: p.cx, y: p.b - 3 }];
        // Хвост — от роутера до щётки между ним и коммутатором: выдернутый корд свисает из неё.
        const [tail, rest] = split(c, lowEl ? cross(c, box(lowEl).cy) : .5);
        pullable('lan', 'lan', last, lan, LAN, 3.5, tail, `C${xy(rest[1])}, ${xy(rest[2])}, ${xy(rest[3])}`);
        seat(svg, p, LAN);
        used.add(n);
      }
      fiber('wan', box(rtr.querySelector('[data-port="wan"]')), FIBER, svg.dataset.uplink);
    } else {
      // Остальные стойки: оптика из SFP коммутатора к R1.
      const sfp = tor.querySelector('.sfp');
      if (sfp && sfp.offsetParent) fiber('uplink', box(sfp), UPFIBER, svg.dataset.uplinkR1);
    }

    // Сетевые карты: влево в вертикальный органайзер, по нему вверх до коммутатора, под ним вправо к порту.
    const vm = rack.querySelector('#rack-body > .vm');
    if (!vm || !vm.offsetParent) return cords;
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
      // Хвост — от сетевой карты до органайзера. Хватать — чуть правее гнезда: слева на ухе ручка ящика.
      const tail = [{ x: j.x + 2, y: j.cy }, { x: j.x - 14, y: j.cy }, { x: x + 10, y: j.cy }, { x, y: j.cy - 12 }];
      pullable(keyOf(u), 'nic', port(n), j, color, 2.4, tail, `L${x} ${y + 10} C${x} ${y}, ${x + 6} ${y}, ${x + 14} ${y} L${p.cx - 12} ${y} C${p.cx - 3} ${y}, ${p.cx} ${y - 4}, ${p.cx} ${p.b - 3}`, { x: j.cx + 6, y: j.cy, r: 13 });
      seat(svg, p, color);
    });
    return cords;
  }

  // Стойка поменяла высоту (юнит погас и что-то в нём сдвинулось, пришло обновление htmx, открылся холст,
  // выезжает ящик): провода перерисовать, иначе они останутся на старых местах. Наблюдатель срабатывает после
  // раскладки и до отрисовки — провода (свои и силовые, power.js) встают на место в том же кадре, что и юниты,
  // а не кадром позже: иначе при каждом изменении они дёргаются. Сами юниты (snap меняет высоты) — кадром позже,
  // чтобы наблюдатель не зациклился. Новая стойка после перехода — свой наблюдатель.
  let watched = null;
  // Разложили: провода на местах. Корды — net.js, силовые кабели перерисует power.js.
  const laidout = (cords) => document.dispatchEvent(new CustomEvent('rack:laidout', { detail: { cords } }));
  const ro = window.ResizeObserver ? new ResizeObserver(() => {
    laidout(cables()); later();
  }) : null;
  function layout() {
    const body = document.getElementById('rack-body');
    if (ro && body && body !== watched) { if (watched) ro.unobserve(watched); ro.observe(body); watched = body; }
    wire(); snap(); laidout(cables());
  }

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
  // Явная просьба (холст открыли, ящик выехал): сразу, до отрисовки этого кадра.
  document.addEventListener('rack:layout', layout);
  // Стена кнопок раскрылась или свернулась («показать все», <details class="more">, stickers.html). Свернулась —
  // стойка не меняет высоту (snap держит прежний min-height юнита), наблюдатель молчит: разложить самим.
  // MutationObserver срабатывает до отрисовки, событие toggle — позже, юнит кадр простоял бы пустым.
  new MutationObserver((recs) => {
    if (recs.some((r) => r.target.classList?.contains('more'))) layout();
  }).observe(document, { subtree: true, attributeFilter: ['open'] });

  // Стойку подменили без перезагрузки (assets/js/aisle.js): разложить сразу, пока её не показали.
  document.addEventListener('rack:swap', layout);
  // Доехала: провода по местам и протягиваются от гнезда к роутеру, вилки встают в порты (cables.css, .draw).
  let drawn = 0;
  document.addEventListener('rack:landed', (e) => {
    layout();
    const svg = document.getElementById('cables');
    const draw = !!svg && !e.detail?.quiet && motion();
    if (draw) {
      let i = -1, k = 0;
      for (const n of svg.children) {
        if (n.tagName === 'g') {
          i++; k = 0;
          n.querySelectorAll('path').forEach(p => p.setAttribute('pathLength', '100'));
        }
        n.style.setProperty('--i', Math.max(0, i));
        if (n.tagName !== 'g') n.style.setProperty('--k', n.classList.contains('boot') ? k - 1 : k++);
      }
      svg.classList.add('draw');
      clearTimeout(drawn);
      drawn = setTimeout(() => svg.classList.remove('draw'), 1600);
    }
    // Стойка выходит в сеть (net.js): юнит — когда вилка его корда встала в порт, провод i — через lag + i·step мс
    // (cables.css: провод .55 с, вилка через 480 мс на .3 с, у каждого провода сдвиг 70 мс). Без протяжки — все сразу.
    document.dispatchEvent(new CustomEvent('rack:drawing', { detail: draw ? { lag: 700, step: 70 } : null }));
  });
})();
