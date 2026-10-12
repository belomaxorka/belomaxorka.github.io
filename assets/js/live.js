// Live guests (site-api's /events, Server-Sent Events): who else is looking at the rack and what happens on it now.
//   - online: how many pages are open. Every other guest is a patch cord from a free patch panel jack to a free switch
//     port (app.js draws them by data-guests on <html>); a guest comes, the cord is pulled in; leaves, it is gone;
//   - visit: someone opened a page: a packet runs from the ceiling along the fibre into the router, the switch and the
//     server (it serves the site; a rack without the server gets no packet: the request is not to it);
//   - gb: a new guestbook entry: a packet the same way to the KVM (only on the rack with the KVM);
//   - act, once a second, the server's real work: requests served (the lamps on the way to the server), sources
//     fetched (a packet from the server to the unit that shows the source and back), state files written (the
//     server's hdd lamp), Gatus checks run (their lamps here and on the neighbour racks);
//   - fresh: units whose source brought new data refresh at once;
//   - a unit's new data (its htmx response: a new track on the media server, a log line, the monitoring lamps): first
//     a packet runs to that unit (on other racks through the uplink into the switch), and the unit changes only when
//     it has arrived;
//   - the activity lamps (the router's WAN and LAN, the switch's ports and SFP, the network cards, the server's net and
//     hdd) blink when something really went through them;
//   - and, besides, the background chatter every network has: dim packets now and then, the ports flickering, the
//     server's disk at work. It stands for nothing site-api did and refreshes nothing; its packets are dimmer than
//     the real ones, which carry the data the units show;
//   - torches: one hangs on the hall's wall by the light switch. Take it (that is the consent) and a spot of light
//     follows the cursor, and where it shines (as fractions of the rack's width and height, nothing else) the other
//     guests of this rack see; hang it back and it is off. Others' torches are such spots too; a guest gone or 15 s
//     without news, they go out.
// No packets without the rack's internet, the switch or the router; a packet does not reach a unit without a link.
// Without animation (prefers-reduced-motion) and in a background tab there are no packets or blinks; with "steady
// light" in the BIOS the lamps do not blink (the packets still run); the guests' cords stay. Without JS, nothing.
(() => {
  if (!window.EventSource) return;
  const { motion, here } = Rack;
  const root = document.documentElement;
  let cords = [], token = '';

  document.addEventListener('rack:laidout', (e) => { if (Array.isArray(e.detail?.cords)) cords = e.detail.cords; torch(); });

  function connect() {
    const es = new EventSource('/events');
    // Every event came from the server along this stream: the lamps on the way to it blink. A broadcast (a guest came
    // or left, a visit, a guestbook entry) reached the guests too: their ports blink.
    es.addEventListener('hello', (e) => { try { token = JSON.parse(e.data).token || ''; } catch {} pulse(site()); });
    es.addEventListener('beam', (e) => { try { if (Rack.reached()) spot(JSON.parse(e.data)); } catch {} pulse(site()); });
    es.addEventListener('beam-off', (e) => { try { gone(JSON.parse(e.data).id); } catch {} pulse(site()); });
    es.addEventListener('online', (e) => {
      let n = 0;
      try { n = JSON.parse(e.data).n || 0; } catch {}
      const g = String(Math.max(0, n - 1));
      if (root.dataset.guests !== g) {
        root.dataset.guests = g;
        document.dispatchEvent(new Event('rack:layout'));
      }
      pulse(site());
      guests();
    });
    es.addEventListener('visit', () => { run(site()); guests(); });
    es.addEventListener('gb', () => { feeds('guestbook').forEach((k) => run(k)); guests(); });
    // The server's real work, once a second when there was any (site-api: live.Hub's act).
    es.addEventListener('act', (e) => { try { act(JSON.parse(e.data)); } catch { /* not ours */ } });
    // Units whose source brought new data: refreshed now, not at their next poll (hx-trigger "fresh").
    es.addEventListener('fresh', (e) => {
      let units = [];
      try { units = JSON.parse(e.data); } catch { /* not ours */ }
      for (const u of units) {
        const el = document.getElementById('unit-' + u);
        if (el && window.htmx) htmx.trigger(el, 'fresh');
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect);
  else connect();

  // ---------- torches ----------
  const rackBox = () => document.getElementById('rack')?.getBoundingClientRect();
  const spots = new Map(); // a guest's id -> { el, t: when the last one came }
  let taken = false, mine = null, sent = 0, pending = null, hook = null;

  // The torch on the wall: the template's button in the room by the light switch (hidden without JS), shown and wired
  // once in each room.
  function torch() {
    const room = document.getElementById('room');
    const b = room?.querySelector(':scope > button.torch');
    if (!b || b === hook) return;
    hook = b;
    hook.hidden = false;
    hook.addEventListener('click', () => take(!taken));
    show();
    // Others' torch spots stayed in the old room (a swap between racks): spot() draws them anew in the new one.
    spots.forEach((s) => s.el.remove());
    spots.clear();
    if (mine) room.appendChild(mine);
  }
  function show() {
    if (!hook) return;
    hook.setAttribute('aria-pressed', String(taken));
    hook.setAttribute('aria-label', taken ? hook.dataset.back : hook.dataset.take);
    hook.title = hook.getAttribute('aria-label');
    root.classList.toggle('torch-on', taken);
  }
  function take(on) {
    taken = on;
    show();
    if (!on) {
      mine?.remove();
      mine = null;
      post({ t: token, off: true });
    }
  }
  function post(b) {
    if (!b.t) return;
    pulse(site());
    fetch('/events/beam', { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  }
  // My torch: a spot following the cursor, its position in fractions of the rack, at most every 100 ms (the last one always).
  addEventListener('pointermove', (e) => {
    if (!taken || document.hidden) return;
    const room = document.getElementById('room'), R = room?.getBoundingClientRect(), B = rackBox();
    if (!room || !B) return;
    if (!mine) { mine = document.createElement('i'); mine.className = 'beam me'; room.appendChild(mine); }
    mine.style.left = (e.clientX - R.left) + 'px';
    mine.style.top = (e.clientY - R.top) + 'px';
    pending = { t: token, r: here(), x: +((e.clientX - B.left) / B.width).toFixed(4), y: +((e.clientY - B.top) / B.height).toFixed(4) };
    const now = performance.now();
    if (now - sent > 100) { sent = now; post(pending); pending = null; }
  }, { passive: true });
  setInterval(() => {
    if (pending && taken) { post(pending); pending = null; sent = performance.now(); }
    const now = Date.now();
    spots.forEach((s, id) => { if (now - s.t > 15000) gone(id); });
  }, 250);
  // The rack lost the internet: the other visitors' torches go out (they come back with their next move).
  document.addEventListener('rack:net', (e) => { if (!e.detail?.on) [...spots.keys()].forEach(gone); });
  // Another's torch on this rack: a spot in the room; on another rack: remove it.
  function spot(b) {
    if (!b?.id) return;
    if (b.r !== here()) { gone(b.id); return; }
    const room = document.getElementById('room'), R = room?.getBoundingClientRect(), B = rackBox();
    if (!room || !B) return;
    let s = spots.get(b.id);
    if (!s || !s.el.isConnected) {
      s?.el.remove();
      const el = document.createElement('i');
      el.className = 'beam';
      room.appendChild(el);
      s = { el };
      spots.set(b.id, s);
    }
    s.t = Date.now();
    s.el.style.left = (B.left - R.left + b.x * B.width) + 'px';
    s.el.style.top = (B.top - R.top + b.y * B.height) + 'px';
  }
  function gone(id) {
    const s = spots.get(id);
    if (!s) return;
    s.el.classList.add('out');
    setTimeout(() => s.el.remove(), 400);
    spots.delete(id);
  }

  // ---------- activity lamps and packets ----------
  const cord = (k) => cords.find((c) => c.key === k);
  // A cord's path in app.js's SVG: the group number wire, the coloured line in it is the second child.
  const path = (c) => document.querySelectorAll('#cables > g')[c.wire]?.children[1] || null;
  const unitOf = Rack.unitOf;
  // The units that show a source's data (data-feed, rack.js): where its packets go. The server shows "site": it
  // serves the pages and keeps the state.
  const feeds = (src) => [...(document.getElementById('rack-body')?.querySelectorAll(`:scope > .u[data-feed~="${CSS.escape(src)}"]`) || [])].map(Rack.keyOf).filter(Boolean);
  const site = () => feeds('site')[0] || '';
  // The lamps at a unit's end of its cord: its network card's, and its own net lamp if it has one.
  const ends = (u) => [u.querySelector(':scope > .nic .led'), u.querySelector('.led.net')];
  // A switch port's lamp, if it has a link (net.js lights it).
  const port = (c) => (c?.port?.classList.contains('link') ? c.port.querySelector('.led') : null);

  // A blink: data went through the lamp. No more often than it can go dark and light again.
  function flash(led) {
    if (!led || !motion() || document.hidden || root.classList.contains('steady') || led.classList.contains('tx')) return;
    led.classList.add('tx');
    setTimeout(() => led.classList.remove('tx'), 90);
  }

  // The rack is online: it has the internet (net.js: the switch, the router or the uplink, the rack feeding it) and power.
  const up = Rack.reached;

  // The way to the unit target: from outside along the fibre (the router's WAN or the switch's uplink; both drawn from
  // the jack to the ceiling, so against their direction), along the router's LAN into the switch (with it), from the
  // switch along the unit's cord (against it: the cord runs from its network card). Legs are [path, direction, the
  // lamps that blink when the packet reaches the leg's end]: the router's WAN and LAN (or the switch's SFP); the LAN
  // port and the unit's port on the switch; the lamps at the unit's end (ends). A unit running on another (a
  // container) is reached through its host's cord. The unit is not on this rack: no way, the data went elsewhere.
  function route(target) {
    if (!up()) return null;
    const body = document.getElementById('rack-body');
    const via = unitOf(body, target)?.dataset.host || target;
    const fiber = cord('wan') || cord('uplink'), nic = cord(via), unit = nic && unitOf(body, via);
    if (!fiber || !path(fiber) || !unit) return null;
    const rtr = Rack.roleOf(body, 'router');
    const legs = [[path(fiber), -1, rtr ? [rtr.querySelector('.led.wan'), rtr.querySelector('.led.lan')] : [port(fiber)]]];
    const lan = cord('lan');
    if (lan && path(lan)) legs.push([path(lan), 1, [port(lan)]]);
    legs[legs.length - 1][2].push(port(nic));
    // A packet does not reach a unit without a link.
    if (path(nic) && !unit.classList.contains('off') && !unit.classList.contains('unlinked')) {
      legs.push([path(nic), -1, ends(unit)]);
    }
    return legs;
  }

  // Data went through without a packet (an answer without new data, a stream event): the lamps on the way blink at once.
  function pulse(target) {
    route(target)?.forEach(([, , leds]) => leds.forEach(flash));
  }
  // A broadcast reached the guests too: their ports blink.
  function guests() {
    if (up()) cords.filter((c) => c.type === 'guest').forEach((c) => flash(port(c)));
  }

  // Sends a packet; returns how long it will run (ms), or 0 when it did not go.
  function run(target) {
    return travel(route(target));
  }

  // travel sends a packet along legs ([path, direction, lamps to blink at the leg's end], ...), a dim one for the
  // background chatter (bg); returns how long it will run (ms), 0 when it does not.
  function travel(legs, bg) {
    if (!motion() || document.hidden || !legs || !legs.length) return 0;
    const room = document.getElementById('room'), cab = document.getElementById('cables');
    if (!room || !cab) return 0;
    let svg = document.getElementById('packets');
    if (!svg) {
      svg = Rack.svg('svg', { id: 'packets', class: 'cables packets', 'aria-hidden': 'true' }, room);
    }
    svg.setAttribute('viewBox', cab.getAttribute('viewBox') || '');
    const total = legs.reduce((s, [p]) => s + Math.max(260, p.getTotalLength() * 1.1), 0);
    const dot = Rack.svg('circle', { r: bg ? 2.4 : 3.6, class: bg ? 'packet bg' : 'packet' }, svg);
    let leg = 0, t0 = performance.now();
    const step = (now) => {
      const [p, dir, leds] = legs[leg];
      if (!p.isConnected) { dot.remove(); return; }
      const len = p.getTotalLength(), dur = Math.max(260, len * 1.1);
      const k = Math.min(1, (now - t0) / dur), at = p.getPointAtLength(dir > 0 ? k * len : (1 - k) * len);
      dot.setAttribute('cx', at.x.toFixed(1));
      dot.setAttribute('cy', at.y.toFixed(1));
      if (k < 1) { requestAnimationFrame(step); return; }
      leds.forEach(flash);
      if (++leg < legs.length) { t0 = now; requestAnimationFrame(step); return; }
      dot.classList.add('done');
      setTimeout(() => dot.remove(), 300);
    };
    requestAnimationFrame(step);
    return total;
  }

  // ---------- the server's work (act) ----------
  // hop is the way from one unit of this rack to another through the switch: out along the first's cord (drawn from
  // its network card to the switch), in along the second's; none without a link at either end. lan is the server's way
  // to fetch: the rack must be online.
  const lan = (from, to) => (up() ? hop(from, to) : null);
  function hop(from, to) {
    const body = document.getElementById('rack-body');
    const a = cord(from), b = cord(to), ua = a && unitOf(body, from), ub = b && unitOf(body, to);
    if (!path(a) || !path(b) || !ua || !ub || [ua, ub].some((u) => u.classList.contains('off') || u.classList.contains('unlinked'))) return null;
    return [
      [path(a), 1, [port(a)]],
      [path(b), -1, ends(ub)],
    ];
  }

  // blinks n times, spread over the next second: requests come in bunches, not all in one frame.
  function blinks(leds, n) {
    for (let i = 0; i < Math.min(n, 8); i++) setTimeout(() => leds.forEach(flash), i === 0 ? 0 : Math.random() * 900);
  }

  function act(a) {
    const body = document.getElementById('rack-body');
    if (!body) return;
    const srv = site();
    // Requests served: in through the WAN, the router's LAN port and the switch to the server.
    if (a.r > 0) {
      const legs = route(srv);
      if (legs) blinks(legs.flatMap(([, , leds]) => leds), a.r);
    }
    // Every source fetched, to each unit here that shows it (data-feed). From outside the home network (site-api says
    // which: x) the packet comes in through the WAN; from inside, the server fetched it over the rack's network, there
    // and back (a rack without the server: in through its uplink, from the rack where site-api is). A source no unit
    // here shows: from outside, the lamps on the way to the server blink; from inside, it went to another rack.
    const away = new Set(a.x || []);
    for (const src of a.p || []) {
      const to = feeds(src).filter((k) => cord(unitOf(body, k)?.dataset.host || k));
      if (!to.length) {
        if (away.has(src)) pulse(srv);
        continue;
      }
      for (const k of to) {
        if (away.has(src) || !cord(srv)) { travel(route(k)); continue; }
        const ms = travel(lan(srv, k));
        if (ms) setTimeout(() => travel(lan(k, srv)), ms + 120);
      }
    }
    // A state file written: the server's disk lamp, while the server is online (the writes follow what reaches it).
    const server = Rack.unitOf(body, srv);
    if (a.d > 0 && Rack.live(server)) blinks([server.querySelector('.led.hdd')], a.d);
    // The checks Gatus ran: each lamp blinks with the others' real spacing (they arrive together, every 30 s).
    const first = Math.min(...(a.c || []).map((c) => c.t));
    for (const c of a.c || []) setTimeout(() => checked(c.n), Math.min(30000, c.t - first));
  }

  // A monitoring check ran: its lamp on the monitoring unit and on the neighbour racks, which show the same checks.
  function checked(name) {
    document.querySelectorAll(`[data-check="${CSS.escape(name)}"]`).forEach((el) => {
      const u = el.closest('#rack-body > .u');
      if (!u || Rack.live(u)) flash(el.matches('i') ? el : el.querySelector('.led')); // an offline monitor hears of no check
    });
  }

  // ---------- the background chatter ----------
  // What every network does besides the real work above: a dim packet now and then (from the internet to a unit that
  // uses it, or from one unit to another), the ports flickering, the server's disk at work. Nothing from outside without
  // the internet, nothing to a unit without power or a link, and, as for the real ones, no packets or blinks without
  // animation or in a background tab, no blinks with steady lamps (travel, flash).
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  // every(min, max, fn): fn again and again, between min and max ms apart.
  function every(min, max, fn) {
    const next = () => setTimeout(() => { fn(); next(); }, min + Math.random() * (max - min));
    next();
  }
  // The units that can talk now: their cord in a port with a link, on and linked.
  function talkers() {
    const body = document.getElementById('rack-body');
    return cords.filter((c) => c.type === 'nic' && port(c)).map((c) => unitOf(body, c.key))
      .filter((u) => u && !u.classList.contains('off') && !u.classList.contains('unlinked'));
  }
  // The lamps at both ends of a cord with a link: its port on the switch and the unit's (ends), the router's LAN, the
  // router's WAN for the fibre while the rack is online; the ring's and the guests' cords lead outside, so only then.
  function both(c) {
    const body = document.getElementById('rack-body'), rtr = Rack.roleOf(body, 'router');
    if (c.type === 'wan') return up() ? [rtr?.querySelector('.led.wan')] : [];
    if (!port(c) || ((c.type === 'ring' || c.type === 'guest') && !up())) return [];
    const u = c.type === 'nic' && unitOf(body, c.key);
    return [port(c), ...(u ? ends(u) : []), c.type === 'lan' ? rtr?.querySelector('.led.lan') : null];
  }
  every(1200, 3600, () => {
    const units = talkers();
    if (!units.length) return;
    const to = pick(units), others = units.filter((u) => u !== to);
    if (to.dataset.net === 'wan' && up() && (!others.length || Math.random() < 0.5)) {
      travel(route(Rack.keyOf(to)), true);
    } else if (others.length) {
      const from = pick(others);
      ends(from).forEach(flash);
      travel(hop(Rack.keyOf(from), Rack.keyOf(to)), true);
    }
  });
  every(250, 900, () => {
    const busy = cords.map(both).filter((l) => l.length);
    if (busy.length) pick(busy).forEach(flash);
  });
  // The server's disk: short bursts, while it has power.
  every(250, 1500, () => {
    const srv = unitOf(document.getElementById('rack-body'), site());
    const hdd = srv && !srv.classList.contains('off') ? srv.querySelector('.led.hdd') : null;
    if (!hdd) return;
    for (let i = 0, n = 1 + Math.floor(Math.random() * 4); i < n; i++) setTimeout(() => flash(hdd), i * (110 + Math.random() * 60));
  });

  // An answer to a unit's request came (an htmx poll, the drawer, a form in the drawer). A poll with something new: a
  // packet to the unit, and the swap when it arrives (swap:...ms). What is new, each unit says (data-news on the element
  // whose text changes with news: the media server's LCD, the log's lines; data-news="markup": its markup too, the
  // monitoring lamps' states). Nothing new, or not a poll: the lamps on the way to the unit just blink.
  const news = (root) => {
    const n = root?.querySelector('[data-news]');
    return n ? (n.dataset.news === 'markup' ? n.innerHTML : n.textContent).replace(/\s+/g, ' ').trim() : null;
  };
  const keyOf = (u) => (u?.matches('[data-net]') ? Rack.keyOf(u) : '');
  document.addEventListener('htmx:beforeSwap', (e) => {
    const t = e.detail.target, elt = e.detail.requestConfig?.elt || e.detail.elt;
    if (!(elt instanceof Element)) return;
    const unit = elt.closest('#rack-body > .u') || elt.closest('#rack-body > .drawer')?.previousElementSibling;
    const target = keyOf(unit);
    if (!target) return;
    const now = t === unit && t.hasAttribute('hx-get') && e.detail.shouldSwap ? news(t) : null;
    if (now !== null && now !== (news(new DOMParser().parseFromString(e.detail.serverResponse, 'text/html')) ?? '')) {
      const ms = run(target);
      if (ms) { e.detail.swapOverride = `outerHTML swap:${Math.round(ms)}ms`; return; }
    }
    pulse(target);
  });
})();
