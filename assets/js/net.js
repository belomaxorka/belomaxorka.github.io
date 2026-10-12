// The rack's network: the units' links and the patch cords that pull out like the power plugs (assets/js/power.js).
//
// A unit is online while its cord is in its port and the switch and the router run. Otherwise it is offline: "link
// lost / no internet" on its screens, the lamps of its network card and port dark, and the cover, the VU meter and the
// monitoring lamps too (assets/css/units/network.css); its drawer shows the same error instead of the details, and it
// is not refreshed: its htmx polls and the drawer's load are cancelled, and once the link is back it refreshes once if
// it missed something. The causes:
//   - a pulled cord: drag the plug out of a unit's network card and the cord leaves the jack, comes out of the
//     organiser and hangs; only that unit loses its link. The router's LAN or WAN (on the other racks the uplink to
//     R1): the whole rack loses the internet. Bring the plug to the jack (or tap it) and it goes back in;
//   - the rack arrived from the next one (assets/js/aisle.js): while the cables are drawn the units are offline, each
//     comes online when its cord's plug reaches the port. Without animation, all at once;
//   - the switch or the router without power (power.js; CSS then darkens the screens and lamps by itself).
// The ring's cords from the patch panel do not pull out: their jacks are the ring's links, and the ring always works.
// app.js draws the cabling (cables): it asks here which cords are pulled (Rack.pulled), draws those without their tail
// and hands all the cords over with rack:laidout. The pulled ones are the visitor's only (localStorage, for half an
// hour), per rack. A cord hidden at this width (phone: no network cards) counts as plugged in; a card that found no
// free port on the switch (rack:laidout's loose) has no link. Without JS none of this.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const store = Rack.toyStore('rack-net', () => ({})); // for Rack.TOY_TTL (rack.js)
  const saved = store.get();
  const out = saved.out && typeof saved.out === 'object' ? saved.out : {}; // 'home/mgmt' -> 1: the cord is pulled
  const save = () => store.set({ out });

  // How much of a cord hangs once let go, and how much can come out of the organiser while it is pulled (px). A
  // network card's cord hangs over the vertical organiser, where nothing is pressed; LAN and WAN over the router
  // (decoration); the uplink short: the mgmt buttons are right under the brush.
  const HANG = { nic: 100, lan: 46, wan: 44, uplink: 26 };
  const REACH = { nic: 170, lan: 150, wan: 130, uplink: 130 };
  const N = 10; // links in the rope

  let rack = '', cords = [], loose = [], room = null, svg = null, hand = null;
  const ropes = new Map(); // a pulled cord's key → its rope (rack.js): points[0] the plug, the last where the organizer holds it
  const views = new Map(); // cord key → what is drawn for it: a grab zone while it is in, the hanging cord when it is out
  const here = () => document.getElementById('room')?.dataset.rack || '';
  const has = (k) => cords.some((c) => c.key === k);
  const pulled = (k) => !!out[here() + '/' + k] && has(k);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const el = Rack.svg;
  const held = (r) => (hand?.held?.key === r.key ? hand.held : null);

  // ---------- links ----------
  // The rack has arrived: boot, the cables have not started drawing yet and nothing has a link; then waiting, whose plug is not in yet.
  let boot = false, timers = [];
  const waiting = new Set();
  const down = (k) => pulled(k) || boot || waiting.has(k);
  const unitOf = Rack.unitOf;

  // The port lamps, units without a link (.unlinked), the router without WAN or LAN, the rack without internet (.nonet):
  // one place for every cause. A port's lamp is lit when its cord is in, there is a link and the unit at its end is on.
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
    for (const k of loose) { const u = unitOf(body, k); if (u) lost.add(u); }
    body.querySelectorAll(':scope > .u').forEach((u) => u.classList.toggle('unlinked', lost.has(u)));
    const cut = (k) => has(k) && down(k);
    if (rtr) {
      // The router's LAN goes to the switch: the switch without power means no link on LAN, as with a pulled cord.
      rtr.classList.toggle('nowan', cut('wan'));
      rtr.classList.toggle('nolan', cut('lan') || !!body.querySelector(':scope > .u.tor.off'));
    }
    rk.classList.toggle('nonet', cut('lan') || cut('wan') || cut('uplink'));
    // The link is back: who missed an update refreshes, the empty drawers load.
    for (const u of missed) {
      if (!u.isConnected) missed.delete(u);
      else if (!offline(u) && !document.hidden) { missed.delete(u); refresh(u); }
    }
    body.querySelectorAll(':scope > .drawer.open[data-later]').forEach((d) => {
      const u = d.previousElementSibling;
      if (u && !offline(u)) fill(d);
    });
    body.querySelectorAll(':scope > .u .gb-status[data-net]').forEach((p) => {
      if (!offline(p.closest('.u'))) p.remove();
    });
  }

  // Offline: no link of its own, the switch or the router without power, no internet for the rack (as the screens say).
  function offline(u) {
    if (!u.classList.contains('has-nic')) return false;
    const rk = u.closest('.rack');
    return u.classList.contains('unlinked') ||
      !!rk && (rk.classList.contains('nonet') || !!rk.querySelector('#rack-body > .u.tor.off, #rack-body > .u.rtr.off'));
  }

  // An offline unit is not refreshed: its htmx poll (media, monitor, log) is cancelled, so no new track behind the
  // caption and no new LCD palette (it comes with the media). Its drawer (the request comes from the handle, app.js)
  // does not load: it comes out empty with the same error as the screens (network.css) and loads when the link is
  // back. The guestbook's form does not go either: below.
  const missed = new Set();
  document.addEventListener('htmx:beforeRequest', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const handle = t.closest('.pull[data-unit]'), u = handle ? handle.parentElement : t;
    if (u.parentElement?.id !== 'rack-body') return;
    // A tab in the background polls nothing: nobody sees the units there. Shown again, each unit that skipped a
    // poll catches up once (visibilitychange below).
    if (!handle && document.hidden && u.hasAttribute('hx-trigger')) {
      e.preventDefault();
      missed.add(u);
      return;
    }
    if (!offline(u)) return;
    e.preventDefault();
    if (handle) empty(handle); else missed.add(u);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  // Without a link the guestbook does not post: the form of an offline unit (KVM) does not go, neither through htmx nor
  // as a plain POST (caught first, in the capture phase). Above the form, why, as on the screens: the KVM has no link
  // or the switch has no power, "link lost"; the rack has no internet or the router no power, "no internet". What was
  // written and drawn stays; once the link is back the notice goes (sync) and it can be sent again.
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

  // A drawer without the details (data-later): the same drawer component (app.js), pushed back by its handle, with only the error.
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

  // The link is back: the details into the empty drawer (its content only: the drawer is out already and does not slide again).
  function fill(d) {
    const handle = d.previousElementSibling?.querySelector(':scope > .pull[data-unit]');
    if (!handle || !window.htmx) return;
    delete d.dataset.later;
    const rack = document.getElementById('room')?.dataset.rack || '';
    htmx.ajax('GET', '/fragments/unit/' + encodeURIComponent(handle.dataset.unit) + '?rack=' + encodeURIComponent(rack), { source: handle, target: d.querySelector(':scope > .slide'), swap: 'outerHTML', select: '.slide' });
  }

  // ---------- cords ----------
  // The layout (app.js): this rack's cords and where they are. Pulled ones hang from the organiser; the rack moved, they hang there still.
  function relayout(e) {
    const id = here();
    if (id !== rack) { ropes.clear(); forget(); rack = id; }
    cords = e.detail?.cords || [];
    loose = e.detail?.loose || [];
    room = document.getElementById('room');
    if (!room) return;
    svg = document.getElementById('net');
    if (!svg) {
      svg = el('svg', { id: 'net', class: 'cables net', 'aria-hidden': 'true' }, room);
      views.clear(); // a new room: the cords are drawn anew in it
      hand = Rack.hand(svg, () => room, {
        take: (k) => cords.some((c) => c.key === k && c.grab) && { out: pulled(k) },
        pull: (k) => { if (!pulled(k)) pull(k); },
        // Let go near the jack — it goes in; a tap pulls a cord that is in and puts back one that hangs.
        drop: (k) => { const r = ropes.get(k), c = cords.find((x) => x.key === k); if (r && c && dist(r.pts[0], c.at) < 22) plug(k); },
        tap: (k, was) => { if (was.out) plug(k); else pull(k); },
        moved: wake,
      });
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

  // Hangs straight down from the organiser (pulled before the page loaded).
  function hanging(c) {
    const a = c.tail[3], seg = HANG[c.type] / N, pts = [];
    for (let i = 0; i <= N; i++) pts.push({ x: a.x, y: a.y + (N - i) * seg, px: a.x, py: a.y + (N - i) * seg });
    return { key: c.key, type: c.type, cord: c, anchor: a, pts, seg };
  }

  // Just pulled: lies as in the cabling, from the jack to the organiser; then it is drawn out (step).
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

  // ---------- physics (rack.js) ----------
  function step(r) {
    const h = held(r);
    // The length: pulled, the cord comes out of the organizer as far as the hand needs (up to REACH); let go, it
    // goes back until it hangs at HANG.
    const want = h ? Math.min(REACH[r.type], Math.max(HANG[r.type], dist(h, r.anchor) * 1.1)) : HANG[r.type];
    const ds = (want / N - r.seg) * (reduce.matches ? 1 : h ? 0.3 : 0.08);
    r.seg += ds;
    return Math.abs(ds) * N + Rack.stepRope(r, { end: r.anchor, hold: h, reach: r.seg * N * 0.97, damp: reduce.matches ? 0.8 : 0.985 });
  }

  // ---------- the cable tester ----------
  // The mouse over a plug: the whole cord glows and the lamps of its switch port and of the unit's network card blink
  // fast, as with a tester at the other end (only with a link). A finger cannot hover, so phones have no tester.
  // app.js redraws the cords on every layout: the glow is set again (relayout).
  // The target is looked up on every mouse move, not by pointerover/pointerout: a grab zone can be replaced under the
  // pointer (a cord pulled or put back, another rack), and the zone that is gone gets no pointerout (power.js does the same).
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || hand?.held) return;
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

  // ---------- drawing ----------
  // Cords that are in are drawn by app.js: here their plugs only have an invisible grab zone. A pulled cord hangs.
  // Each is drawn once and then only moved: a frame changes attributes, not elements.
  function forget() {
    for (const v of views.values()) v.g.remove();
    views.clear();
  }

  function build(c, r) {
    const g = el('g', {}, svg);
    if (!r) return { g, hit: el('circle', { class: 'hit', 'data-key': c.key }, g) };
    const v = { g, paths: Rack.cord(g, c.color, c.w), plug: el('g', {}, g) };
    // The plug along the cord, nose out: RJ45 — a boot in the cord's colour, a clear body, gold contacts, a latch;
    // fibre — LC: a blue body and a white ceramic ferrule.
    if (r.type === 'wan' || r.type === 'uplink') {
      el('rect', { x: -10, y: -2.5, width: 8, height: 5, rx: 1.5, fill: c.color, stroke: 'rgba(0,0,0,.35)' }, v.plug);
      el('rect', { x: -3, y: -4, width: 8, height: 8, rx: 1.5, fill: '#2f6fd0', stroke: 'rgba(0,0,0,.45)' }, v.plug);
      el('rect', { x: 5, y: -1.4, width: 4, height: 2.8, rx: 1, fill: '#ece8dc' }, v.plug);
    } else {
      el('rect', { x: -9, y: -3, width: 7, height: 6, rx: 2, fill: c.color, stroke: 'rgba(0,0,0,.35)' }, v.plug);
      el('rect', { x: -1, y: -6, width: 6, height: 1.6, rx: .8, fill: 'rgba(214,224,233,.85)' }, v.plug);
      el('rect', { x: -3, y: -4.5, width: 10, height: 9, rx: 1.5, fill: 'rgba(214,224,233,.82)', stroke: 'rgba(0,0,0,.45)' }, v.plug);
      el('rect', { x: 4.6, y: -3.5, width: 1.8, height: 7, fill: '#d6b04a' }, v.plug);
    }
    el('circle', { cx: 0, cy: 0, r: 16, class: 'hit', 'data-key': c.key }, v.plug); // wide, to hit with a finger
    return v;
  }

  function draw() {
    if (!svg) return;
    const seen = new Set();
    let added = false;
    for (const c of cords) {
      if (!c.grab) continue;
      seen.add(c.key);
      const r = ropes.get(c.key);
      const kind = r ? `rope ${r.type} ${c.color} ${c.w}` : 'hit';
      let v = views.get(c.key);
      if (!v || v.kind !== kind) {
        v?.g.remove();
        v = build(c, r);
        v.kind = kind;
        views.set(c.key, v);
        added = true;
      }
      if (!r) {
        v.hit.setAttribute('cx', c.hit.x); v.hit.setAttribute('cy', c.hit.y); v.hit.setAttribute('r', c.hit.r);
        continue;
      }
      const p = r.pts;
      Rack.setCord(v.paths, Rack.ropePath(p));
      const a = Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x) * 180 / Math.PI;
      v.plug.setAttribute('transform', `translate(${p[0].x} ${p[0].y}) rotate(${a})`);
    }
    for (const [k, v] of views) if (!seen.has(k)) { v.g.remove(); views.delete(k); }
    // Something was drawn anew: keep the cords' order (the later on top), as app.js draws them.
    if (added) for (const c of cords) { const v = views.get(c.key); if (v) svg.appendChild(v.g); }
  }

  const anim = Rack.loop(() => {
    let motion = 0;
    for (const r of ropes.values()) motion += step(r);
    return motion;
  }, draw, () => !!hand?.held);

  function wake() {
    if (svg) anim.wake();
  }

  // Who else follows the cords: an event for each one pulled and plugged in (detail.key, the cord's key; detail.on).
  const told = (key, on) => document.dispatchEvent(new CustomEvent('rack:link', { detail: { key, on } }));

  // Pulled or plugged in: app.js redraws the cabling at once (with the tail or without); here the light and the screens.
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

  // ---------- events ----------
  // app.js draws the cords: which of this rack's are out.
  Rack.pulled = () => {
    const pre = here() + '/';
    return new Set(Object.keys(out).filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length)));
  };
  // app.js lays the rack out; the cords right after it and in the same frame.
  document.addEventListener('rack:laidout', relayout);
  // htmx swapped a unit (a poll, the guestbook): the new one is without a link at once if there is none; on settle htmx
  // gives the new element its class from the response, so again.
  document.addEventListener('htmx:afterSwap', sync);
  document.addEventListener('htmx:afterSettle', sync);
  // A unit went dark or booted (power.js): its port's lamp; the switch or the router back, the missed updates.
  // A unit going dark says so before it is .off, so after power.js is done (before the paint).
  document.addEventListener('rack:unit', () => queueMicrotask(sync));
  // A new rack (aisle.js): it is moving, so the cables will be drawn, and until then nothing has a link.
  document.addEventListener('rack:swap', (e) => {
    timers.forEach(clearTimeout);
    timers = [];
    waiting.clear();
    boot = !!e.detail && !e.detail.quiet && !reduce.matches;
    sync();
  });
  // The cables are being drawn (app.js): each unit comes online when its cord's plug reaches the port. Not drawn (the
  // swap was cut short, animations off): all at once.
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
