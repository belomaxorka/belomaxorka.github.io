// What the rack's scripts share. Loaded before them (templates/layout.html), it only defines window.Rack.
//
// The scripts also talk through events on document:
//   rack:layout   (anyone → app.js)     lay the rack out again now: a drawer opened, a cord was pulled, the canvas opened
//   rack:laidout  (app.js → all)        the rack is laid out; detail.cords — the network cords app.js drew, detail.loose
//                                       — units whose card found no free port, detail.cards — false when the cards are
//                                       not drawn at this width (a phone: they count as plugged in)
//   rack:swap     (aisle.js → all)      another rack is in the room, not shown yet; detail.quiet — it comes without animation
//   rack:landed   (aisle.js → all)      it has arrived; detail.dir — 1 forward, -1 back
//   rack:drawing  (app.js → net.js)     the cords are being drawn in; detail — { lag, step } in ms, or null: all at once
//   rack:unit     (power.js → unit)     a unit went dark or booted (bubbles from the unit; detail.key, detail.on)
//   rack:power    (power.js → all)      the whole rack went dark or came back; detail.on, detail.why
//   rack:plug     (power.js → all)      a power plug out or in; detail.key, detail.on
//   rack:link     (net.js → all)        a network cord out or in; detail.key, detail.on
//   rack:reset    (toys.js → power.js)  RESET on a unit; detail.key
//   rack:beep     (power.js → sound.js) the UPS beeps; detail.n times
//   rack:mains    (power.js → net.js)   the hall's breaker moved: the row's sockets lost or got their current
//   rack:net      (net.js → all)        the rack lost or got the internet; detail.on
// net.js answers Rack.pulled() for app.js: which cords of this rack are out; power.js answers Rack.rackPower(id) for
// net.js: whether another rack of the row has power (the row's first rack feeds the others their internet).
window.Rack = (() => {
  // ---------- the toys' memory ----------
  // The toys (power plugs, network cords, the UPS, fallen stickers) remember what a visitor did for a while: a
  // reload or a walk to another rack and back finds them as they were. Not for good: a visitor who comes back
  // later finds the rack running, not dark and unclickable because of what someone did on this device last week.
  const TOY_TTL = 30 * 60 * 1000; // after the last change

  // toyStore(key, empty) keeps one object in localStorage with the time it was saved; get() returns empty() when
  // there is none, it is older than TOY_TTL, or it was saved in an earlier format.
  function toyStore(key, empty) {
    return {
      get() {
        try {
          const s = JSON.parse(localStorage.getItem(key) || 'null');
          if (s && typeof s.at === 'number' && Date.now() - s.at < TOY_TTL && s.v && typeof s.v === 'object') return s.v;
        } catch { /* no storage, or not ours */ }
        return empty();
      },
      set(v) {
        try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), v })); } catch { /* no storage: the toys forget */ }
      },
    };
  }

  // ---------- units ----------
  // A unit says what it is in its template (templates/units/*.html), and the scripts read it from there; nothing lists
  // units by name. The rack works like the real thing: power runs wall -> UPS -> PDU -> each unit with its own supply;
  // the network runs unit -> its cord -> the switch -> the router -> the internet, and a rack without a router
  // reaches it through its uplink to the row's first rack.
  //   data-key="srv"          its name on the rack: its plug and its cord in the toys' memory, what the scripts call it;
  //   data-power              its own power supply: a cable from the PDU (power.js);
  //   data-net="lan|wan"      a network card: a cord to the switch (app.js, net.js). lan: it needs the rack's network
  //                           only; wan: the internet too. Without it the unit is offline (.unlinked: no link, .nonet:
  //                           no internet), and its screens and live elements say so;
  //   data-host="pve"         it runs on another unit (a container on the Proxmox host): no supply or cord of its own,
  //                           it is on while the host is and has the network while the host does;
  //   data-role="switch|router|ups"   the rack's infrastructure (the switch's data-uplink: the rack it uplinks to);
  //   data-feed="koito gatus"  the server's data sources it shows ("site": it serves the pages, "guestbook": the
  //                           guestbook): where their packets go (live.js), in through the WAN when site-api says a
  //                           source is outside the home network, from the server otherwise;
  //   data-vlan="mgmt"        on the management network: a purple cord;
  //   data-live="lamps|bar|text|image" on an element inside: live data, dark while the unit cannot get it
  //                           (assets/css/units/network.css);
  //   data-news (="markup")   on the element whose text (markup) changes when new data comes: then a packet runs to it.
  // Units without data-key (patch panels, organisers, blanks, button walls) are passive. docs/tools/check-units.mjs
  // fails CI for a unit that shows live data without saying how it gets it.
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

  // ---------- hanging cables (power.js: the PDU's cables, net.js: pulled network cords) ----------
  // A cable is a rope of points (Verlet): pts[0] is the plug, the last point is fixed where the cable comes from.
  // seg is one link's length; floor and right keep it in the room.
  // stepRope moves it one frame. end — the fixed point; seat — the socket the plug sits in, if it does; hold — where a
  // hand pulls the plug, if it does (the plug follows, no further than reach from end); damp — how fast it calms
  // down. Returns how much it moved.
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

  // hand lets a mouse or a finger take a plug in an SVG layer by its grab zone (an element with data-key):
  //   take(key) — whether it can be taken, and what to remember about it (was, given back to the others);
  //   pull(key) — the hand moved more than 6 px: the plug comes out;
  //   drop(key, was) — let go after a pull; tap(key, was) — let go without one;
  //   moved() — after every move, to wake the drawing.
  // hand.held is { key, x, y } in the room's coordinates while a plug is held, null otherwise.
  // A finger lands on a plug as often to scroll past it as to take it: a finger takes a plug only after holding it
  // still for HOLD ms (a short vibration says so). Moving first is a scroll, and the browser scrolls; a quick tap still
  // toggles the plug. While a finger has a plug, the page does not scroll under it: its touchmoves are cancelled, on the
  // layer (so the browser asks before scrolling a touch that starts on a plug) and on the touched element itself (a
  // plug drawn anew when it comes out leaves the old one out of the page, and the layer would not hear of them).
  // A touch on a plug never ends in a click: on its release the plug is gone from under the finger, and the click would
  // land on whatever is there now (a hanging plug put back over the router's links opened a link). Only the pointer that
  // took the plug moves it and lets it go: another finger tapping elsewhere meanwhile is not a tap on the plug. The
  // vibration only after the page has had a tap (Chrome blocks it before, with a warning in the console).
  const HOLD = 350, SLOP = 10;
  function hand(layer, room, { take, pull, drop, tap, moved }) {
    const h = { held: null };
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

  return {
    TOY_TTL, toyStore, keyOf, unitOf, units, roleOf, hostOf, guestsOf, live, reached, svg, stepRope, ropePath, cord, setCord,
    loop, hand,
    pulled: () => new Set(), // net.js: which cords of this rack are out
    rackPower: () => ({ on: true, unplugged: {}, draining: false }), // power.js: another rack's power (net.js, R1 for the row)
  };
})();
