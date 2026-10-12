// What the rack's scripts share (window.Rack); loaded before them. They also talk through events on document:
//   rack:layout   (any → app.js)        lay the rack out again
//   rack:laidout  (app.js → all)        laid out; detail.cords, .loose (cards without a free port), .cards (drawn here)
//   rack:swap     (aisle.js → all)      another rack is in the room; detail.quiet: no animation
//   rack:landed   (aisle.js → all)      it has arrived; detail.dir: 1 forward, -1 back
//   rack:drawing  (app.js → net.js)     the cords are being drawn; detail: { lag, step } in ms, or null
//   rack:unit     (power.js → unit)     a unit went dark or booted; detail.key, detail.on
//   rack:power    (power.js → all)      the whole rack went dark or came back; detail.on, detail.why
//   rack:plug     (power.js → all)      a power plug out or in; detail.key, detail.on
//   rack:link     (net.js → all)        a network cord out or in; detail.key, detail.on
//   rack:reset    (toys.js → power.js)  RESET on a unit; detail.key
//   rack:beep     (power.js → sound.js) the UPS beeps; detail.n
//   rack:mains    (power.js → net.js)   the hall's breaker moved
//   rack:net      (net.js → all)        the rack lost or got the internet; detail.on
window.Rack = (() => {
  // ---------- what every script needs ----------
  // store: localStorage that may be missing or refuse (a private window): reads give null, writes are dropped.
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* no storage: forgotten */ } },
    json(k, def) { try { return JSON.parse(store.get(k)) ?? def; } catch { return def; } },
    setJSON(k, v) { store.set(k, JSON.stringify(v)); },
  };
  // motion(): the visitor has not asked for reduced motion (asked each time: it can change while the page is open).
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = () => !reduced.matches;
  // here(): the rack in the room now; the aisle swaps it without a reload.
  const here = () => document.getElementById('room')?.dataset.rack || '';
  // drawerURL(unit): the unit pulled out, for the rack on screen (a unit can stand on more than one rack).
  const drawerURL = (name) => '/fragments/unit/' + encodeURIComponent(name) + '?rack=' + encodeURIComponent(here());
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // tween(ms, frame, done): frame(k) every animation frame, k from 0 to 1 easing out (cubic), then done(); returns stop().
  function tween(ms, frame, done) {
    const t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      frame(1 - (1 - k) ** 3);
      if (k < 1) raf = requestAnimationFrame(step);
      else { raf = 0; done?.(); }
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); raf = 0; };
  }

  // ---------- the toys' memory ----------
  // Plugs, cords, the UPS and fallen stickers stay as the visitor left them for a while (TOY_TTL), then the rack runs again.
  const TOY_TTL = 30 * 60 * 1000; // after the last change

  // toyStore(key, empty) keeps one object in localStorage with the time it was saved; get() returns empty() when
  // there is none, it is older than TOY_TTL, or it was saved in an earlier format.
  function toyStore(key, empty) {
    return {
      get() {
        const s = store.json(key, null);
        return s && typeof s.at === 'number' && Date.now() - s.at < TOY_TTL && s.v && typeof s.v === 'object' ? s.v : empty();
      },
      set(v) { store.setJSON(key, { at: Date.now(), v }); },
    };
  }

  // ---------- units ----------
  // A unit says what it is in its template; nothing lists units by name. Power: wall -> UPS -> PDU -> unit; network:
  // unit -> cord -> switch -> router -> internet (a rack without a router through its uplink to the row's first rack).
  //   data-key="srv"         its name: its plug and cord in the toys' memory
  //   data-power             its own power supply: a cable from the PDU (power.js)
  //   data-net="lan|wan"     a network card and a cord to the switch; wan needs the internet too (.unlinked, .nonet)
  //   data-host="pve"        runs on another unit: on and online while its host is
  //   data-role="switch|router|ups"  the rack's infrastructure (the switch's data-uplink: the rack it uplinks to)
  //   data-feed="koito ..."  the server's sources it shows: where their packets go (live.js)
  //   data-vlan="mgmt"       a purple cord
  //   data-live="lamps|bar|text|image"  live data inside, dark while the unit cannot get it
  //   data-news(="markup")   the element whose text (or markup) changes with new data: a packet runs to it
  // Units without data-key are passive; tools/check-units.mjs fails CI for a unit with live data and no declaration.
  const keyOf = (u) => u?.dataset.key || '';
  const unitOf = (body, k) => (body && k ? body.querySelector(`:scope > .u[data-key="${CSS.escape(k)}"]`) : null);
  // units(body, filter): the active units of a rack, top to bottom; filter narrows them ('[data-power]', '[data-net]').
  const units = (body, filter = '') => (body ? [...body.querySelectorAll(`:scope > .u[data-key]${filter}`)] : []);
  const roleOf = (body, role) => body?.querySelector(`:scope > .u[data-role="${role}"]`) || null;
  // The one rule for everything that changes on its own (data, blinks, packets, cycling screens, other visitors):
  //   live(u):   the unit gets its data now: it has power and is online (net.js marks .unlinked and .nonet);
  //   reached(): anything from outside reaches this rack now: it has power and the internet (net.js marks #rack .nonet).
  const live = (u) => !!u && !u.classList.contains('off') && !u.classList.contains('unlinked') && !u.classList.contains('nonet');
  const reached = () => { const r = document.getElementById('rack'); return !!r && !r.classList.contains('nonet') && !r.classList.contains('powered-off'); };
  const hostOf = (body, u) => (u?.dataset.host ? unitOf(body, u.dataset.host) : null);
  const guestsOf = (body, k) => units(body, `[data-host="${CSS.escape(k)}"]`);

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  function svg(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---------- hanging cables (power.js: power cables, net.js: pulled cords) ----------
  // A cable is a Verlet rope: pts[0] is the plug, the last point is fixed. stepRope moves it one frame: end is the fixed
  // point, seat the socket the plug sits in, hold where a hand pulls it (no further than reach), damp the calming.
  function stepRope(r, { end, seat = null, hold = null, reach = Infinity, damp = 0.985 }) {
    const g = 0.42; // gravity, px per frame²
    const last = r.pts.length - 1;
    const pinned = (i) => i === last || (i === 0 && (seat || hold));
    const floor = r.floor ?? Infinity, right = r.right ?? Infinity;
    const keepIn = (p) => {
      if (p.y > floor) p.y = floor;
      if (p.x < 8) p.x = 8; else if (p.x > right) p.x = right;
    };
    let motion = 0;
    r.pts.forEach((p, i) => {
      if (pinned(i)) return;
      const rub = p.y >= floor - 0.5 ? 0.7 : 1; // on the floor a cable lies down instead of sliding
      const vx = (p.x - p.px) * damp * rub, vy = (p.y - p.py) * damp;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + g;
      motion += Math.abs(vx) + Math.abs(vy);
    });
    const head = r.pts[0];
    if (seat) {
      head.x = head.px = seat.x; head.y = head.py = seat.y;
    } else if (hold) {
      let tx = hold.x, ty = hold.y;
      const d = Math.hypot(tx - end.x, ty - end.y);
      if (d > reach) { tx = end.x + (tx - end.x) * reach / d; ty = end.y + (ty - end.y) * reach / d; }
      head.px = head.x; head.py = head.y;
      head.x = tx; head.y = ty;
      keepIn(head);
      motion += 1;
    }
    const tail = r.pts[last];
    tail.x = tail.px = end.x; tail.y = tail.py = end.y;
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
      r.pts.forEach((p, i) => { if (!pinned(i)) keepIn(p); });
    }
    return motion;
  }

  // ropePath is a smooth path through a rope's points.
  function ropePath(p) {
    let d = `M${p[0].x} ${p[0].y}`;
    for (let i = 1; i < p.length - 1; i++) d += ` Q${p[i].x} ${p[i].y} ${(p[i].x + p[i + 1].x) / 2} ${(p[i].y + p[i + 1].y) / 2}`;
    return d + ` L${p[p.length - 1].x} ${p[p.length - 1].y}`;
  }

  // cord draws a cable's three strokes (shadow, colour, highlight) into parent and returns them: set their d with
  // setCord as the cable moves, instead of drawing it anew every frame. The highlight's look can be tuned.
  function cord(parent, color, w, { shadow = w + 3, hi = 0.28, hiW = Math.max(1, w * .3), shift = w * .2 } = {}) {
    const line = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    return [
      svg('path', { ...line, stroke: 'rgba(0,0,0,.35)', 'stroke-width': shadow, transform: 'translate(0 2)' }, parent),
      svg('path', { ...line, stroke: color, 'stroke-width': w }, parent),
      svg('path', { ...line, stroke: `rgba(255,255,255,${hi})`, 'stroke-width': hiW, transform: `translate(${-shift} ${-shift})` }, parent),
    ];
  }
  const setCord = (paths, d) => paths.forEach((p) => p.setAttribute('d', d));

  // loop runs step() and then draw() every frame until things have been still for 45 frames (busy() keeps it going,
  // as while a hand holds a plug); wake() starts it again.
  function loop(step, draw, busy) {
    let raf = 0, calm = 0;
    const tick = () => {
      const motion = step();
      draw();
      calm = motion < 0.08 && !busy() ? calm + 1 : 0;
      raf = calm > 45 ? 0 : requestAnimationFrame(tick);
    };
    return { wake() { calm = 0; if (!raf) raf = requestAnimationFrame(tick); } };
  }

  // hand lets a mouse or a finger take a plug (an element with data-key) in an SVG layer:
  //   take(key) → what to remember, or nothing; pull(key) after 6 px; drop(key, was) after a pull; tap(key, was) without
  //   one; moved() after every move. hand.held is { key, x, y } while a plug is held; hand.of(key) the same for key.
  // A finger takes a plug only after holding still for HOLD ms (moving first is a scroll); while it holds one, its
  // touchmoves are cancelled on the layer and on the touched element (a plug drawn anew leaves the old one detached).
  // The release never becomes a click (the plug is gone, the click would land on what is under it), and only the pointer
  // that took the plug moves it. Vibration only after the page has had a tap (Chrome blocks it before).
  const HOLD = 350, SLOP = 10;
  function hand(layer, room, { take, pull, drop, tap, moved }) {
    const h = { held: null, of: (key) => (h.held?.key === key ? h.held : null) };
    let wait = null;   // a finger on a plug, not long enough yet: { id, from, timer, move, up, cancel }
    let touched = null; // the element a finger is on
    const block = (e) => { if (h.held && e.cancelable) e.preventDefault(); };
    const noclick = (e) => { if (e.cancelable) e.preventDefault(); };
    const unwait = () => {
      if (!wait) return;
      clearTimeout(wait.timer);
      removeEventListener('pointermove', wait.move);
      removeEventListener('pointerup', wait.up);
      removeEventListener('pointercancel', wait.cancel);
      wait = null;
    };
    layer.addEventListener('touchmove', block, { passive: false });
    layer.addEventListener('contextmenu', (e) => { if (wait || h.held) e.preventDefault(); });
    const local = (e) => { const R = room().getBoundingClientRect(); return { x: e.clientX - R.left, y: e.clientY - R.top }; };
    const move = (e) => {
      const d = h.held;
      if (!d || e.pointerId !== d.id) return;
      const at = local(e);
      d.x = at.x; d.y = at.y;
      if (!d.moved && Math.hypot(at.x - d.from.x, at.y - d.from.y) > 6) { d.moved = true; pull(d.key); }
      moved();
    };
    const release = (e) => {
      if (h.held && e.pointerId !== h.held.id) return;
      touched?.removeEventListener('touchmove', block);
      touched = null;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', release);
      removeEventListener('pointercancel', release);
      const d = h.held;
      if (!d) return;
      if (d.moved) drop(d.key, d.was); else tap(d.key, d.was);
      h.held = null;
      moved();
    };
    const grab = (key, was, at, id) => {
      h.held = { key, ...at, from: at, was, moved: false, id };
      addEventListener('pointermove', move);
      addEventListener('pointerup', release);
      addEventListener('pointercancel', release);
      moved();
    };
    layer.addEventListener('pointerdown', (e) => {
      const key = e.target?.dataset?.key;
      const was = key && take(key);
      if (was === undefined || was === false) return;
      const at = local(e);
      if (e.pointerType !== 'touch') { e.preventDefault(); grab(key, was, at, e.pointerId); return; }
      unwait();
      touched?.removeEventListener('touchmove', block);
      touched?.removeEventListener('touchend', noclick);
      touched = e.target;
      touched.addEventListener('touchmove', block, { passive: false });
      touched.addEventListener('touchend', noclick, { passive: false, once: true });
      const w = wait = { id: e.pointerId, from: { x: e.clientX, y: e.clientY } };
      const mine = (m) => m.pointerId === w.id;
      // Moved first: a scroll. Let go: a quick tap. Cancelled: the browser scrolls. Held still: taken.
      w.move = (m) => { if (mine(m) && Math.hypot(m.clientX - w.from.x, m.clientY - w.from.y) > SLOP) unwait(); };
      w.up = (m) => { if (mine(m)) { unwait(); tap(key, was); moved(); } };
      w.cancel = (m) => { if (mine(m)) unwait(); };
      w.timer = setTimeout(() => {
        unwait();
        if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(12);
        grab(key, was, at, w.id);
      }, HOLD);
      addEventListener('pointermove', w.move);
      addEventListener('pointerup', w.up);
      addEventListener('pointercancel', w.cancel);
    });
    return h;
  }

  // tester(selector, busy, show): the mouse over a plug lights its cable; show(key), show(null) on leaving. It reads the
  // target of every mouse move, not pointerover/out: a grab zone drawn anew under the pointer gets no pointerout.
  function tester(selector, busy, show) {
    let cur = null;
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || busy()) return;
      const k = (e.target instanceof Element && e.target.closest(selector)?.dataset.key) || null;
      if (k !== cur) show(cur = k);
    }, { passive: true });
  }

  return {
    store, motion, here, drawerURL, dist, tween,
    TOY_TTL, toyStore, keyOf, unitOf, units, roleOf, hostOf, guestsOf, live, reached, svg, stepRope, ropePath, cord, setCord,
    loop, hand, tester,
    pulled: () => new Set(), // net.js: which cords of this rack are out
    rackPower: () => ({ on: true, unplugged: {}, draining: false }), // power.js: another rack's power (net.js, R1 for the row)
  };
})();
