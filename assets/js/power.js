// The rack's power. Every unit with its own supply (data-power) has a cable from the PDU; a guest (data-host) is on
// while its host is. A plug pulled out hangs (a Verlet rope) and the unit goes dark; brought back (or tapped) it boots.
// The UPS's button turns the rack off and on; its own cord pulled from the wall puts it on battery, which runs down by
// the clock, even while the visitor is at another rack. The hall's breaker cuts every rack's socket. The state is the
// visitor's (localStorage, half an hour). A dark unit is inert; rack:unit tells its insides.
(() => {
  const COLOR = '#4a4f57';
  const PLUG = '#1b1d20';
  const MAINS = '#26292e';       // the UPS's cord
  const DRAIN = 90, CHARGE = 30; // seconds to drain and to charge the battery (fast, so it shows)
  const { here, dist, motion } = Rack;

  // { racks: { <rack id>: { off, unplugged, mains, charge, at } }, breaker, breakerAt }, for Rack.TOY_TTL (rack.js).
  const store = Rack.toyStore('rack-power', () => ({}));
  const saved = store.get();
  const all = { racks: saved.racks || {}, breaker: saved.breaker !== false, breakerAt: saved.breakerAt || 0 };
  const save = () => store.set(all);
  // A rack's power: off, the UPS's button; unplugged, the units' pulled plugs; mains, the UPS's cord in the socket;
  // charge, the battery's % while the simulation runs (null: full and on mains); at, when charge was counted.
  function rackState(id) {
    const r = (all.racks[id] ||= {});
    r.off = !!r.off;
    r.unplugged ||= {};
    r.mains = r.mains !== false;
    if (typeof r.charge !== 'number') r.charge = null;
    return r;
  }
  // Whether this rack's UPS has current at its socket: the cord in and the breaker on.
  const fed = (r) => r.mains && all.breaker;
  // The charge at now: while the rack is out of sight its battery drains (or charges) as it would in view. The UPS went
  // on battery when the current went: its cord pulled (then charge is set already) or the breaker off (breakerAt).
  function settle(r, now) {
    if (r.charge === null) {
      if (fed(r)) return;
      r.charge = 100;
      r.at = all.breakerAt || now;
    }
    const dt = Math.max(0, (now - (r.at || now)) / 1000);
    r.charge = fed(r) ? Math.min(100, r.charge + 100 / CHARGE * dt) : Math.max(0, r.charge - 100 / DRAIN * dt);
    if (fed(r) && r.charge >= 100) r.charge = null;
    r.at = now;
  }
  let state = null, stateId = null; // the power of the rack in the room now (useRack)
  // The UPS's real LCD and hall light (from site-api) before the battery simulation replaces them; the battery's
  // timer; whether the rack was dead at the last look (null: not looked yet). Reset by useRack for each rack.
  let lcdReal = null, lightReal = null, alarmReal = false, timer = 0, wasDead = null;
  let testing = false; // the UPS self-test is running

  const ropes = new Map(); // unit key → its cable (rope, rack.js), with its SVG (view) once drawn
  let probing = null;      // the cable under the mouse (the cable tester)
  let room = null, svg = null, hand = null;
  let kick = 0; // the rack has arrived: which way the next layout swings the cables (1, -1)

  const keyOf = (u) => Rack.keyOf(u);
  const el = Rack.svg;
  const body = () => document.getElementById('rack-body');
  const units = () => Rack.units(body(), '[data-power]');                   // the ones with a supply, a plug and a cable
  const powers = () => Rack.units(body(), ':is([data-power], [data-host])'); // and the ones running on them: all that can be dark
  const unitBy = (k) => Rack.unitOf(body(), k);
  const held = (r) => hand?.of(r.key) || null;

  // Another rack in the room (or the page just opened): its power, counted up to now. The previous rack's battery is
  // counted and saved, its timer stopped; the ropes are built anew from the new state.
  function useRack() {
    const id = here();
    if (state && id === stateId) return;
    const now = Date.now();
    if (state) settle(state, now);
    clearInterval(timer); timer = 0; wasDead = null;
    // The new rack's real UPS LCD and hall light are its own; keep them before the simulation replaces them.
    lcdReal = lightReal = null;
    for (const r of ropes.values()) r.view?.g.remove();
    ropes.clear();
    stateId = id;
    state = rackState(id);
    settle(state, now);
    save();
  }

  // ---------- units: inlets and light ----------
  // A unit with a supply has power while the UPS gives it and its plug is in; a guest while its host is on and done booting.
  function powered(k) {
    const h = unitBy(k)?.dataset.host;
    if (h) return powered(h) && !queued.has(h);
    return !state.off && !state.unplugged[k] && !dead();
  }

  // A dark unit and its drawer are inert: no click, hover, focus or screen reader. Typed text and drawings stay.
  function paint(u, k, boot) {
    const on = powered(k) && !queued.has(k);
    const box = u.nextElementSibling?.classList.contains('drawer') ? u.nextElementSibling : null;
    const was = !u.hasAttribute('inert');
    if (on && u.classList.contains('off') && boot) {
      u.classList.add('booting');
      setTimeout(() => u.classList.remove('booting'), 700);
    }
    if (was && !on) shutdown(u, k, box);
    u.classList.toggle('off', !on);
    u.toggleAttribute('inert', !on);
    if (box) {
      box.classList.toggle('off', !on);
      box.toggleAttribute('inert', !on);
    }
    if (!was && on) u.dispatchEvent(new CustomEvent('rack:unit', { bubbles: true, detail: { key: k, on } }));
  }

  // Before a unit turns inert: tell its insides (the drawing pad ends its stroke, leaves full screen), close its dialogs
  // (a modal inside an inert unit would lock the page) and move the focus out.
  function shutdown(u, k, box) {
    u.dispatchEvent(new CustomEvent('rack:unit', { bubbles: true, detail: { key: k, on: false } }));
    [u, box].forEach((n) => n?.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    const f = document.activeElement;
    if (f && f !== document.body && (u.contains(f) || box?.contains(f))) park();
  }

  // Where the focus goes from a dark unit: not to a button (a space typed on would press it) but to the UPS itself,
  // which shows what is up with the power, the next Tab reaching its button. No UPS: the rack. tabindex only for now.
  function park() {
    const t = upsUnit() || document.getElementById('rack');
    if (!t) { document.activeElement.blur(); return; }
    if (!t.hasAttribute('tabindex')) {
      t.tabIndex = -1;
      t.addEventListener('blur', () => t.removeAttribute('tabindex'), { once: true });
    }
    t.focus({ preventScroll: true });
  }

  // A host's guests follow it: dark with it at once; when it is back they start one after another, as a host starts its
  // containers once it has booted.
  function guests(k, boot) {
    Rack.guestsOf(body(), k).forEach((g, i) => {
      const gk = keyOf(g);
      if (!boot || !powered(k) || queued.has(k)) { paint(g, gk, false); return; }
      queued.add(gk);
      paint(g, gk, false);
      setTimeout(() => {
        queued.delete(gk);
        const cur = unitBy(gk);
        if (cur) paint(cur, gk, true);
      }, motion() ? 700 + 160 * i : 0);
    });
  }

  // Boot from top to bottom, unit after unit. Until its turn a unit stays dark and cannot be pressed, even if someone
  // else redraws it (the layout, an htmx response). Swapped by htmx: the new element boots.
  const queued = new Set();
  function bootAll() {
    powers().forEach((u, i) => {
      const k = keyOf(u);
      if (u.classList.contains('off')) queued.add(k);
      setTimeout(() => {
        queued.delete(k);
        const cur = u.isConnected ? u : unitBy(k);
        if (cur) paint(cur, k, true);
      }, motion() ? 110 * i : 0);
    });
  }

  function ensureDom() {
    room = document.getElementById('room');
    if (!room || !document.getElementById('rack-body')) return false;
    useRack();
    svg = document.getElementById('power');
    if (!svg) {
      svg = el('svg', { id: 'power', class: 'cables power', 'aria-hidden': 'true' }, room);
      hand = Rack.hand(svg, () => room, {
        take: (k) => { const r = ropes.get(k); return r && { plugged: r.plugged }; },
        pull: (k) => { const r = ropes.get(k); if (r?.plugged) unplug(r); },
        // Let go near the socket — it goes in; a tap puts a plugged one out and a hanging one in.
        drop: (k) => { const r = ropes.get(k); if (r && dist(r.pts[0], r.socket) < (r.mains ? 30 : 22)) plug(r); },
        tap: (k, was) => { const r = ropes.get(k); if (r) { if (was.plugged) unplug(r); else plug(r); } },
        moved: wake,
      });
      for (const r of ropes.values()) r.view = null; // a new room: the cables are drawn anew in it
    }
    const inlet = (u) => {
      if (u.querySelector(':scope > .psu')) return;
      const s = document.createElement('span');
      s.className = 'psu';
      s.setAttribute('aria-hidden', 'true');
      u.appendChild(s);
    };
    units().forEach((u) => {
      inlet(u);
      u.classList.add('has-psu'); // after htmx too: on settle it restores the unit's class from the response
    });
    // The UPS has one too, low on its left (the wall socket's side): its own cord is plugged in there (mainsAnchors).
    if (upsUnit()) inlet(upsUnit());
    powers().forEach((u) => paint(u, keyOf(u), false));
    const rack = document.getElementById('rack');
    if (rack) rack.classList.toggle('powered-off', state.off || dead());
    wireButton();
    wireTest();
    breaker();
    switcher();
    neighbours();
    if (fed(state) && state.charge === null && !testing) room.dataset.light = lamp();
    return true;
  }

  // The whole rack went dark or came on: the UPS's button or the battery (why: button, battery). The UPS's cord out of
  // the socket turns nothing off by itself: the battery still holds.
  function dark(on, why) { document.dispatchEvent(new CustomEvent('rack:power', { detail: { on, why } })); }

  // ---------- the UPS on battery ----------
  // While the cord is in and the battery full, the UPS's LCD shows the real data (NUT). Otherwise the simulation.

  // The light switch: auto (by the site's clock) or day, evening, night by hand; without current the emergency light.
  const MODES = ['auto', 'day', 'evening', 'night'];
  let mode = MODES.includes(Rack.store.get('hall-light')) ? Rack.store.get('hall-light') : 'auto';
  function lamp() {
    if (lightReal === null) lightReal = room.dataset.light;
    return mode === 'auto' || lightReal === 'battery' ? lightReal : mode;
  }
  const upsUnit = () => Rack.roleOf(body(), 'ups');
  const upsLcd = () => upsUnit()?.querySelector('.lcd');
  const full = () => { const v = parseInt(upsLcd()?.dataset.charge, 10); return v > 0 ? v : 100; };
  // The battery is empty, or the rack has no UPS at all (the row's blank racks): then it lives only while the socket has current.
  function dead() { return upsUnit() ? dying(state) : !fed(state); }
  const dying = (r) => !fed(r) && r.charge !== null && r.charge <= 0;

  // The neighbour racks in the hall (.nb[data-rack]) go dark when that rack is off or its battery is empty.
  function neighbours() {
    const now = Date.now();
    document.querySelectorAll('.hall .nb[data-rack]').forEach((nb) => {
      const r = rackState(nb.dataset.rack);
      settle(r, now);
      nb.classList.toggle('dark', r.off || ('noups' in nb.dataset ? !fed(r) : dying(r)));
    });
  }

  // The UPS's real LCD (site-api's, from NUT) is kept before the simulation or the self-test writes on it, and put
  // back when they are done; on a new rack (rack:swap) its own.
  function keepReal(lcd) {
    if (lcdReal !== null) return;
    lcdReal = [...lcd.childNodes].map((n) => n.cloneNode(true));
    alarmReal = lcd.classList.contains('alarm');
  }
  function restoreReal(lcd) {
    lcd.replaceChildren(...lcdReal.map((n) => n.cloneNode(true)));
    lcd.classList.toggle('alarm', alarmReal);
  }
  // The battery on the LCD: five segments for pc %, the empty ones .e; low, red.
  function batt(pc, low) {
    const bars = document.createElement('span');
    bars.className = 'batt' + (low ? ' low' : '');
    bars.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('i');
      if (i >= Math.ceil(pc / 20)) b.className = 'e';
      bars.appendChild(b);
    }
    return bars;
  }

  // A rack without a UPS (the row's blank racks) lives off one too: hall light and units as everywhere, only no LCD.
  function battery() {
    const lcd = upsLcd();
    if (!room || testing) return;
    // The real LCD and light, until the simulation replaces them; on a new rack (rack:swap) again.
    if (lightReal === null) lightReal = room.dataset.light;
    if (lcd) keepReal(lcd);
    const rack = document.getElementById('rack');
    if (fed(state) && (state.charge === null || state.charge >= full())) {
      if (state.charge !== null) { state.charge = null; save(); }
      clearInterval(timer); timer = 0;
      if (lcd) restoreReal(lcd);
      room.dataset.light = lamp();
      upsUnit()?.classList.remove('off');
      rack?.classList.toggle('powered-off', state.off);
      neighbours();
      return;
    }
    const isDead = dead();
    room.dataset.light = fed(state) ? lamp() : 'battery';
    upsUnit()?.classList.toggle('off', isDead);
    rack?.classList.toggle('powered-off', state.off || isDead);
    if (lcd) screen(lcd, isDead);
    neighbours();
    // The battery is empty: everything goes dark; power is back: the units boot from top to bottom. Report only a
    // change the visitor sees, not the state the page opened with.
    if (isDead !== wasDead) {
      if (isDead) powers().forEach((u) => paint(u, keyOf(u), false));
      else bootAll();
      if (wasDead !== null && !state.off) dark(!isDead, 'battery');
      wasDead = isDead;
    }
  }

  // The LCD: the battery, "on battery · 73%" or "charging · 40%", and the time left.
  function screen(lcd, isDead) {
    lcd.classList.toggle('alarm', !fed(state) && !isDead);
    const pc = Math.round(state.charge), d = lcd.dataset;
    const text = document.createElement('span');
    text.append((fed(state) ? d.charging : d.battery) + ' · ' + pc + '%', document.createElement('br'));
    const sub = document.createElement('span');
    sub.className = 'd';
    sub.textContent = fed(state) ? d.mains : (d.left || '%d').replace('%d', Math.ceil(state.charge / 100 * DRAIN));
    text.append(sub);
    lcd.replaceChildren(batt(pc, pc <= 20), text);
  }

  function runBattery() {
    if (timer) { battery(); return; }
    if (state.charge === null) state.charge = full();
    let n = 0;
    state.at = Date.now();
    timer = setInterval(() => {
      const dt = 0.5;
      state.charge = fed(state) ? Math.min(full(), state.charge + 100 / CHARGE * dt) : Math.max(0, state.charge - 100 / DRAIN * dt);
      state.at = Date.now();
      if (++n % 4 === 0 || state.charge <= 0) save();
      if (!fed(state) && state.charge <= 0) { clearInterval(timer); timer = 0; save(); }
      battery();
    }, 500);
    battery();
  }

  // ---------- the UPS's button ----------
  function wireButton() {
    const b = upsUnit()?.querySelector('.pwr');
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
        powers().forEach((u) => paint(u, keyOf(u), false));
        return;
      }
      bootAll();
    });
  }

  // ---------- the light switch ----------
  // The template's switch (hidden: without JS it can do nothing), shown and wired once in each room.
  let sw = null;
  function switcher() {
    const b = room.querySelector(':scope > button.lightsw');
    if (!b || b === sw) return;
    sw = b;
    sw.hidden = false;
    sw.addEventListener('click', () => {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      Rack.store.set('hall-light', mode);
      showSwitch();
      if (fed(state) && !dead()) room.dataset.light = lamp();
    });
    showSwitch();
  }
  function showSwitch() {
    const names = sw.dataset.labels.split(','), name = names[MODES.indexOf(mode)] || mode;
    sw.querySelector('.lbl').textContent = name;
    sw.dataset.mode = mode;
    sw.setAttribute('aria-label', sw.dataset.aria + ': ' + name);
  }

  // ---------- the UPS's self-test ----------
  // It beeps, the LCD runs the battery down and back, the hall light blinks; refused without current or charge.
  function wireTest() {
    const b = upsUnit()?.querySelector('.utest');
    if (!b || b.dataset.wired) return;
    b.dataset.wired = '1';
    b.hidden = false;
    b.addEventListener('click', selfTest);
  }
  function selfTest() {
    const lcd = upsLcd();
    if (!lcd || testing) return;
    const beep = (n) => document.dispatchEvent(new CustomEvent('rack:beep', { detail: { n } }));
    if (!fed(state) || state.off || dead() || state.charge !== null) {
      beep(3);
      const was = [...lcd.childNodes].map((n) => n.cloneNode(true));
      lcd.replaceChildren(lcd.dataset.testNo || 'test: no', document.createElement('br'), Object.assign(document.createElement('span'), { className: 'd', textContent: lcd.dataset.testWhy || '' }));
      setTimeout(() => { if (lcd.isConnected) lcd.replaceChildren(...was); runBattery(); }, 1800);
      return;
    }
    testing = true;
    keepReal(lcd);
    beep(1);
    const steps = [100, 80, 60, 40, 60, 80, 100], tick = motion() ? 420 : 0;
    steps.forEach((pc, i) => setTimeout(() => {
      if (!lcd.isConnected) return;
      const text = document.createElement('span');
      text.append(lcd.dataset.test || 'self test', document.createElement('br'), Object.assign(document.createElement('span'), { className: 'd', textContent: pc + '%' }));
      lcd.replaceChildren(batt(pc, false), text);
    }, i * tick));
    if (motion()) [0, 1, 2].forEach((i) => {
      setTimeout(() => { room.dataset.light = 'battery'; }, 300 + i * 500);
      setTimeout(() => { room.dataset.light = lamp(); }, 480 + i * 500);
    });
    setTimeout(() => {
      testing = false;
      beep(1);
      if (lcd.isConnected) restoreReal(lcd);
      room.dataset.light = lamp();
      runBattery();
    }, steps.length * tick + 300);
  }

  // ---------- a unit's restart (RESET on the server, assets/js/toys.js) ----------
  // The unit goes dark as without power and boots after a couple of seconds, its guests after it; the rest runs on.
  document.addEventListener('rack:reset', (e) => {
    const k = e.detail?.key, u = k && unitBy(k);
    if (!u || !powered(k) || queued.has(k)) return;
    queued.add(k);
    paint(u, k, false);
    guests(k, false);
    setTimeout(() => {
      queued.delete(k);
      const cur = unitBy(k);
      if (cur) paint(cur, k, true);
      guests(k, true);
    }, motion() ? 1600 : 300);
  });

  // ---------- the hall's breaker ----------
  // The current in all the row's sockets: off, every UPS on battery; on, they charge.
  let lever = null;
  function breaker() {
    const b = room.querySelector(':scope > button.breaker');
    if (!b || b === lever) return;
    lever = b;
    lever.hidden = false;
    lever.addEventListener('click', () => {
      const now = Date.now();
      for (const id in all.racks) settle(all.racks[id], now);
      all.breaker = !all.breaker;
      if (!all.breaker) all.breakerAt = now;
      for (const id in all.racks) settle(all.racks[id], now);
      save();
      showBreaker();
      runBattery();
      document.dispatchEvent(new Event('rack:mains'));
    });
    showBreaker();
  }
  function showBreaker() {
    lever.setAttribute('aria-pressed', String(all.breaker));
    lever.classList.toggle('down', !all.breaker);
  }
  // Its place: on the wall left of the UPS's socket; when the wall is out of sight (narrow), on the floor right of the socket.
  function placeBreaker(at = mainsAnchors(upsUnit())) {
    if (!lever) return;
    const { wall, s } = at;
    lever.classList.toggle('floor', !wall);
    lever.style.left = (wall ? s.x - 74 : s.x + 30) + 'px';
    lever.style.top = (wall ? s.y - 46 : s.y - 22) + 'px';
  }

  // ---------- geometry ----------
  function anchors(u) {
    const R = room.getBoundingClientRect();
    const rack = document.getElementById('rack').getBoundingClientRect();
    const sock = u.querySelector(':scope > .psu').getBoundingClientRect();
    const railW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail-w')) || 34;
    const s = { x: sock.left - R.left + sock.width / 2, y: sock.top - R.top + sock.height / 2 };
    // The PDU's outlet on the right rail, slightly below the unit's inlet.
    const o = { x: rack.right - R.left - railW / 2, y: s.y + 8 };
    return { s, o };
  }

  // A rope of points: its ends are the plug (points[0]) and the PDU's outlet (the last point, always fixed).
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

  // The UPS's cord: from the UPS's inlet (outlet) to the wall socket left of the rack or, without room, the floor.
  function mainsAnchors(ups) {
    const R = room.getBoundingClientRect();
    const rk = document.getElementById('rack').getBoundingClientRect();
    const u = (ups || document.getElementById('rack')).getBoundingClientRect();
    const railW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail-w')) || 34;
    const x0 = rk.left - R.left, b0 = rk.bottom - R.top;
    const inl = ups?.querySelector(':scope > .psu')?.getBoundingClientRect();
    const wall = x0 > 110;
    const ox = wall ? x0 - 62 : x0 + railW + 120, oy = wall ? b0 - 40 : b0 + 34 + 26;
    // s: where the plug sits in the socket, its centre on the holes (drawMains draws the socket around it).
    const o = inl ? { x: inl.left - R.left + inl.width / 2, y: inl.top - R.top + inl.height / 2 + 10 } : { x: x0 + railW + 46, y: u.bottom - R.top - 6 };
    return { wall, s: { x: ox, y: oy - 6 }, o };
  }

  // A cable's rope between its socket s and outlet o. A new one rests between them; one already hanging moves with its
  // outlet, so an htmx refresh does not make a plugged cable jump and swing.
  function place(key, s, o, n, len, plugged) {
    let r = ropes.get(key);
    if (!r) {
      r = { key, mains: key === 'mains', n, len, seg: len / n, socket: s, outlet: o, pts: rest(s, o, len, n), plugged };
      ropes.set(key, r);
      return r;
    }
    const dx = o.x - r.outlet.x, dy = o.y - r.outlet.y;
    r.socket = s;
    r.outlet = o;
    if (dx || dy) r.pts.forEach((p) => { p.x += dx; p.y += dy; p.px += dx; p.py += dy; });
    return r;
  }

  function relayout() {
    if (!ensureDom()) return;
    // Every measurement first, then the writes: a write between two of them would make the browser recompute the
    // room's style (its :has() rules) for the next one, and while a drawer slides this runs every frame.
    const R = room.getBoundingClientRect();
    const ups = upsUnit();
    const mainsAt = mainsAnchors(ups);
    const placed = units().map((u) => [u, anchors(u)]);
    svg.setAttribute('viewBox', `0 0 ${R.width} ${R.height}`);
    const seen = new Set();
    if (ups) {
      seen.add('mains');
      const { wall, s, o } = mainsAt;
      place('mains', s, o, 14, dist(s, o) * 1.25 + 40, state.mains).wall = wall;
    }
    if (!fed(state) || state.charge !== null) runBattery();
    placeBreaker(mainsAt);
    placed.forEach(([u, { s, o }]) => {
      const k = keyOf(u);
      seen.add(k);
      place(k, s, o, 12, Math.max(60, dist(s, o) * 1.6), !state.unplugged[k]);
    });
    for (const [k, r] of ropes) if (!seen.has(k)) { r.view?.g.remove(); ropes.delete(k); }
    // The room's floor and walls: a pulled plug lands on the raised floor instead of flying off the page.
    for (const r of ropes.values()) { r.floor = R.height - 34; r.right = R.width - 8; }
    if (kick) swing(kick);
    kick = 0;
    draw();
    wake();
  }

  // The rack arrived from the next one (assets/js/aisle.js): the cables keep moving the way it came and swing.
  function swing(dir) {
    if (!motion()) return;
    for (const r of ropes.values()) {
      if (held(r)) continue;
      const n = r.pts.length - 1;
      r.pts.forEach((p, i) => {
        if (i === 0 || i === n) return;
        const s = Math.sin(Math.PI * i / n);
        p.px = p.x + dir * 6 * s;
        p.py = p.y + 1.5 * s;
      });
    }
  }

  // ---------- physics (rack.js) ----------
  function step(r) {
    return Rack.stepRope(r, {
      end: r.outlet, seat: r.plugged ? r.socket : null, hold: held(r), reach: r.len * 0.97,
      damp: motion() ? 0.985 : 0.8, // without animations it calms down at once
    });
  }

  // ---------- drawing ----------
  // Every cable is drawn once (build) and then only moved (update): a frame changes attributes, not elements.
  function build(r) {
    const g = el('g', {}, svg);
    const v = { g };
    if (r.mains) {
      // The wall socket (or the floor's) and its caption; the plug's body sits over the holes when it is in.
      v.outlet = el('rect', { width: 32, height: 36, rx: 5, class: 'outlet' }, g);
      v.holes = [el('circle', { r: 2.6, class: 'outlet-hole' }, g), el('circle', { r: 2.6, class: 'outlet-hole' }, g)];
      v.label = el('text', { class: 'lbl' }, g);
      v.label.textContent = document.getElementById('cables')?.dataset.power || '';
      v.cord = el('g', { 'data-cord': r.key }, g);
      v.paths = Rack.cord(v.cord, MAINS, 6, { shadow: 9, hiW: 1.6, shift: 1.2 });
      // The plug in the UPS's inlet: its top in the inlet, the cord out of its bottom.
      v.conn = el('rect', { width: 11, height: 13, rx: 2, fill: MAINS, stroke: 'rgba(255,255,255,.25)' }, g);
      v.plug = el('g', {}, g);
      el('rect', { x: -11, y: -9, width: 18, height: 18, rx: 4, fill: MAINS, stroke: 'rgba(0,0,0,.5)' }, v.plug);
      v.pins = [el('rect', { x: 7, y: -6, width: 7, height: 3, rx: 1.5, fill: '#b9bec5' }, v.plug),
        el('rect', { x: 7, y: 3, width: 7, height: 3, rx: 1.5, fill: '#b9bec5' }, v.plug)];
      el('circle', { cx: 0, cy: 0, r: 18, class: 'hit', 'data-key': r.key }, v.plug);
    } else {
      // The PDU's socket, the cable, the plug: along the cable, facing the unit's inlet when it is in.
      v.outlet = el('rect', { width: 12, height: 10, rx: 2, fill: '#0c0d0f', stroke: '#3b3f46' }, g);
      v.cord = el('g', { 'data-cord': r.key }, g);
      v.paths = Rack.cord(v.cord, COLOR, 4.5, { shadow: 7, hi: 0.22, hiW: 1.2, shift: 1 });
      v.plug = el('g', {}, g);
      el('rect', { x: -9, y: -6, width: 14, height: 12, rx: 2.5, fill: PLUG, stroke: 'rgba(255,255,255,.25)' }, v.plug);
      el('rect', { x: 3, y: -3, width: 3, height: 6, rx: 1, fill: '#9aa0a8' }, v.plug);
      el('circle', { cx: 0, cy: 0, r: 16, class: 'hit', 'data-key': r.key }, v.plug); // wide, to hit with a finger
    }
    return v;
  }

  function update(r) {
    const v = r.view ||= build(r);
    const p = r.pts;
    if (r.mains) {
      const s = r.socket;
      v.outlet.setAttribute('x', s.x - 16); v.outlet.setAttribute('y', s.y - 12);
      // The holes are 2 px below s: the plugged plug's body (shifted towards its cable) covers them.
      v.holes.forEach((h, i) => { h.setAttribute('cx', s.x + (i ? 6 : -6)); h.setAttribute('cy', s.y + 2); });
      v.label.setAttribute('x', s.x - 22); v.label.setAttribute('y', s.y - 20);
      v.label.style.display = r.wall && v.label.textContent ? '' : 'none';
      v.conn.setAttribute('x', r.outlet.x - 5.5); v.conn.setAttribute('y', r.outlet.y - 13);
      v.pins.forEach((pin) => { pin.style.display = r.plugged ? 'none' : ''; });
    } else {
      v.outlet.setAttribute('x', r.outlet.x - 6); v.outlet.setAttribute('y', r.outlet.y - 5);
    }
    Rack.setCord(v.paths, Rack.ropePath(p));
    v.cord.classList.toggle('probe', r.key === probing);
    // A plugged plug looks into its socket (up for the mains, left for a unit); a hanging one along the cable.
    const a = r.plugged ? (r.mains ? -Math.PI / 2 : Math.PI) : Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x);
    v.plug.setAttribute('transform', `translate(${p[0].x} ${p[0].y}) rotate(${a * 180 / Math.PI})`);
  }

  function draw() {
    for (const r of ropes.values()) update(r);
  }

  const anim = Rack.loop(() => {
    let motion = 0;
    for (const r of ropes.values()) motion += step(r);
    return motion;
  }, draw, () => !!hand?.held);

  function wake() {
    if (svg) anim.wake();
  }

  // ---------- the cable tester ----------
  // The mouse over a plug lights its cable: only a class changes. Drawing anything anew on hover takes the grab zone from
  // under the press (Chrome sends pointerover to the new element right before pointerdown), so read the target of every
  // mouse move instead of pointerover/out.
  Rack.tester('#power .hit', () => !!hand?.held, (k) => {
    probing = k;
    svg?.querySelectorAll('g[data-cord]').forEach((g) => g.classList.toggle('probe', g.dataset.cord === k));
  });

  // Who else follows the plugs (assets/js/sticker.js): an event for each pulled and plugged one.
  const told = (key, on) => document.dispatchEvent(new CustomEvent('rack:plug', { detail: { key, on } }));

  function unplug(r) {
    r.plugged = false;
    told(r.key, false);
    if (r.mains) { state.mains = false; save(); runBattery(); return; }
    state.unplugged[r.key] = true;
    save();
    const u = unitBy(r.key);
    if (u) paint(u, r.key, false);
    guests(r.key, false);
  }

  function plug(r) {
    r.plugged = true;
    told(r.key, true);
    if (r.mains) { state.mains = true; save(); runBattery(); return; }
    delete state.unplugged[r.key];
    save();
    const u = unitBy(r.key);
    if (u) paint(u, r.key, true);
    guests(r.key, true);
  }

  // Another rack of the row (net.js: the first rack feeds the others their internet): whether its UPS gives power (noups:
  // a rack without one lives off the socket) and which plugs are out; draining: alive on battery, so ask again later.
  Rack.rackPower = (id, noups) => {
    if (id === stateId && state) return { on: !state.off && !dead(), unplugged: { ...state.unplugged }, draining: !fed(state) && !dead() };
    const r = rackState(id);
    settle(r, Date.now());
    const on = !r.off && !(noups ? !fed(r) : dying(r));
    return { on, unplugged: { ...r.unplugged }, draining: on && !fed(r) };
  };

  // app.js lays the rack out; the cables right after it and in the same frame (draw in relayout), or they catch up
  // with the units a frame or two later and jerk.
  document.addEventListener('rack:laidout', relayout);

  // htmx swapped a unit or brought a drawer: it takes the power state at once, in the same task, so it does not flash;
  // again on settle, when htmx gives it the server's class. Dark units keep polling.
  const again = () => { if (svg) ensureDom(); };
  document.addEventListener('htmx:afterSwap', again);
  document.addEventListener('htmx:afterSettle', again);

  // The rack was swapped without a reload (assets/js/aisle.js): the new one has its own power (useRack), UPS and hall
  // light; put the units and the button into the power state at once, before the rack is shown.
  document.addEventListener('rack:swap', () => {
    if (!ensureDom()) return;
    if (!fed(state) || state.charge !== null) runBattery();
  });
  // It has arrived: the next layout swings the cables (app.js lays the rack out on the same event).
  document.addEventListener('rack:landed', (e) => { kick = e.detail && !e.detail.quiet ? e.detail.dir || 0 : 0; });
})();
