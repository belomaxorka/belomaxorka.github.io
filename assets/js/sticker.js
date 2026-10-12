// Stickers come unstuck and fall to the server room's floor like a leaf: swaying, tilting the way they move, gliding
// slowly. When:
//   - the plug of the unit the sticker is on was pulled (data-sticker is the unit's power key in power.js, srv the server);
//   - the whole rack went dark: the UPS's button or an empty battery; then all the stickers fall, out of step.
// The UPS's cord out of the socket leaves the stickers alone: the battery still holds. A tap on a fallen one sticks
// it back. Where they lie is the visitor's only (localStorage, for half an hour), per rack: every rack has the UPS's
// sticker. Without JS the stickers simply stay on.
(() => {
  const { motion } = Rack;
  // Rack → sticker key → { fx: the centre's x as a share of the room's width, dy: height spread, rot }, for
  // Rack.TOY_TTL (rack.js).
  const store = Rack.toyStore('stickers-fallen', () => ({}));
  const all = store.get();
  const keep = () => store.set(all);
  const live = new Map();  // key -> { el, w, h, x, y, rot, flying }

  const room = () => document.getElementById('room');
  // This rack's fallen stickers; shown, the rack whose stickers are in the room now (for a rack swap).
  let shown = '';
  const fallen = () => { shown = Rack.here(); return (all[shown] ||= {}); };
  const sticker = (key) => document.querySelector(`[data-sticker="${key}"]`);
  // The centre of a lying sticker: on the raised floor under the rack.
  const floorY = (r, h, dy) => r.offsetHeight - 72 - h / 2 + dy;

  function angle(node) {
    const m = getComputedStyle(node).transform;
    if (!m || m === 'none') return 0;
    const [a, b] = m.slice(m.indexOf('(') + 1, -1).split(',').map(Number);
    return Math.atan2(b, a) * 180 / Math.PI;
  }

  // The sticker's copy in the room: the same font, colours and size, but free.
  function clone(src) {
    const cs = getComputedStyle(src);
    const c = src.cloneNode(true);
    c.removeAttribute('data-sticker');
    c.className = 'fallen-sticker';
    c.setAttribute('aria-hidden', 'true');
    for (const p of ['font', 'color', 'background', 'padding', 'lineHeight', 'letterSpacing', 'textAlign', 'boxShadow', 'boxSizing', 'whiteSpace']) c.style[p] = cs[p];
    // The exact size, with the fraction (offsetWidth rounds down, and the last word would wrap and be cut off), and a
    // pixel to spare: the copy has another font context.
    c.style.width = `calc(${cs.width} + 1px)`;
    c.style.minHeight = cs.height;
    if (src.dataset.back) c.title = src.dataset.back;
    return c;
  }

  function place(s) { s.el.style.transform = `translate(${s.x - s.w / 2}px, ${s.y - s.h / 2}px) rotate(${s.rot}deg)`; }

  function settle(key, s) {
    s.flying = false;
    s.el.classList.add('on-floor');
    const R = room();
    fallen()[key] = { fx: s.x / R.offsetWidth, dy: s.dy, rot: s.rot };
    keep();
  }

  function fall(key) {
    const src = sticker(key), R = room();
    if (!src || !R || live.has(key) || !src.offsetParent) return; // on a phone the server's sticker is hidden
    const rr = R.getBoundingClientRect(), b = src.getBoundingClientRect();
    const s = {
      el: clone(src), w: src.offsetWidth, h: src.offsetHeight,
      x: b.left + b.width / 2 - rr.left, y: b.top + b.height / 2 - rr.top, rot: angle(src),
      dy: Math.random() * 16 - 8, flying: true,
    };
    live.set(key, s);
    s.el.addEventListener('click', () => stickBack(key));
    R.appendChild(s.el);
    src.classList.add('peeled');
    place(s);
    const land = floorY(R, s.h, s.dy);
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (!motion()) {
      s.y = land; s.rot = dir * 8; place(s); settle(key, s);
      return;
    }
    // A leaf: a pendulum from side to side, falling fastest at the bottom of the swing, tilting the way it moves.
    const A = 30 + Math.random() * 22;         // the swing, px
    const w = 2 + Math.random() * 0.7;        // the swing's frequency, rad/s
    const fallV = 80 + Math.random() * 30;     // the falling speed, px/s
    const drift = dir * (6 + Math.random() * 10);
    const base = s.rot;
    let phase = Math.random() * Math.PI, t = 0, last = performance.now();
    const frame = (now) => {
      if (!s.flying) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (t < 0.5) {
        // It peels off the corner: turns and drops a little, still holding on by its edge.
        s.rot = base + dir * 26 * (t / 0.5) ** 2;
        s.y += 10 * dt;
      } else {
        // While the sticker is on screen it glides slowly; off the screen it catches up with the floor faster (the page
        // is long, and half a minute of an empty screen is dull). Scroll after it and the slow flight shows again.
        const top = R.getBoundingClientRect().top + s.y;
        const seen = top > -s.h && top < innerHeight + s.h;
        phase += w * dt;
        s.x += (A * w * Math.cos(phase) + drift) * dt;
        s.y += fallV * (seen ? 1 : 8) * (0.45 + 0.55 * Math.abs(Math.sin(phase))) * dt;
        const tilt = dir * 26 + 24 * Math.cos(phase);
        s.rot += (tilt - s.rot) * Math.min(1, dt * 6);
        s.x = Math.min(Math.max(s.x, s.w / 2 + 4), R.offsetWidth - s.w / 2 - 4);
      }
      if (s.y >= land) {
        s.y = land;
        s.rot = Math.max(-24, Math.min(24, s.rot % 360));
        place(s);
        settle(key, s);
        return;
      }
      place(s);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function stickBack(key) {
    const s = live.get(key), src = sticker(key), R = room();
    if (!s || s.flying) return;
    const done = () => {
      s.el.remove();
      live.delete(key);
      src?.classList.remove('peeled');
      delete fallen()[key];
      keep();
    };
    if (!src || !R || !motion() || !src.offsetParent) return done();
    const rr = R.getBoundingClientRect(), b = src.getBoundingClientRect();
    s.el.classList.remove('on-floor');
    s.el.classList.add('returning');
    s.x = b.left + b.width / 2 - rr.left;
    s.y = b.top + b.height / 2 - rr.top;
    s.rot = angle(src);
    place(s);
    s.el.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 900);
  }

  // The ones fallen last time lie on the floor at once; after the rack is rebuilt, in their places.
  function restore() {
    const R = room();
    if (!R) return;
    const here = fallen();
    for (const key of Object.keys(here)) {
      const src = sticker(key);
      if (!src || !src.offsetParent) continue;
      let s = live.get(key);
      if (!s) {
        s = { el: clone(src), w: src.offsetWidth, h: src.offsetHeight, flying: false, dy: here[key].dy || 0, rot: here[key].rot || 0 };
        s.el.addEventListener('click', () => stickBack(key));
        s.el.classList.add('on-floor');
        R.appendChild(s.el);
        src.classList.add('peeled');
        live.set(key, s);
      }
      if (s.flying) continue;
      s.x = Math.min(Math.max(here[key].fx * R.offsetWidth, s.w / 2 + 4), R.offsetWidth - s.w / 2 - 4);
      s.y = floorY(R, s.h, s.dy);
      place(s);
    }
  }

  // All at once, but not in chorus: each with its own delay.
  function fallAll() {
    [...document.querySelectorAll('[data-sticker]')].forEach((el, i) => {
      setTimeout(() => fall(el.dataset.sticker), motion() ? i * 280 + Math.random() * 250 : 0);
    });
  }

  // power.js reports every pulled plug and the whole rack going dark.
  document.addEventListener('rack:plug', (e) => { if (!e.detail.on) fall(e.detail.key); });
  document.addEventListener('rack:power', (e) => { if (!e.detail.on) fallAll(); });
  document.addEventListener('rack:laidout', () => requestAnimationFrame(restore));

  // The rack was swapped without a reload (assets/js/aisle.js): the fallen stickers stayed in the old room. One still
  // in the air lands where it was: back at that rack, it is on the floor.
  document.addEventListener('rack:swap', () => {
    const w = room()?.offsetWidth || 1, old = (all[shown] ||= {});
    for (const [key, s] of live) {
      if (s.flying) {
        s.flying = false;
        old[key] = { fx: s.x / w, dy: s.dy, rot: Math.max(-24, Math.min(24, s.rot % 360)) };
      }
      s.el.remove();
    }
    live.clear();
    keep();
  });
})();
