// Питание стойки. У каждого активного юнита свой кабель от вертикального PDU на правой рейке.
// Вилку можно вытащить мышкой или пальцем: кабель повиснет и закачается (верёвка на Verlet),
// юнит погаснет. Поднести вилку к разъёму (или тапнуть по ней) — воткнётся, юнит загорится.
// Кнопка на ИБП гасит всю стойку и загружает её обратно. Шнур самого ИБП тоже выдёргивается из розетки:
// ИБП уходит на батарею (красный свет в зале, ЖК мигает, заряд тает), батарея села — гаснет всё; воткнул —
// заряжается и стойка загружается. Состояние только у посетителя (localStorage).
// Без JS всего этого нет: юниты просто горят и работают.
(() => {
  // Юниты с питанием; патч-панель и заглушки с наклейками пассивные, как в жизни. Несколько одинаковых юнитов
  // (контейнеры в /lab) различаются атрибутом data-power.
  const POWERED = ['mgmt', 'srv', 'media', 'mon', 'disks', 'log', 'sw', 'kvm', 'pve'];
  const NS = 'http://www.w3.org/2000/svg';
  const COLOR = '#4a4f57';
  const PLUG = '#1b1d20';
  const MAINS = '#26292e';       // шнур ИБП
  const DRAIN = 90, CHARGE = 30; // секунд на разрядку и зарядку батареи (ускорено, чтобы было видно)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  const store = {
    get() { try { return JSON.parse(localStorage.getItem('rack-power') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('rack-power', JSON.stringify(v)); } catch {} },
  };
  const saved = store.get();
  const state = {
    off: !!saved.off, unplugged: saved.unplugged || {},
    mains: saved.mains !== false,                                   // ИБП в розетке
    charge: typeof saved.charge === 'number' ? saved.charge : null, // % батареи, пока идёт своя симуляция
  };
  const save = () => store.set(state);

  const ropes = new Map(); // ключ юнита → верёвка
  let room = null, svg = null, raf = 0, calm = 0, drag = null;

  const keyOf = (u) => u.dataset.power || POWERED.find((k) => u.classList.contains(k));
  const units = () => [...document.querySelectorAll('#rack-body > .u')].filter(keyOf);
  const unitBy = (k) => units().find((u) => keyOf(u) === k);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---------- юниты: разъёмы и свет ----------
  function powered(k) { return !state.off && !state.unplugged[k] && !dead(); }

  function paint(u, k, boot) {
    const on = powered(k);
    if (on && u.classList.contains('off') && boot) {
      u.classList.add('booting');
      setTimeout(() => u.classList.remove('booting'), 700);
    }
    u.classList.toggle('off', !on);
  }

  function ensureDom() {
    room = document.getElementById('room');
    if (!room || !document.getElementById('rack-body')) return false;
    svg = document.getElementById('power');
    if (!svg) {
      svg = el('svg', { id: 'power', class: 'cables power', 'aria-hidden': 'true' }, room);
      svg.addEventListener('pointerdown', grab);
    }
    units().forEach((u) => {
      if (!u.querySelector(':scope > .psu')) {
        const s = document.createElement('span');
        s.className = 'psu';
        u.classList.add('has-psu');
        s.setAttribute('aria-hidden', 'true');
        u.appendChild(s);
      }
      paint(u, keyOf(u), false);
    });
    const rack = document.getElementById('rack');
    if (rack) rack.classList.toggle('powered-off', state.off || dead());
    wireButton();
    return true;
  }

  // Вся стойка погасла или загорелась: кнопкой на ИБП или села батарея (why: button, battery).
  // Шнур ИБП из розетки сам ничего не гасит — батарея ещё держит.
  function dark(on, why) { document.dispatchEvent(new CustomEvent('rack:power', { detail: { on, why } })); }

  // ---------- ИБП на батарее ----------
  // Пока шнур в розетке и батарея полна, ЖК ИБП показывает настоящие данные (NUT). Иначе — своя симуляция.
  let lcdReal = null, lightReal = null, alarmReal = false, timer = 0, wasDead = null; // null: ещё не смотрели
  const upsUnit = () => document.querySelector('#rack-body > .ups');
  const upsLcd = () => document.querySelector('#rack-body > .ups .lcd');
  const full = () => { const v = parseInt(upsLcd()?.dataset.charge, 10); return v > 0 ? v : 100; };
  function dead() { return !state.mains && state.charge !== null && state.charge <= 0; }

  function battery() {
    const lcd = upsLcd();
    if (!lcd || !room) return;
    if (lcdReal === null) {
      lcdReal = [...lcd.childNodes].map((n) => n.cloneNode(true));
      lightReal = room.dataset.light;
      alarmReal = lcd.classList.contains('alarm');
    }
    const rack = document.getElementById('rack');
    if (state.mains && (state.charge === null || state.charge >= full())) {
      if (state.charge !== null) { state.charge = null; save(); }
      clearInterval(timer); timer = 0;
      lcd.replaceChildren(...lcdReal.map((n) => n.cloneNode(true)));
      lcd.classList.toggle('alarm', alarmReal);
      room.dataset.light = lightReal;
      upsUnit()?.classList.remove('off');
      rack?.classList.toggle('powered-off', state.off);
      return;
    }
    const isDead = dead();
    room.dataset.light = state.mains ? lightReal : 'battery';
    lcd.classList.toggle('alarm', !state.mains && !isDead);
    upsUnit()?.classList.toggle('off', isDead);
    rack?.classList.toggle('powered-off', state.off || isDead);
    // ЖК: батарейка, «на батарее · 73%» или «заряжается · 40%», сколько осталось.
    const pc = Math.round(state.charge), d = lcd.dataset;
    const bars = document.createElement('span');
    bars.className = 'batt' + (pc <= 20 ? ' low' : '');
    bars.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('i');
      if (i >= Math.ceil(pc / 20)) b.className = 'e';
      bars.appendChild(b);
    }
    const text = document.createElement('span');
    text.append((state.mains ? d.charging : d.battery) + ' · ' + pc + '%', document.createElement('br'));
    const sub = document.createElement('span');
    sub.className = 'd';
    sub.textContent = state.mains ? d.mains : (d.left || '%d').replace('%d', Math.ceil(state.charge / 100 * DRAIN));
    text.append(sub);
    lcd.replaceChildren(bars, text);
    // Батарея села — всё гаснет; вернулось питание — юниты загружаются сверху вниз. Сообщить только о смене
    // на глазах у посетителя, не о состоянии, с которым страница открылась.
    if (isDead !== wasDead) {
      units().forEach((u, i) => setTimeout(() => paint(u, keyOf(u), true), isDead || reduce.matches ? 0 : 110 * i));
      if (wasDead !== null && !state.off) dark(!isDead, 'battery');
      wasDead = isDead;
    }
  }

  function runBattery() {
    if (timer) { battery(); return; }
    if (state.charge === null) state.charge = full();
    let n = 0;
    timer = setInterval(() => {
      const dt = 0.5;
      state.charge = state.mains ? Math.min(full(), state.charge + 100 / CHARGE * dt) : Math.max(0, state.charge - 100 / DRAIN * dt);
      if (++n % 4 === 0 || state.charge <= 0) save();
      if (!state.mains && state.charge <= 0) { clearInterval(timer); timer = 0; save(); }
      battery();
    }, 500);
    battery();
  }

  // ---------- кнопка на ИБП ----------
  function wireButton() {
    const b = document.querySelector('.ups .pwr');
    if (!b || b.dataset.wired) return;
    b.dataset.wired = '1';
    b.hidden = false;
    b.setAttribute('aria-pressed', String(!state.off));
    b.addEventListener('click', () => {
      const wasOn = !state.off && !dead();
      state.off = !state.off;
      save();
      b.setAttribute('aria-pressed', String(!state.off));
      document.getElementById('rack').classList.toggle('powered-off', state.off || dead());
      if (wasOn !== (!state.off && !dead())) dark(!wasOn, 'button');
      if (state.off) {
        units().forEach((u) => paint(u, keyOf(u), false));
        return;
      }
      // Загрузка сверху вниз, юнит за юнитом.
      units().forEach((u, i) => setTimeout(() => paint(u, keyOf(u), true), reduce.matches ? 0 : 110 * i));
    });
  }

  // ---------- геометрия ----------
  function anchors(u) {
    const R = room.getBoundingClientRect();
    const rack = document.getElementById('rack').getBoundingClientRect();
    const sock = u.querySelector(':scope > .psu').getBoundingClientRect();
    const railW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail-w')) || 34;
    const s = { x: sock.left - R.left + sock.width / 2, y: sock.top - R.top + sock.height / 2 };
    // Розетка PDU на правой рейке, чуть ниже разъёма юнита.
    const o = { x: rack.right - R.left - railW / 2, y: s.y + 8 };
    return { s, o };
  }

  // Верёвка из точек: концы — вилка (points[0]) и розетка PDU (последняя точка, всегда закреплена).
  function rest(a, b, len, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t + Math.sin(Math.PI * t) * len * 0.32;
      pts.push({ x, y, px: x, py: y });
    }
    return pts;
  }

  // Шнур ИБП: закреплён внизу ИБП (outlet — тут неподвижный конец), вилка — в розетке на стене слева от стойки
  // или, если места нет, на полу (socket). Розетка и подпись «220 В» рисуются вместе с ним.
  function mainsAnchors(ups) {
    const R = room.getBoundingClientRect();
    const rk = document.getElementById('rack').getBoundingClientRect();
    const u = ups.getBoundingClientRect();
    const railW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail-w')) || 34;
    const x0 = rk.left - R.left, b0 = rk.bottom - R.top;
    const wall = x0 > 110;
    const ox = wall ? x0 - 62 : x0 + railW + 120, oy = wall ? b0 - 40 : b0 + 34 + 26;
    return { wall, s: { x: ox, y: oy + 4 }, o: { x: x0 + railW + 46, y: u.bottom - R.top - 6 } };
  }

  function relayout() {
    if (!ensureDom()) return;
    const R = room.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${R.width} ${R.height}`);
    const seen = new Set();
    const ups = upsUnit();
    if (ups) {
      seen.add('mains');
      const { wall, s, o } = mainsAnchors(ups);
      let r = ropes.get('mains');
      if (!r) {
        const len = dist(s, o) * 1.25 + 40;
        r = { key: 'mains', mains: true, n: 14, len, seg: len / 14, socket: s, outlet: o, pts: rest(s, o, len, 14), plugged: state.mains };
        ropes.set('mains', r);
      } else {
        const dx = o.x - r.outlet.x, dy = o.y - r.outlet.y;
        r.socket = s;
        r.outlet = o;
        if (r.plugged && drag?.key !== 'mains') r.pts = rest(s, o, r.len, r.n);
        else r.pts.forEach((p) => { p.x += dx; p.y += dy; p.px += dx; p.py += dy; });
      }
      r.wall = wall;
      if (!state.mains || state.charge !== null) runBattery();
    }
    units().forEach((u) => {
      const k = keyOf(u);
      seen.add(k);
      const { s, o } = anchors(u);
      let r = ropes.get(k);
      if (!r) {
        const len = Math.max(60, dist(s, o) * 1.6);
        r = { key: k, n: 12, len, seg: len / 12, socket: s, outlet: o, pts: rest(s, o, len, 12) };
        r.plugged = !state.unplugged[k];
        ropes.set(k, r);
      } else {
        const dx = o.x - r.outlet.x, dy = o.y - r.outlet.y;
        r.socket = s;
        r.outlet = o;
        if (r.plugged && drag?.key !== k) {
          r.pts = rest(s, o, r.len, r.n);
        } else {
          r.pts.forEach((p) => { p.x += dx; p.y += dy; p.px += dx; p.py += dy; });
        }
      }
    });
    for (const k of ropes.keys()) if (!seen.has(k)) ropes.delete(k);
    wake();
  }

  // ---------- физика ----------
  function step(r) {
    const g = 0.42;                           // гравитация, px за кадр²
    const damp = reduce.matches ? 0.8 : 0.985; // без анимаций — быстро успокаивается
    const last = r.pts.length - 1;
    const pinned = (i) => i === last || (i === 0 && (r.plugged || drag?.key === r.key));
    let motion = 0;
    r.pts.forEach((p, i) => {
      if (pinned(i)) return;
      const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + g;
      motion += Math.abs(vx) + Math.abs(vy);
    });
    const head = r.pts[0];
    if (r.plugged) {
      head.x = head.px = r.socket.x; head.y = head.py = r.socket.y;
    } else if (drag?.key === r.key) {
      // Вилка за пальцем, но не дальше, чем пускает кабель.
      let tx = drag.x, ty = drag.y;
      const d = Math.hypot(tx - r.outlet.x, ty - r.outlet.y), max = r.len * 0.97;
      if (d > max) { tx = r.outlet.x + (tx - r.outlet.x) * max / d; ty = r.outlet.y + (ty - r.outlet.y) * max / d; }
      head.px = head.x; head.py = head.y;
      head.x = tx; head.y = ty;
      motion += 1;
    }
    const tail = r.pts[last];
    tail.x = tail.px = r.outlet.x; tail.y = tail.py = r.outlet.y;
    for (let k = 0; k < 16; k++) {
      for (let i = 0; i < last; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001;
        const diff = (d - r.seg) / d;
        const pa = pinned(i), pb = pinned(i + 1);
        if (pa && pb) continue;
        const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
        a.x += dx * diff * wa; a.y += dy * diff * wa;
        b.x -= dx * diff * wb; b.y -= dy * diff * wb;
      }
    }
    return motion;
  }

  // ---------- рисование ----------
  function drawMains(r) {
    const p = r.pts, s = r.socket;
    // Розетка на стене (или на полу) и подпись.
    el('rect', { x: s.x - 16, y: s.y - 22, width: 32, height: 36, rx: 5, class: 'outlet' }, svg);
    el('circle', { cx: s.x - 6, cy: s.y - 8, r: 2.6, class: 'outlet-hole' }, svg);
    el('circle', { cx: s.x + 6, cy: s.y - 8, r: 2.6, class: 'outlet-hole' }, svg);
    const label = document.getElementById('cables')?.dataset.power;
    if (r.wall && label) el('text', { x: s.x - 22, y: s.y - 30, class: 'lbl' }, svg).textContent = label;
    let d = `M${p[0].x} ${p[0].y}`;
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      d += ` Q${p[i].x} ${p[i].y} ${mx} ${my}`;
    }
    d += ` L${p[p.length - 1].x} ${p[p.length - 1].y}`;
    const line = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    el('path', { ...line, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 9, transform: 'translate(0 2)' }, svg);
    el('path', { ...line, stroke: MAINS, 'stroke-width': 6 }, svg);
    el('path', { ...line, stroke: 'rgba(255,255,255,.28)', 'stroke-width': 1.6, transform: 'translate(-1.2 -1.2)' }, svg);
    // Вилка: в розетке — корпус поверх неё, кабель уходит вниз; выдернута — штыри наружу, вдоль кабеля.
    const a = r.plugged ? -Math.PI / 2 : Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x);
    const g = el('g', { transform: `translate(${p[0].x} ${p[0].y}) rotate(${a * 180 / Math.PI})` }, svg);
    el('rect', { x: -11, y: -9, width: 18, height: 18, rx: 4, fill: MAINS, stroke: 'rgba(0,0,0,.5)' }, g);
    if (!r.plugged) {
      el('rect', { x: 7, y: -6, width: 7, height: 3, rx: 1.5, fill: '#b9bec5' }, g);
      el('rect', { x: 7, y: 3, width: 7, height: 3, rx: 1.5, fill: '#b9bec5' }, g);
    }
    el('circle', { cx: 0, cy: 0, r: 18, class: 'hit', 'data-key': r.key }, g);
  }

  function draw() {
    svg.replaceChildren();
    for (const r of ropes.values()) {
      if (r.mains) { drawMains(r); continue; }
      const p = r.pts;
      // Розетка PDU.
      el('rect', { x: r.outlet.x - 6, y: r.outlet.y - 5, width: 12, height: 10, rx: 2, fill: '#0c0d0f', stroke: '#3b3f46' }, svg);
      let d = `M${p[0].x} ${p[0].y}`;
      for (let i = 1; i < p.length - 1; i++) {
        const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
        d += ` Q${p[i].x} ${p[i].y} ${mx} ${my}`;
      }
      d += ` L${p[p.length - 1].x} ${p[p.length - 1].y}`;
      const line = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      el('path', { ...line, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 7, transform: 'translate(0 2)' }, svg);
      el('path', { ...line, stroke: COLOR, 'stroke-width': 4.5 }, svg);
      el('path', { ...line, stroke: 'rgba(255,255,255,.22)', 'stroke-width': 1.2, transform: 'translate(-1 -1)' }, svg);
      // Вилка: повёрнута вдоль кабеля; когда воткнута — смотрит в разъём.
      const a = r.plugged ? Math.PI : Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x);
      const g = el('g', { transform: `translate(${p[0].x} ${p[0].y}) rotate(${a * 180 / Math.PI})` }, svg);
      el('rect', { x: -9, y: -6, width: 14, height: 12, rx: 2.5, fill: PLUG, stroke: 'rgba(255,255,255,.25)' }, g);
      el('rect', { x: 3, y: -3, width: 3, height: 6, rx: 1, fill: '#9aa0a8' }, g);
      // Широкая невидимая зона, чтобы попасть пальцем.
      el('circle', { cx: 0, cy: 0, r: 16, class: 'hit', 'data-key': r.key }, g);
    }
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
    const r = k && ropes.get(k);
    if (!r) return;
    e.preventDefault();
    const at = local(e);
    drag = { key: k, ...at, from: at, wasPlugged: r.plugged, moved: false };
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
      const r = ropes.get(drag.key);
      if (r.plugged) unplug(r);
    }
    wake();
  }

  function release() {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', release);
    removeEventListener('pointercancel', release);
    if (!drag) return;
    const r = ropes.get(drag.key);
    if (r) {
      if (!drag.moved) {
        // Тап: воткнутую — вытащить, висящую — воткнуть обратно.
        if (drag.wasPlugged) unplug(r); else plug(r);
      } else if (dist(r.pts[0], r.socket) < (r.mains ? 30 : 22)) {
        plug(r);
      }
    }
    drag = null;
    wake();
  }

  // Кто ещё следит за вилками (assets/js/sticker.js): событие на каждую выдернутую и воткнутую.
  const told = (key, on) => document.dispatchEvent(new CustomEvent('rack:plug', { detail: { key, on } }));

  function unplug(r) {
    r.plugged = false;
    told(r.key, false);
    if (r.mains) { state.mains = false; save(); runBattery(); return; }
    state.unplugged[r.key] = true;
    save();
    const u = unitBy(r.key);
    if (u) paint(u, r.key, false);
  }

  function plug(r) {
    r.plugged = true;
    told(r.key, true);
    if (r.mains) { state.mains = true; save(); runBattery(); return; }
    delete state.unplugged[r.key];
    save();
    const u = unitBy(r.key);
    if (u) paint(u, r.key, true);
  }

  // Раскладку стойки считает app.js; провода — после неё.
  document.addEventListener('rack:laidout', () => requestAnimationFrame(relayout));
})();
