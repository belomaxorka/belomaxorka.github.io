// The rack's toys: the BIOS on the KVM (the Konami code or five quick taps on its caption: rainbow LEDs, steady light,
// POST on restart), RESET on the server (a hole for a paper clip) and UID (the blue "find me" LED). A dark unit is
// inert: its toys do not work.
(() => {
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  const opts = Object.assign({ rainbow: false, steady: false, logo: true }, Rack.store.json('bios', {}));
  const root = document.documentElement;
  const apply = () => {
    root.classList.toggle('rainbow', !!opts.rainbow);
    root.classList.toggle('steady', !!opts.steady);
  };
  apply();

  // ---------- BIOS ----------
  // Caught first (capture on window): once up up down down is typed, left and right go to the code, not the aisle.
  let typed = 0;
  addEventListener('keydown', (e) => {
    const t = e.target;
    if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) { typed = 0; return; }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (typed >= 4 && key === KONAMI[typed] && (key === 'ArrowLeft' || key === 'ArrowRight')) { e.stopImmediatePropagation(); e.preventDefault(); }
    typed = key === KONAMI[typed] ? typed + 1 : key === KONAMI[0] ? 1 : 0;
    if (typed === KONAMI.length) { typed = 0; open(); }
  }, true);
  let taps = [];
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('.kvm .bar')) return;
    const now = Date.now();
    taps = taps.filter((t) => now - t < 1500).concat(now);
    if (taps.length >= 5) { taps = []; open(); }
  });

  let shown = null, back = null, clock = 0;
  function open() {
    // The BIOS left open went with its KVM (the aisle swapped racks, the guestbook form swapped the unit): forget it,
    // or it would be "shown" for good and never open again.
    if (shown && !shown.isConnected) close();
    const kvm = document.querySelector('#rack-body > .u.kvm');
    const bios = kvm?.querySelector(':scope > .bios');
    if (!bios || kvm.classList.contains('off') || shown) return;
    shown = bios;
    back = document.activeElement;
    bios.hidden = false;
    paint();
    tick();
    clock = setInterval(tick, 1000);
    bios.querySelector('[data-opt]')?.focus({ preventScroll: true });
    bios.addEventListener('keydown', keys);
    bios.addEventListener('click', clickOpt);
    kvm.addEventListener('rack:unit', close, { once: true });
  }
  function close() {
    if (!shown) return;
    clearInterval(clock);
    shown.hidden = true;
    shown.removeEventListener('keydown', keys);
    shown.removeEventListener('click', clickOpt);
    shown = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }
  function tick() {
    const c = shown?.querySelector('[data-clock]');
    if (c) c.textContent = '[' + new Date().toLocaleTimeString('en-GB', { timeZone: root.dataset.tz || undefined }) + ']'; // the site's zone (Page.TZ)
  }
  // The values' captions are data-yes/data-no: html/template would take a data-on attribute for an event handler
  // (on...) and escape it as a JS string, with quotes.
  function paint() {
    shown.querySelectorAll('[data-opt]').forEach((b) => {
      const on = !!opts[b.dataset.opt];
      b.textContent = '[' + (on ? b.dataset.yes : b.dataset.no) + ']';
      b.setAttribute('aria-pressed', String(on));
    });
  }
  function flip(b) {
    opts[b.dataset.opt] = !opts[b.dataset.opt];
    Rack.store.setJSON('bios', opts);
    apply();
    paint();
  }
  function clickOpt(e) {
    const b = e.target instanceof Element && e.target.closest('[data-opt]');
    if (b) flip(b);
    else if (e.target instanceof Element && e.target.closest('[data-exit]')) close();
  }
  function keys(e) {
    const items = [...shown.querySelectorAll('[data-opt], [data-exit]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus({ preventScroll: true });
    }
  }

  // ---------- RESET and UID on the server ----------
  // Without JS these buttons can do nothing, so they are hidden; shown after every layout (a new rack, htmx).
  const reveal = () => document.querySelectorAll('#rack-body > .u button.uid[hidden], #rack-body > .u .rst[hidden]').forEach((b) => { b.hidden = false; });
  document.addEventListener('rack:laidout', reveal);
  document.addEventListener('DOMContentLoaded', reveal);
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const rst = t?.closest('#rack-body > .u .rst'), uid = t?.closest('#rack-body > .u button.uid');
    if (rst) {
      const key = Rack.keyOf(rst.closest('#rack-body > .u'));
      document.dispatchEvent(new CustomEvent('rack:reset', { detail: { key } }));
    }
    if (uid) {
      const u = uid.closest('#rack-body > .u'), on = !u.classList.contains('uid-on');
      u.classList.toggle('uid-on', on);
      uid.setAttribute('aria-pressed', String(on));
    }
  });

  // ---------- POST ----------
  // A unit boots from dark (RESET, its plug back in, the rack's power back): unless the BIOS turned it off, the unit is
  // .posting for a while (its lamp test, CSS) and each screen with data-post shows its boot over what it holds, frame by
  // frame: "|" between the frames, a frame starting with a new line adds to the one before, a screen with fewer frames
  // stays on its last. An htmx refresh swaps the unit meanwhile: the boot goes on on the new one.
  const FRAME = 700;
  const posts = new Map(); // unit key → { i: frame, timers }
  const frames = (s) => s.split('|').reduce((a, f) => [...a, f.startsWith('\n') && a.length ? a.at(-1) + f : f], []);
  function show(k) {
    const u = Rack.unitOf(document.getElementById('rack-body'), k), p = posts.get(k);
    if (!u) return;
    u.classList.toggle('posting', !!p);
    u.querySelectorAll('[data-post]').forEach((s) => {
      if (!p) { s.classList.remove('post'); delete s.dataset.frame; return; }
      if (!s.classList.contains('post')) s.scrollTop = 0; // the frames are over the top of a screen that scrolls
      const f = frames(s.dataset.post);
      s.classList.add('post');
      s.dataset.frame = f[Math.min(p.i, f.length - 1)];
    });
  }
  function stop(k) {
    posts.get(k)?.timers.forEach(clearTimeout);
    posts.delete(k);
    show(k);
  }
  document.addEventListener('rack:unit', (e) => {
    const k = e.detail?.key;
    if (!k) return;
    stop(k);
    if (!opts.logo || !e.detail.on) return;
    const n = Math.max(3, ...[...e.target.querySelectorAll('[data-post]')].map((s) => frames(s.dataset.post).length));
    const p = { i: 0, timers: [] };
    posts.set(k, p);
    for (let i = 1; i < n; i++) p.timers.push(setTimeout(() => { p.i = i; show(k); }, i * FRAME));
    p.timers.push(setTimeout(() => stop(k), n * FRAME));
    show(k);
  });
  // htmx gives a swapped unit its class from the response on settle: the boot again after both.
  const again = () => posts.forEach((_, k) => show(k));
  document.addEventListener('htmx:afterSwap', again);
  document.addEventListener('htmx:afterSettle', again);
})();
