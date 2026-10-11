// Сеть стойки: линки юнитов и патч-корды, которые выдёргиваются, как вилки питания (assets/js/power.js).
//
// Юнит в сети, когда его корд в порту, а коммутатор и роутер работают. Нет — юнит офлайн: на экранах «связь потеряна /
// нет интернета», гаснут диоды сетевой карты и порта, обложка, VU-метр, лампы мониторинга (assets/css/units/
// network.css), его ящик — без деталей, с той же ошибкой, и он не обновляется: опрос htmx и загрузка ящика
// отменяются, а вернулась связь — один раз обновляется, если что-то пропустил. Причины:
//   - корд выдернут: тянешь вилку из сетевой карты юнита — корд выходит из гнезда, вытягивается из органайзера и
//     повисает; связи нет только у этого юнита. LAN или WAN роутера (на остальных стойках — аплинк к R1) — нет
//     интернета у всей стойки. Поднести вилку к гнезду (или тапнуть по ней) — воткнётся;
//   - стойка приехала из соседней (assets/js/aisle.js): пока провода протягиваются, юниты офлайн, каждый выходит
//     в сеть, когда вилка его корда встала в порт. Без анимации — все сразу;
//   - коммутатор или роутер обесточен (power.js; экраны и лампы тогда гасит CSS сам).
// Корды кольца из патч-панели не выдёргиваются: их гнёзда — ссылки кольца, а оно работает всегда.
// Разводку рисует app.js (cables): спрашивает здесь, какие корды выдернуты (rack:pulled), рисует их без хвоста и отдаёт
// все корды с rack:laidout. Выдернутые — только у посетителя (localStorage), у каждой стойки свои. Корд, которого на
// этой ширине не видно (телефон: нет сетевых карт), считается воткнутым. Без JS нет ни кордов, ни всего этого.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('rack-net') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('rack-net', JSON.stringify(v)); } catch {} },
  };
  const saved = store.get();
  const out = saved.out && typeof saved.out === 'object' ? saved.out : {}; // 'home/mgmt' → 1: корд выдернут
  const save = () => store.set({ out });

  // Сколько корда свисает, когда его отпустили, и сколько можно вытянуть из органайзера, пока тянешь (px). Корд
  // сетевой карты висит над вертикальным органайзером — там ничего не нажимается; LAN и WAN — на роутер (декор);
  // аплинк коротко: под щёткой уже кнопки mgmt.
  const HANG = { nic: 100, lan: 46, wan: 44, uplink: 26 };
  const REACH = { nic: 170, lan: 150, wan: 130, uplink: 130 };
  const N = 10; // звеньев в верёвке

  let rack = '', cords = [], room = null, svg = null, raf = 0, calm = 0, drag = null;
  const ropes = new Map(); // ключ выдернутого корда → верёвка: points[0] — вилка, последняя — где корд держит органайзер
  const here = () => document.getElementById('room')?.dataset.rack || '';
  const has = (k) => cords.some((c) => c.key === k);
  const pulled = (k) => !!out[here() + '/' + k] && has(k);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---------- линки ----------
  // Стойка приехала: boot — провода ещё не начали протягиваться, все без связи; дальше waiting — чья вилка не встала.
  let boot = false, timers = [];
  const waiting = new Set();
  const down = (k) => pulled(k) || boot || waiting.has(k);
  const unitOf = (body, k) => body.querySelector(`:scope > .u[data-power="${CSS.escape(k)}"]`) || body.querySelector(`:scope > .u.${CSS.escape(k)}`);

  // Лампы портов, юниты без связи (.unlinked), роутер без WAN или LAN, стойка без интернета (.nonet) — одно место на
  // все причины. Лампа порта горит, если корд в нём, линк есть и юнит на том конце включён.
  function sync() {
    const body = document.getElementById('rack-body'), rk = document.getElementById('rack');
    if (!body || !rk) return;
    const rtr = body.querySelector(':scope > .u.rtr');
    const lost = new Set();
    for (const c of cords) {
      const u = c.type === 'nic' ? unitOf(body, c.key) : c.type === 'lan' ? rtr : null;
      if (c.type === 'nic' && u && down(c.key)) lost.add(u);
      c.port?.classList.toggle('link', !down(c.key) && !u?.classList.contains('off'));
    }
    body.querySelectorAll(':scope > .u').forEach((u) => u.classList.toggle('unlinked', lost.has(u)));
    const cut = (k) => has(k) && down(k);
    if (rtr) {
      // LAN роутера смотрит в коммутатор: обесточен коммутатор — линка на LAN нет, как и с выдернутым кордом.
      rtr.classList.toggle('nowan', cut('wan'));
      rtr.classList.toggle('nolan', cut('lan') || !!body.querySelector(':scope > .u.tor.off'));
    }
    rk.classList.toggle('nonet', cut('lan') || cut('wan') || cut('uplink'));
    // Связь вернулась — кто пропустил обновление, обновляется, пустые ящики загружаются.
    for (const u of missed) {
      if (!u.isConnected) missed.delete(u);
      else if (!offline(u)) { missed.delete(u); refresh(u); }
    }
    body.querySelectorAll(':scope > .drawer.open[data-later]').forEach((d) => {
      const u = d.previousElementSibling;
      if (u && !offline(u)) fill(d);
    });
    body.querySelectorAll(':scope > .u .gb-status[data-net]').forEach((p) => {
      if (!offline(p.closest('.u'))) p.remove();
    });
  }

  // Офлайн: нет своего линка, обесточен коммутатор или роутер, нет интернета у стойки (то же, что видно на экранах).
  function offline(u) {
    if (!u.classList.contains('has-nic')) return false;
    const rk = u.closest('.rack');
    return u.classList.contains('unlinked') ||
      !!rk && (rk.classList.contains('nonet') || !!rk.querySelector('#rack-body > .u.tor.off, #rack-body > .u.rtr.off'));
  }

  // Офлайн-юнит не обновляется: его опрос htmx (медиа, монитор, журнал) отменяется — ни нового трека за надписью, ни
  // новой палитры ЖК (она приходит вместе с медиа). Его ящик (запрос от ручки, app.js) не загружается: выдвигается
  // пустым, с той же ошибкой, что на экранах (network.css), и загружается, когда связь вернётся. Форма гостевой не
  // уходит — ниже.
  const missed = new Set();
  document.addEventListener('htmx:beforeRequest', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const handle = t.closest('.pull[data-unit]'), u = handle ? handle.parentElement : t;
    if (u.parentElement?.id !== 'rack-body' || !offline(u)) return;
    e.preventDefault();
    if (handle) empty(handle); else missed.add(u);
  });
  // Без связи гостевая не отправляет: форма офлайн-юнита (KVM) не уходит — ни через htmx, ни обычным POST (перехват
  // раньше всех, на фазе захвата). Над формой — почему, как на экранах: у KVM нет линка или коммутатор обесточен —
  // «связь потеряна», нет интернета у стойки или роутер обесточен — «нет интернета». Написанное и нарисованное
  // остаётся; вернулась связь — надпись уходит (sync), можно отправить снова.
  document.addEventListener('submit', (e) => {
    const f = e.target, u = f instanceof HTMLFormElement ? f.closest('#rack-body > .u') : null;
    if (!u || !offline(u)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const cut = u.classList.contains('unlinked') || !!u.closest('.rack')?.querySelector('#rack-body > .u.tor.off');
    let p = f.previousElementSibling;
    if (!p?.classList.contains('gb-status')) {
      p = document.createElement('p');
      p.setAttribute('role', 'status');
      f.before(p);
    }
    p.className = 'gb-status err';
    p.dataset.net = '';
    p.textContent = (cut ? f.dataset.nolink : f.dataset.nonet) || '';
  }, true);

  function refresh(u) {
    const url = u.getAttribute('hx-get');
    if (url && window.htmx) htmx.ajax('GET', url, { source: u, target: u, swap: 'outerHTML' });
  }

  // Ящик без деталей (data-later): тот же компонент drawer (app.js) — задвигается ручкой, — в нём только ошибка.
  function empty(handle) {
    const box = document.getElementById('drawer-' + handle.dataset.unit), body = document.getElementById('rack-body');
    if (!box || box.classList.contains('open') || !body) return;
    const d = document.createElement('div'), slide = document.createElement('div');
    d.className = 'drawer open';
    d.id = box.id;
    d.dataset.later = '';
    d.setAttribute('x-data', 'drawer');
    slide.className = 'slide';
    slide.dataset.nolink = body.dataset.nolink || '';
    slide.dataset.nonet = body.dataset.nonet || '';
    d.append(slide);
    box.replaceWith(d);
  }

  // Связь вернулась: в пустой ящик — детали (только его содержимое: сам ящик уже выдвинут и не выезжает заново).
  function fill(d) {
    const handle = d.previousElementSibling?.querySelector(':scope > .pull[data-unit]');
    if (!handle || !window.htmx) return;
    delete d.dataset.later;
    htmx.ajax('GET', '/fragments/unit/' + handle.dataset.unit, { source: handle, target: d.querySelector(':scope > .slide'), swap: 'outerHTML', select: '.slide' });
  }

  // ---------- корды ----------
  // Раскладка (app.js): корды этой стойки и где они. Выдернутые висят из органайзера; стойка сдвинулась — висят там же.
  function relayout(e) {
    const id = here();
    if (id !== rack) { ropes.clear(); drag = null; rack = id; }
    cords = e.detail?.cords || [];
    room = document.getElementById('room');
    if (!room) return;
    svg = document.getElementById('net');
    if (!svg) {
      svg = el('svg', { id: 'net', class: 'cables net', 'aria-hidden': 'true' }, room);
      svg.addEventListener('pointerdown', grab);

    }
    const R = room.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${R.width} ${R.height}`);
    for (const c of cords) {
      if (!c.grab || !pulled(c.key)) continue;
      const a = c.tail[3];
      let r = ropes.get(c.key);
      if (!r) ropes.set(c.key, r = hanging(c));
      else {
        const dx = a.x - r.anchor.x, dy = a.y - r.anchor.y;
        if (dx || dy) r.pts.forEach((p) => { p.x += dx; p.y += dy; p.px += dx; p.py += dy; });
      }
      Object.assign(r, { cord: c, anchor: a, floor: R.height - 34, right: R.width - 8 });
    }
    for (const k of ropes.keys()) if (!pulled(k)) ropes.delete(k);
    sync();
    draw();
    if (ropes.size) wake();
    if (probed) probe(probed);
  }

  // Висит из органайзера прямо вниз (выдернут ещё до загрузки страницы).
  function hanging(c) {
    const a = c.tail[3], seg = HANG[c.type] / N, pts = [];
    for (let i = 0; i <= N; i++) pts.push({ x: a.x, y: a.y + (N - i) * seg, px: a.x, py: a.y + (N - i) * seg });
    return { key: c.key, type: c.type, cord: c, anchor: a, pts, seg };
  }

  // Только что выдернут: лежит, как в разводке, — от гнезда до органайзера; дальше его вытягивают (step).
  function fresh(c) {
    const [a, b, d, e] = c.tail, pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, s = 1 - t;
      const x = s * s * s * a.x + 3 * s * s * t * b.x + 3 * s * t * t * d.x + t * t * t * e.x;
      const y = s * s * s * a.y + 3 * s * s * t * b.y + 3 * s * t * t * d.y + t * t * t * e.y;
      pts.push({ x, y, px: x, py: y });
    }
    Object.assign(pts[0], { x: c.at.x, y: c.at.y, px: c.at.x, py: c.at.y });
    let len = 0;
    for (let i = 0; i < N; i++) len += dist(pts[i], pts[i + 1]);
    return { key: c.key, type: c.type, cord: c, anchor: e, pts, seg: len / N };
  }

  // ---------- физика (как у power.js) ----------
  function step(r) {
    const g = 0.42, damp = reduce.matches ? 0.8 : 0.985;
    const held = drag?.key === r.key;
    const pinned = (i) => i === N || (i === 0 && held);
    // Длина: тянешь — корд выходит из органайзера, сколько нужно руке (до REACH); отпустил — уходит обратно, пока
    // не повиснет на HANG.
    const want = held ? Math.min(REACH[r.type], Math.max(HANG[r.type], dist(drag, r.anchor) * 1.1)) : HANG[r.type];
    const ds = (want / N - r.seg) * (reduce.matches ? 1 : held ? 0.3 : 0.08);
    r.seg += ds;
    let motion = Math.abs(ds) * N;
    const floor = r.floor ?? Infinity, right = r.right ?? Infinity;
    const keepIn = (p) => {
      if (p.y > floor) p.y = floor;
      if (p.x < 8) p.x = 8; else if (p.x > right) p.x = right;
    };
    r.pts.forEach((p, i) => {
      if (pinned(i)) return;
      const rub = p.y >= floor - 0.5 ? 0.7 : 1;
      const vx = (p.x - p.px) * damp * rub, vy = (p.y - p.py) * damp;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + g;
      motion += Math.abs(vx) + Math.abs(vy);
    });
    const head = r.pts[0];
    if (held) {
      // Вилка за пальцем, но не дальше, чем пускает корд.
      let tx = drag.x, ty = drag.y;
      const d = Math.hypot(tx - r.anchor.x, ty - r.anchor.y), max = r.seg * N * 0.97;
      if (d > max) { tx = r.anchor.x + (tx - r.anchor.x) * max / d; ty = r.anchor.y + (ty - r.anchor.y) * max / d; }
      head.px = head.x; head.py = head.y;
      head.x = tx; head.y = ty;
      keepIn(head);
      motion += 1;
    }
    const end = r.pts[N];
    end.x = end.px = r.anchor.x; end.y = end.py = r.anchor.y;
    for (let k = 0; k < 16; k++) {
      for (let i = 0; i < N; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001;
        const diff = (d - r.seg) / d;
        const pa = pinned(i), pb = pinned(i + 1);
        if (pa && pb) continue;
        const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
        a.x += dx * diff * wa; a.y += dy * diff * wa;
        b.x -= dx * diff * wb; b.y -= dy * diff * wb;
      }
      r.pts.forEach((p, i) => { if (!pinned(i)) keepIn(p); });
    }
    return motion;
  }

  // ---------- тестер кабеля ----------
  // Навёл мышь на вилку — корд светится целиком, а лампы его порта на коммутаторе и сетевой карты юнита мигают часто,
  // как от тестера на другом конце (только если линк есть). Пальцем наводить нечем — на телефоне тестера нет.
  // app.js перерисовывает корды при каждой раскладке: подсветка ставится заново (relayout).
  // Цель смотрится на каждом движении мыши, не по pointerover/pointerout: draw() пересоздаёт зоны захвата, и «ушёл»
  // исчезнувшей зоне не приходит — подсветка залипала (как и в power.js).
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || drag) return;
    const k = (e.target instanceof Element && e.target.closest('#net .hit')?.dataset.key) || null;
    if (k !== probed) probe(k);
  }, { passive: true });
  let probed = null;
  function probe(key) {
    document.querySelectorAll('#cables > g.probe, #rack .probe').forEach((n) => n.classList.remove('probe'));
    probed = key;
    const c = key && cords.find((x) => x.key === key);
    if (!c || pulled(key)) return;
    document.querySelectorAll('#cables > g')[c.wire]?.classList.add('probe');
    c.port?.classList.add('probe');
    const body = document.getElementById('rack-body');
    if (c.type === 'nic' && body) unitOf(body, key)?.querySelector(':scope > .nic')?.classList.add('probe');
  }

  // ---------- рисование ----------
  // Воткнутые корды рисует app.js, здесь у их вилок только невидимая зона, за которую хватать.
  function draw() {
    if (!svg) return;
    svg.replaceChildren();
    for (const c of cords) {
      if (!c.grab) continue;
      const r = ropes.get(c.key);
      if (r) rope(r);
      else el('circle', { cx: c.hit.x, cy: c.hit.y, r: c.hit.r, class: 'hit', 'data-key': c.key }, svg);
    }
  }

  function rope(r) {
    const p = r.pts, c = r.cord;
    let d = `M${p[0].x} ${p[0].y}`;
    for (let i = 1; i < N; i++) d += ` Q${p[i].x} ${p[i].y} ${(p[i].x + p[i + 1].x) / 2} ${(p[i].y + p[i + 1].y) / 2}`;
    d += ` L${p[N].x} ${p[N].y}`;
    const line = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    el('path', { ...line, stroke: 'rgba(0,0,0,.35)', 'stroke-width': c.w + 3, transform: 'translate(0 2)' }, svg);
    el('path', { ...line, stroke: c.color, 'stroke-width': c.w }, svg);
    el('path', { ...line, stroke: 'rgba(255,255,255,.28)', 'stroke-width': Math.max(1, c.w * .3), transform: `translate(${-c.w * .2} ${-c.w * .2})` }, svg);
    // Вилка вдоль корда, носиком наружу: RJ45 — колпачок цвета корда, прозрачный корпус, золотые контакты, защёлка;
    // оптика — LC: синий корпус и белый керамический наконечник.
    const a = Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x) * 180 / Math.PI;
    const g = el('g', { transform: `translate(${p[0].x} ${p[0].y}) rotate(${a})` }, svg);
    if (r.type === 'wan' || r.type === 'uplink') {
      el('rect', { x: -10, y: -2.5, width: 8, height: 5, rx: 1.5, fill: c.color, stroke: 'rgba(0,0,0,.35)' }, g);
      el('rect', { x: -3, y: -4, width: 8, height: 8, rx: 1.5, fill: '#2f6fd0', stroke: 'rgba(0,0,0,.45)' }, g);
      el('rect', { x: 5, y: -1.4, width: 4, height: 2.8, rx: 1, fill: '#ece8dc' }, g);
    } else {
      el('rect', { x: -9, y: -3, width: 7, height: 6, rx: 2, fill: c.color, stroke: 'rgba(0,0,0,.35)' }, g);
      el('rect', { x: -1, y: -6, width: 6, height: 1.6, rx: .8, fill: 'rgba(214,224,233,.85)' }, g);
      el('rect', { x: -3, y: -4.5, width: 10, height: 9, rx: 1.5, fill: 'rgba(214,224,233,.82)', stroke: 'rgba(0,0,0,.45)' }, g);
      el('rect', { x: 4.6, y: -3.5, width: 1.8, height: 7, fill: '#d6b04a' }, g);
    }
    // Широкая невидимая зона, чтобы попасть пальцем.
    el('circle', { cx: 0, cy: 0, r: 16, class: 'hit', 'data-key': c.key }, g);
  }

  function tick() {
    let motion = 0;
    for (const r of ropes.values()) motion += step(r);
    draw();
    calm = motion < 0.08 && !drag ? calm + 1 : 0;
    raf = calm > 45 ? 0 : requestAnimationFrame(tick);
  }

  function wake() {
    calm = 0;
    if (!raf && svg) raf = requestAnimationFrame(tick);
  }

  // ---------- руки ----------
  function local(e) {
    const R = room.getBoundingClientRect();
    return { x: e.clientX - R.left, y: e.clientY - R.top };
  }

  function grab(e) {
    const k = e.target?.dataset?.key;
    if (!k || !cords.some((c) => c.key === k && c.grab)) return;
    e.preventDefault();
    const at = local(e);
    drag = { key: k, ...at, from: at, wasOut: pulled(k), moved: false };
    addEventListener('pointermove', move);
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);
    wake();
  }

  function move(e) {
    if (!drag) return;
    const at = local(e);
    drag.x = at.x; drag.y = at.y;
    if (!drag.moved && dist(at, drag.from) > 6) {
      drag.moved = true;
      if (!pulled(drag.key)) pull(drag.key);
    }
    wake();
  }

  function release() {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', release);
    removeEventListener('pointercancel', release);
    if (!drag) return;
    const k = drag.key, r = ropes.get(k), c = cords.find((x) => x.key === k);
    if (!drag.moved) {
      // Тап: воткнутый — выдернуть, висящий — воткнуть обратно.
      if (drag.wasOut) plug(k); else pull(k);
    } else if (r && c && dist(r.pts[0], c.at) < 22) {
      plug(k);
    }
    drag = null;
    wake();
  }

  // Кто ещё следит за кордами: событие на каждый выдернутый и воткнутый (detail.key — ключ корда, detail.on).
  const told = (key, on) => document.dispatchEvent(new CustomEvent('rack:link', { detail: { key, on } }));

  // Выдернул или воткнул — app.js сразу перерисует разводку (без хвоста или с ним), отсюда — свет и экраны.
  function pull(k) {
    const c = cords.find((x) => x.key === k);
    if (!c) return;
    out[here() + '/' + k] = 1;
    save();
    ropes.set(k, fresh(c));
    told(k, false);
    document.dispatchEvent(new Event('rack:layout'));
  }

  function plug(k) {
    delete out[here() + '/' + k];
    save();
    ropes.delete(k);
    told(k, true);
    document.dispatchEvent(new Event('rack:layout'));
  }

  // ---------- события ----------
  // app.js рисует разводку: какие корды этой стойки выдернуты.
  document.addEventListener('rack:pulled', (e) => {
    const pre = here() + '/';
    for (const k in out) if (k.startsWith(pre)) e.detail.add(k.slice(pre.length));
  });
  // Раскладку стойки считает app.js; корды — сразу после неё и в том же кадре.
  document.addEventListener('rack:laidout', relayout);
  // htmx подменил юнит (опрос, гостевая): новый сразу без связи, если её нет; на settle htmx возвращает новому элементу
  // class из ответа — ещё раз.
  document.addEventListener('htmx:afterSwap', sync);
  document.addEventListener('htmx:afterSettle', sync);
  // Юнит погас или загрузился (power.js): лампа его порта; вернулись коммутатор или роутер — пропущенные обновления.
  // Гаснущий юнит говорит об этом до того, как станет .off, поэтому — когда power.js закончит (до отрисовки).
  document.addEventListener('rack:unit', () => queueMicrotask(sync));
  // Новая стойка (aisle.js): едет — значит, провода ещё протянут, и до тех пор все без связи.
  document.addEventListener('rack:swap', (e) => {
    timers.forEach(clearTimeout);
    timers = [];
    waiting.clear();
    boot = !!e.detail && !e.detail.quiet && !reduce.matches;
    sync();
  });
  // Провода протягиваются (app.js): каждый юнит выходит в сеть, когда вилка его корда встала в порт. Без протяжки
  // (переход прервали, анимации выключены) — все сразу.
  document.addEventListener('rack:drawing', (e) => {
    timers.forEach(clearTimeout);
    timers = [];
    waiting.clear();
    const d = e.detail;
    if (boot && d) {
      for (const c of cords) {
        waiting.add(c.key);
        timers.push(setTimeout(() => { waiting.delete(c.key); sync(); }, d.lag + c.wire * d.step));
      }
    }
    boot = false;
    sync();
  });
})();
