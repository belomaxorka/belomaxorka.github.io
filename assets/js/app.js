// The rack's behaviour. site-api renders the markup and the data, htmx refreshes the live units; here only what needs
// the browser: the Alpine components, the units' heights, the rail numbers and the network cables.
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

    // The LCD colour: from the cover (site-api sends the palette) or plain amber. The buttons' captions are in data
    // attributes, in the page's language.
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

    // Lines that take turns on an LCD: the first one shows without JS too, the rest go round.
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

    // The VU meter: alive only while something plays.
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

    // A 88x31 button's code to the clipboard; the captions are in data attributes, in the page's language.
    Alpine.data('copyCode', () => ({
      label: '',
      init() { this.label = this.$root.querySelector('[data-copy]').dataset.copy; },
      copy(btn) {
        const done = () => { this.label = btn.dataset.done; setTimeout(() => { this.label = btn.dataset.copy; }, 1600); };
        // No clipboard (plain http, an old browser): open the code and select it, or select the wallet's address.
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

    // A contact with no link, only a name (Discord): a click shows the name on the tape for a while and copies it.
    Alpine.data('copyName', () => ({
      shown: false,
      copied: false,
      timer: 0,
      copy() {
        clearTimeout(this.timer);
        this.shown = true;
        this.timer = setTimeout(() => { this.shown = this.copied = false; }, 2500);
        navigator.clipboard?.writeText(this.$root.dataset.name).then(() => { this.copied = true; }, () => {});
      },
    }));

    // Avatars: they scroll without JS too (scroll-snap); here the arrows, the counter and the wrap-around.
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
      // The lamps under the photo: the one of the photo on screen is lit.
      light() { [...(this.$refs.leds?.children || [])].forEach((l, k) => l.classList.toggle('off', k !== this.i)); },
    }));

    // The guestbook's drawings open large in a <dialog>, turned with the arrows and the keys.
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

    // A unit that pulls out: the handle on its left ear. Without JS it is a link to ?open=<unit> (the page with the
    // unit pulled out); with JS htmx loads the drawer under the unit (/fragments/unit/<unit>) and a second press pushes
    // it back. The request comes from the handle, so net.js knows whose drawer it is (offline: the drawer shows the error).
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

    // The pulled-out drawer: slides out, sets aria-expanded on the handle, goes back with its button, Esc or the handle.
    Alpine.data('drawer', () => ({
      init() {
        // The drawer is the component's root. In the methods this.$el is the element of the event (the "push back"
        // button), so keep the drawer here.
        const el = this.box = this.$root, name = el.id.replace('drawer-', '');
        this.handle = document.querySelector(`.pull[data-unit="${name}"]`);
        if (this.handle) this.handle.setAttribute('aria-expanded', 'true');
        el.addEventListener('drawer:shut', () => this.shut());
        // It slides out by itself (CSS @starting-style); lay the rack out now and once it is out.
        const layout = () => document.dispatchEvent(new Event('rack:layout'));
        layout();
        el.addEventListener('transitionend', layout, { once: true });
      },
      shut() {
        const el = this.box;
        // Opened by ?open=<unit> (no JS drawer at first): the address goes back to the rack's, without a reload.
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

  // ---------- unit heights in whole U, the rail numbers ----------
  // A pulled-out drawer takes space in the rack too: it counts as a unit.
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

  // ---------- network cables ----------
  // Structured cabling: short patch cords from the ring's jacks on the patch panel through the brush organiser into
  // the switch's top row; each unit's network card into the left vertical organiser, up along it to the switch's
  // bottom row; the router (on the home rack) into the switch, its WAN as yellow fibre up through the roof; on the
  // other racks fibre runs from the switch's SFP towards R1. One SVG over the room that clicks pass through. The power
  // cables are power.js's.
  const RING = ['#e0b93a', '#3a7bd5', '#e0b93a', '#e0b93a'];
  const GUEST = '#c9ccd2';  // the cords of the guests online (assets/js/live.js)
  let drawnGuests = 0;      // how many are drawn already: a new cord is pulled in, the others just stay
  const DATA = '#3a7bd5', MGMT = '#9b6bd6', LAN = '#3daa63', FIBER = '#e8c21a', UPFIBER = '#2bb3c0';
  const keyOf = (u) => Rack.keyOf(u, Rack.WIRED); // units with a network card (rack.js)
  const el = Rack.svg;

  function cable(svg, d, color, w) {
    Rack.setCord(Rack.cord(el('g', {}, svg), color, w), d);
  }

  function plug(svg, x, y, color, w = 9, h = 11) {
    el('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 2, fill: color, stroke: 'rgba(0,0,0,.45)' }, svg);
  }

  // A plug in a jack: centred on it and filling nearly all of it, only the frame shows.
  function seat(svg, b, color) {
    plug(svg, b.cx, b.cy, color, Math.max(6, b.w - 5), Math.max(6, b.h - 4));
    el('rect', { x: b.cx - b.w * .18, y: b.cy - b.h * .16, width: b.w * .36, height: b.h * .32, rx: 1, fill: 'rgba(0,0,0,.22)', class: 'boot' }, svg);
  }

  // Splits the cubic curve [a, b, c, d] at t in two (de Casteljau).
  function split([a, b, c, d], t) {
    const m = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    const ab = m(a, b), bc = m(b, c), cd = m(c, d), abc = m(ab, bc), bcd = m(bc, cd), x = m(abc, bcd);
    return [[a, ab, abc, x], [x, bcd, cd, d]];
  }
  const xy = (p) => `${p.x} ${p.y}`;

  // The units' network cards and the vertical organiser: decoration that exists only with JS (like the power inlets).
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
    // The screens of connected units know what to show without a link (CSS: network.css, "no link"). Every htmx update
    // brings the unit anew, so the captions are set on every layout. The photo counter under the avatars (.gal-ctl) is
    // not a network screen: the photos are local, and the text would not fit. The Proxmox host and the containers
    // (/lab) talk to the LAN only: without a link "link lost", and they have nothing to show for "no internet".
    units.forEach(u => u.querySelectorAll('.lcd, .screen').forEach(d => {
      if (d.closest('.gal-ctl')) return;
      d.dataset.nolink = body.dataset.nolink || '';
      if (u.matches('.pve, .ct')) delete d.dataset.nonet;
      else d.dataset.nonet = body.dataset.nonet || '';
    }));
    units.forEach((u) => {
      // The class every time: htmx, swapping the unit, restores its class from the response on settle.
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

  // Where a cubic curve (monotonic in height) crosses the height y: t from 0 to 1.
  function cross(c, y) {
    const at = (t) => (1 - t) ** 3 * c[0].y + 3 * (1 - t) ** 2 * t * c[1].y + 3 * (1 - t) * t * t * c[2].y + t ** 3 * c[3].y;
    const up = at(1) < at(0);
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if ((at(m) > y) === up) lo = m; else hi = m; }
    return Math.min(.85, Math.max(.15, (lo + hi) / 2));
  }

  // The rack's cords for assets/js/net.js (it gets them with rack:laidout): each with its key, its switch port (net.js
  // lights its lamp while there is a link) and its wire's number in the SVG (to know when the plug reaches the port as
  // the cable is drawn). The ones that can be pulled also have their jack, their tail (the curve from the plug to where
  // the organiser holds the cord, where a pulled one hangs from) and where to grab them.
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
    // The ports' lamps are net.js's: lit for the cords with a link.
    tor.querySelectorAll('.tp.link').forEach(t => t.classList.remove('link'));

    // net.js knows which cords of this rack are pulled: it draws their tail and plug; here the rest of the way to the
    // switch (or to the trays).
    const pulled = Rack.pulled();
    // A cord with the tail tail ([from the plug, ..., to the organiser]) and the way on, rest (a continuation: "L...",
    // "C..."). It seats the plug in the jack at itself; the far end is the caller's. hit: where to grab (the jack by default).
    const pullable = (key, type, port, at, color, w, tail, rest, hit) => {
      const out = pulled.has(key);
      cable(svg, out ? `M${xy(tail[3])} ${rest}` : `M${xy(tail[0])} C${xy(tail[1])}, ${xy(tail[2])}, ${xy(tail[3])} ${rest}`, color, w);
      if (!out) seat(svg, at, color);
      cords.push({ key, type, port, wire: wireNo(), grab: true, color, w, tail, at: { x: at.cx, y: at.cy }, hit: hit || { x: at.cx, y: at.cy, r: 15 } });
      return out;
    };

    // The ring: patch panel jacks 1-4 -> ports 1, 3, 5, 7 (top row), down through the brush. When the jacks wrap to two
    // rows (phone), cords from the lower row only: from the upper one they would cross the labels.
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
      // The ring's cords cannot be pulled: their jacks are the ring's links, and the ring always works.
      cords.push({ key: 'ring' + (i + 1), type: 'ring', port: t, wire: wireNo() });
    });

    // Guests online (assets/js/live.js sets data-guests on <html>): a cord for each other guest, from a free patch panel
    // jack (5, 6, ...) to a free port of the switch's top row (9, 11, ...), as many as fit at this width (on a phone the
    // free jacks are hidden, so no guests). A new one's cord is pulled in (.fresh).
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

    // Fibre (the router's WAN or the switch's uplink): up into the brush under the switch, left along it into the
    // vertical organiser, up along it through the roof entry to the trays. Data runs on the left, power on the right.
    const vmEl = rack.querySelector('#rack-body > .vm');
    const lowEl = tor.nextElementSibling?.classList.contains('brush') ? tor.nextElementSibling : null;
    // Above the rack, into the yellow duct on the ceiling: the entry point on its axis (the .mark lines in the hall,
    // hall.css) ~40 px high, above the aisle signs; along the ceiling to it and into the duct through an entry turned
    // along the duct. No ceiling (light theme) or the duct below the rack's roof: straight up. The tail runs from the
    // jack to the brush: a pulled fibre hangs from it.
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

    // The router: LAN -> the last port of the bottom row, WAN as fibre to the trays.
    const rtr = rack.querySelector('#rack-body > .rtr');
    let next = 2; // bottom row: even ports in order
    const bottom = () => { while (next <= 24 && (used.has(next) || !port(next)?.offsetParent)) next += 2; return next <= 24 ? next : 0; };
    if (rtr) {
      const lan = box(rtr.querySelector('[data-port="lan"]'));
      const last = [...tor.querySelectorAll('.tp')].filter(t => t.offsetParent && Number(t.dataset.port) % 2 === 1).pop();
      if (last) {
        const p = box(last.querySelector('.jack')), n = Number(last.dataset.port) + 1;
        const c = [{ x: lan.cx, y: lan.y + 2 }, { x: lan.cx, y: lan.y - 22 }, { x: p.cx, y: p.b + 22 }, { x: p.cx, y: p.b - 3 }];
        // The tail runs from the router to the brush between it and the switch: a pulled cord hangs from it.
        const [tail, rest] = split(c, lowEl ? cross(c, box(lowEl).cy) : .5);
        pullable('lan', 'lan', last, lan, LAN, 3.5, tail, `C${xy(rest[1])}, ${xy(rest[2])}, ${xy(rest[3])}`);
        seat(svg, p, LAN);
        used.add(n);
      }
      fiber('wan', box(rtr.querySelector('[data-port="wan"]')), FIBER, svg.dataset.uplink);
    } else {
      // The other racks: fibre from the switch's SFP towards R1.
      const sfp = tor.querySelector('.sfp');
      if (sfp && sfp.offsetParent) fiber('uplink', box(sfp), UPFIBER, svg.dataset.uplinkR1);
    }

    // Network cards: left into the vertical organiser, up along it to the switch, under it right to the port.
    const vm = rack.querySelector('#rack-body > .vm');
    if (!vm || !vm.offsetParent) return cords;
    const lane = box(vm);
    const nics = [...rack.querySelectorAll('#rack-body > .u > .nic')];
    // Across through the brush organiser under the switch (if there is one), otherwise right under the switch.
    const low = tor.nextElementSibling?.classList.contains('brush') ? box(tor.nextElementSibling) : null;
    const yBase = low ? low.cy - 6 : box(tor).b + 6;
    nics.forEach((nic, i) => {
      const n = bottom();
      if (!n) return;
      used.add(n);
      const u = nic.parentElement, j = box(nic.querySelector('.jack')), p = box(port(n).querySelector('.jack'));
      const x = lane.x + 4 + (i % 6) * 2.2;              // the cords side by side in the organiser, not on top of each other
      const y = yBase + (i % 6) * 2.4;                   // and across, each in its own lane
      const color = u.classList.contains('mgmt') ? MGMT : DATA;
      // The tail runs from the network card to the organiser. Grab slightly right of the jack: the drawer's handle is on the ear.
      const tail = [{ x: j.x + 2, y: j.cy }, { x: j.x - 14, y: j.cy }, { x: x + 10, y: j.cy }, { x, y: j.cy - 12 }];
      pullable(keyOf(u), 'nic', port(n), j, color, 2.4, tail, `L${x} ${y + 10} C${x} ${y}, ${x + 6} ${y}, ${x + 14} ${y} L${p.cx - 12} ${y} C${p.cx - 3} ${y}, ${p.cx} ${y - 4}, ${p.cx} ${p.b - 3}`, { x: j.cx + 6, y: j.cy, r: 13 });
      seat(svg, p, color);
    });
    return cords;
  }

  // The rack changed height (a unit went dark and something in it moved, an htmx update came, the canvas opened, a
  // drawer slides out): redraw the cables, or they stay where they were. The observer runs after layout and before
  // paint, so the cables (these and power.js's) move in the same frame as the units, not a frame later, which would
  // make them jerk on every change. The units themselves (snap changes heights) a frame later, so the observer does
  // not loop. A new rack after a swap gets its own observer.
  let watched = null;
  // Laid out: the cables are in place. The cords go to net.js; power.js redraws the power cables.
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
  // The log comes whole every minute: keep the list's scroll position.
  let logScroll = 0;
  document.addEventListener('htmx:beforeSwap', (e) => {
    if (e.detail.target?.id === 'unit-syslog') logScroll = e.detail.target.querySelector('ol')?.scrollTop || 0;
  });
  document.addEventListener('htmx:afterSettle', () => {
    const ol = document.querySelector('#unit-syslog ol');
    if (ol && logScroll) ol.scrollTop = logScroll;
  });
  // An explicit request (the canvas opened, a drawer came out): now, before this frame is painted.
  document.addEventListener('rack:layout', layout);
  // A <details> that changes the unit's height opened or closed (the wall's "show all", a button's code; stickers.html).
  // On close the rack keeps its height (snap holds the unit's min-height) and the resize observer stays quiet, so lay
  // out here. A MutationObserver runs before the paint; the toggle event comes a frame later, with the unit empty.
  new MutationObserver((recs) => {
    if (recs.some((r) => r.target.classList?.contains('more') || r.target.getAttribute?.('name') === 'b88-code')) layout();
  }).observe(document, { subtree: true, attributeFilter: ['open'] });

  // The rack was swapped without a reload (assets/js/aisle.js): lay it out at once, before it is shown.
  document.addEventListener('rack:swap', layout);
  // It has arrived: the cables in place, drawn from the jack to the router, plugs seated in the ports (cables.css, .draw).
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
    // The rack comes online (net.js): a unit when its cord's plug reaches the port, wire i after lag + i*step ms
    // (cables.css: a wire .55 s, its plug after 480 ms for .3 s, each wire 70 ms after the previous). No drawing: all at once.
    document.dispatchEvent(new CustomEvent('rack:drawing', { detail: draw ? { lag: 700, step: 70 } : null }));
  });
})();
