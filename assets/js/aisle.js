// The aisle: the rack changes without a reload. Links to the row's racks (<html data-racks>), the arrow keys and a
// swipe fetch the rack's page and swap #room; aisle.css moves the camera (View Transitions, or a copy of the old rack).
// rack:swap: the new room is in place (detail.quiet: no animation); rack:landed: it has arrived (detail.dir). Without JS,
// or when the fetch fails, a plain navigation.
(() => {
  const root = document.documentElement;
  const order = (root.dataset.racks || '').trim().split(/\s+/);
  const $ = (sel) => document.querySelector(sel);
  const indexOf = (path) => order.indexOf(path);
  const pathOf = (a) => new URL(a.getAttribute('href'), location.href).pathname;
  const signs = () => [...document.querySelectorAll('#aisle .signs a')];

  // The rack on screen, by its lit sign (?open=<unit> is the same rack with a unit pulled out).
  const shown = () => { const a = $('#aisle .signs a[aria-current]'); return a ? indexOf(pathOf(a)) : -1; };
  let here = location.pathname + location.search; // the address of the page shown
  let aim = -1; // where we are going or have arrived: the arrow keys count from it (the sign changes only after the swap)

  // ---------- which links to take over ----------
  // The plain left click only, on this site, to a rack's path without a query (?open needs a real load).
  function linkOf(e) {
    if (e.defaultPrevented || e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
    const a = e.target instanceof Element && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
    const url = new URL(a.getAttribute('href'), location.href);
    if (url.origin !== location.origin || url.search || indexOf(url.pathname) < 0) return null;
    return { a, url };
  }

  document.addEventListener('click', (e) => {
    const l = linkOf(e);
    if (!l) return;
    e.preventDefault();
    go(l.url, { via: l.a });
  });

  // With a mouse the page starts loading on the button's press, and is nearly ready by its release. Not with a finger:
  // a touch is often the start of a scroll, and the load would be wasted.
  let early = null; // { href, ctl, p, at }
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    const l = linkOf(e);
    if (!l || l.url.pathname + l.url.search === here) return;
    early?.ctl.abort();
    const ctl = new AbortController();
    early = { href: l.url.href, ctl, p: load(l.url, ctl.signal), at: performance.now() };
    early.p.catch(() => {});
  });

  // ---------- the swap ----------
  let job = 0;    // the number of the latest swap: answers to the earlier ones are not needed any more
  let ctl = null; // its fetch

  async function go(url, { push = true, via = null } = {}) {
    const id = ++job;
    ctl?.abort();
    if (url.pathname + url.search === here) { // the same rack: just to the top (or to the anchor)
      aim = -1;
      wait(-1);
      if (push && url.hash) history.pushState(history.state, '', url.hash);
      reveal(url);
      return;
    }
    stop();
    const to = indexOf(url.pathname);
    aim = to;
    wait(to, via);
    let page;
    try {
      let p;
      if (early && early.href === url.href && performance.now() - early.at < 3000) ({ p, ctl } = early);
      else { ctl = new AbortController(); p = load(url, ctl.signal); }
      early = null;
      [page] = await Promise.all([p, toTop()]);
    } catch (err) {
      if (id !== job) return;
      aim = -1;
      wait(-1);
      location.href = url.href; // the server did not answer with a rack: let the browser go itself
      return;
    }
    if (id !== job) return;
    wait(-1);
    const dest = page.url.pathname + page.url.search;
    if (push) history.pushState({ rack: dest }, '', dest + url.hash);
    here = dest;
    hop(page.doc, shown(), to, url);
  }

  // The rack's whole page: the room and everything <head> needs. The rack's images (the cover, the avatars) are loaded
  // ahead too, for 300 ms at most, so the rack arrives with them.
  async function load(url, signal) {
    // X-Rack-Swap: not a visit yet (it may never be shown); swap() reports the rack it shows.
    const res = await fetch(url.href, { signal, headers: { Accept: 'text/html', 'X-Rack-Swap': '1' } });
    const final = new URL(res.url || url.href);
    if (!res.ok || final.origin !== location.origin) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    if (!doc.getElementById('room') || !doc.getElementById('rack')) throw new Error('not a rack page');
    const pics = [...doc.querySelectorAll('#rack img[src]:not([loading="lazy"])')].slice(0, 12).map((img) => {
      const i = new Image();
      i.src = img.getAttribute('src');
      return i.decode().catch(() => {});
    });
    await Promise.race([Promise.all(pics), new Promise((ok) => setTimeout(ok, 300))]);
    return { doc, url: final };
  }

  // While it loads: the sign we are going to blinks, the arrow nudges (aisle.css, .pending).
  function wait(to, via) {
    document.querySelectorAll('#aisle .pending').forEach((el) => el.classList.remove('pending'));
    const room = $('#room');
    root.classList.toggle('hop-wait', to >= 0);
    if (room) { if (to >= 0) room.setAttribute('aria-busy', 'true'); else room.removeAttribute('aria-busy'); }
    if (to < 0) return;
    signs().find((a) => indexOf(pathOf(a)) === to)?.classList.add('pending');
    if (via?.classList.contains('step')) via.classList.add('pending');
  }

  // Up to the aisle: the camera rises first, then moves. By hand (Rack.tween), not behavior: 'smooth', so it is the
  // same in every browser and we know when it ends. A new rise ends the one before at once.
  let rising = null; // { stop, done }
  function toTop() {
    if (rising) { rising.stop(); rising.done(); rising = null; }
    const y0 = scrollY;
    if (y0 < 1) return Promise.resolve();
    if (!Rack.motion()) { scrollTo(0, 0); return Promise.resolve(); }
    return new Promise((done) => {
      const me = rising = { done };
      me.stop = Rack.tween(Math.min(420, 160 + y0 / 8), (k) => scrollTo(0, y0 * (1 - k)), () => { if (rising === me) rising = null; done(); });
    });
  }

  function reveal(url) {
    const el = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (el) el.scrollIntoView({ behavior: Rack.motion() ? 'smooth' : 'auto' });
    else if (scrollY > 0) scrollTo({ top: 0, behavior: Rack.motion() ? 'smooth' : 'auto' });
  }

  // ---------- swapping the room ----------
  // The new page's <head> (title, meta, og:*, JSON-LD, the LCD palette) and <html> attributes come over, except viewport,
  // theme-color and what the visitor set.
  const HEAD = 'title, meta[name]:not([name="viewport"]):not([name="theme-color"]), meta[property], ' +
    'link[rel="canonical"], link[rel="alternate"], link[rel="me"], script[type="application/ld+json"]';
  const OWN = new Set(['class', 'style', 'data-theme', 'data-lcd']);

  function swap(doc, quiet = false) {
    const olds = [...document.head.querySelectorAll(HEAD)];
    const anchor = olds[0] || null;
    doc.head.querySelectorAll(HEAD).forEach((n) => document.head.insertBefore(n, anchor));
    olds.forEach((n) => n.remove());
    const pal = doc.getElementById('cover-palette'), mine = document.getElementById('cover-palette');
    if (pal && mine) mine.textContent = pal.textContent;
    for (const { name, value } of [...doc.documentElement.attributes]) {
      if (!OWN.has(name) && root.getAttribute(name) !== value) root.setAttribute(name, value);
    }
    const room = doc.getElementById('room'), old = $('#room');
    // The old units' components are destroyed here: Alpine's own clean-up skips a removed element it never started,
    // and the first page's #room is one, so its components (the guestbook's draft, listeners on window) would live on.
    // htmx polls of detached elements stop by themselves.
    window.Alpine?.destroyTree(old);
    old.replaceWith(room);
    if (window.htmx) htmx.process(room);
    fetch('/events/visit', { method: 'POST', keepalive: true }).catch(() => {}); // the rack is shown: a page view
    document.dispatchEvent(new CustomEvent('rack:swap', { detail: { quiet } }));
  }

  // After the swap: the old sign goes dark (.was), the focus goes where it was (an arrow or a sign), and screen
  // readers hear which rack this is.
  let live = null;
  function settle(from, focus, url) {
    signs().find((a) => indexOf(pathOf(a)) === from && !a.hasAttribute('aria-current'))?.classList.add('was');
    if (focus) (focus !== 'sign' && $(`#aisle a.step.${focus}`) || $('#aisle .signs a[aria-current]'))?.focus({ preventScroll: true });
    if (url.hash) reveal(url);
    const a = $('#aisle .signs a[aria-current]'), nav = $('#aisle');
    if (!a || !nav) return;
    if (!live) {
      live = document.createElement('p');
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      document.body.append(live);
    }
    const name = [...a.children].map((n) => n.textContent.trim()).filter(Boolean).join(' · ');
    live.textContent = (nav.dataset.now || '%s').replace('%s', name);
  }

  const focusOf = () => {
    const f = document.activeElement;
    return f instanceof Element && f.closest('#aisle') ? (f.dataset.step || 'sign') : null;
  };

  // ---------- the camera ----------
  const VARS = ['--hop-d', '--hop-s', '--hop-oy', '--hop-ox', '--hop-ry', '--hop-dim', '--hop-blur', '--cam0'];
  const CLASSES = ['hop', 'hop-vt', 'hop-fwd', 'hop-back', 'hop-signs', 'hop-land'];
  const ms = (name, d) => { const v = getComputedStyle(root).getPropertyValue(name).trim(); return (parseFloat(v) || d) * (/ms$/.test(v) ? 1 : 1000); };
  let run = null; // the swap moving now: { dir, vt, ghost, timers, landed }

  function hop(doc, from, to, url) {
    const dir = Math.sign(to - from), focus = focusOf();
    if (!Rack.motion() || !dir || !$('#rack')) {
      swap(doc, true);
      settle(from, focus, url);
      document.dispatchEvent(new CustomEvent('rack:landed', { detail: { dir, quiet: true } }));
      return;
    }
    // The row's step: from this rack to its neighbour in the hall; no neighbours in sight (phone, light theme): the
    // rack's width and the aisle.
    const room = $('#room'), rack = $('#rack'), nb = $('#room .hall .nb.r');
    const R = room.getBoundingClientRect(), K = rack.getBoundingClientRect();
    const nbOn = nb && getComputedStyle(nb).display !== 'none';
    const D = nbOn ? nb.getBoundingClientRect().left + nb.offsetWidth / 2 - (K.left + K.width / 2) : K.width + 28;
    const mid = innerHeight / 2;
    const vars = {
      '--hop-d': dir * Math.round(D) + 'px', '--hop-s': dir,
      '--hop-oy': Math.round(mid - K.top) + 'px',
      '--hop-ox': Math.round(K.left - R.left + K.width / 2) + 'px', '--hop-ry': Math.round(mid - R.top) + 'px',
      '--hop-dim': nbOn ? .55 : 1, '--hop-blur': nbOn ? '1.2px' : '0px', '--cam0': room.style.getPropertyValue('--cam') || from + 1,
    };
    for (const k in vars) root.style.setProperty(k, vars[k]);
    const me = run = { dir, timers: [], landed: false };
    const on = () => {
      if (run !== me) return;
      root.classList.add('hop', dir > 0 ? 'hop-fwd' : 'hop-back', 'hop-signs');
      me.timers.push(setTimeout(() => root.classList.remove('hop-signs'), 1400));
    };
    const cab = $('#cables'), pow = $('#power'), net = $('#net');
    if (document.startViewTransition) {
      // The old rack's cables as separate snapshots, so they leave with it.
      cab?.style.setProperty('view-transition-name', 'hop-cables');
      pow?.style.setProperty('view-transition-name', 'hop-power');
      net?.style.setProperty('view-transition-name', 'hop-net');
      root.classList.add('hop-vt');
      me.vt = document.startViewTransition(() => { swap(doc); on(); settle(from, focus, url); });
      me.vt.ready.catch(() => {}); // a skipped transition (the tab hidden, the next click) is not an error
      me.vt.finished.then(() => land(me), () => land(me));
      me.vt.updateCallbackDone.catch(() => { location.href = url.href; });
    } else {
      me.ghost = ghost(room, rack, cab, pow, net);
      swap(doc);
      $('#room').append(me.ghost);
      on();
      settle(from, focus, url);
      me.timers.push(setTimeout(() => land(me), ms('--hop-t', .72)));
    }
  }

  // A copy of the old rack with its cables for browsers without View Transitions: no id, so Alpine and htmx leave it alone.
  function ghost(room, rack, ...svgs) {
    const R = room.getBoundingClientRect(), K = rack.getBoundingClientRect();
    const g = document.createElement('div');
    g.className = 'hop-ghost';
    g.setAttribute('aria-hidden', 'true');
    g.setAttribute('x-ignore', '');
    g.inert = true;
    const copy = rack.cloneNode(true);
    Object.assign(copy.style, { position: 'absolute', margin: '0', left: K.left - R.left + 'px', top: K.top - R.top + 'px', width: K.width + 'px' });
    g.append(copy, ...svgs.filter(Boolean).map((s) => s.cloneNode(true)));
    g.querySelectorAll('[id], [x-data], [hx-trigger]').forEach((el) => {
      el.removeAttribute('id');
      el.removeAttribute('x-data');
      el.removeAttribute('hx-trigger');
    });
    return g;
  }

  function land(me) {
    if (run !== me || me.landed) return;
    me.landed = true;
    me.ghost?.remove();
    root.classList.remove('hop', 'hop-vt');
    root.classList.add('hop-land');
    document.dispatchEvent(new CustomEvent('rack:landed', { detail: { dir: me.dir } }));
    me.timers.push(setTimeout(() => { if (run === me) clean(); }, 1100));
  }

  function clean() {
    CLASSES.forEach((c) => root.classList.remove(c));
    VARS.forEach((v) => root.style.removeProperty(v));
    run = null;
  }

  // A new swap while the old one moves: the old one jumps to its end.
  function stop() {
    const me = run;
    if (!me) return;
    me.timers.forEach(clearTimeout);
    me.vt?.skipTransition();
    me.ghost?.remove();
    clean();
    if (!me.landed) document.dispatchEvent(new CustomEvent('rack:landed', { detail: { dir: me.dir, quiet: true } }));
  }

  // Back and forward in the history: the same camera, the other way. Not a rack's address: load it.
  addEventListener('popstate', () => {
    if (location.pathname + location.search === here) return; // only the anchor changed
    if (indexOf(location.pathname) < 0) { location.reload(); return; }
    go(new URL(location.href), { push: false });
  });

  // ---------- the arrow keys and the swipe ----------
  function step(d) {
    const now = shown(), from = aim >= 0 ? aim : now, to = from + d;
    if (from < 0 || to < 0 || to >= order.length) return;
    go(new URL(order[to], location.href), { via: from === now ? $(`#aisle a.step.${d < 0 ? 'prev' : 'next'}`) : null });
  }
  // Where the arrows and gestures have their own job: inputs, the avatar gallery, the canvas, dialogs, the cables.
  const busy = (t) => t instanceof Element && t.closest('input, textarea, select, [contenteditable], .slides, .pad, canvas, dialog, svg, .bars');

  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (busy(e.target) || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    step(e.key === 'ArrowLeft' ? -1 : 1);
  });

  // A swipe: fast and mostly horizontal, otherwise it is a scroll.
  let start = null;
  addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    start = e.touches.length === 1 && !busy(e.target) ? { x: t.clientX, y: t.clientY, at: e.timeStamp } : null;
  }, { passive: true });
  addEventListener('touchend', (e) => {
    if (!start) return;
    const t = e.changedTouches[0], dx = t.clientX - start.x, dy = t.clientY - start.y, quick = e.timeStamp - start.at < 700;
    start = null;
    if (quick && Math.abs(dx) > 80 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx > 0 ? -1 : 1);
  }, { passive: true });
})();
