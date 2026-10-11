// The rack's toys, which nothing else needs: easter eggs and small buttons "like on real hardware".
//   - the BIOS on the KVM: the Konami code (up up down down left right left right B A) or five quick taps on the
//     "kvm · guestbook" caption, a BIOS Setup screen over the console. Three settings change the rack: a rainbow on
//     the LEDs ("20% cooler"), steady light instead of blinking, a POST screen when the server restarts. The arrows
//     choose, Enter or space change, Esc leaves. The choice is remembered.
//   - RESET on the server: a hole for a paper clip; the server restarts (power.js turns it off and boots it), POST
//     runs on its LCD.
//   - UID on the server: "find me", the blue LED blinks until pressed again.
// A dark unit is inert (power.js): its buttons do not press, the BIOS of a KVM without power does not open.
(() => {
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('bios') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('bios', JSON.stringify(v)); } catch {} },
  };
  const opts = Object.assign({ rainbow: false, steady: false, logo: true }, store.get());
  const root = document.documentElement;
  const apply = () => {
    root.classList.toggle('rainbow', !!opts.rainbow);
    root.classList.toggle('steady', !!opts.steady);
  };
  apply();

  // ---------- BIOS ----------
  // Caught before everyone (capture on window): left and right also move to the next rack (aisle.js); once up up down
  // down are typed they go to the code, not the aisle, or the whole rack would leave in the middle of the code.
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
    store.set(opts);
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
  const reveal = () => document.querySelectorAll('.srv button.uid[hidden], .srv .rst[hidden]').forEach((b) => { b.hidden = false; });
  document.addEventListener('rack:laidout', reveal);
  document.addEventListener('DOMContentLoaded', reveal);
  let posting = false;
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const rst = t?.closest('.srv .rst'), uid = t?.closest('.srv button.uid');
    if (rst) {
      posting = !!opts.logo;
      document.dispatchEvent(new CustomEvent('rack:reset', { detail: { key: 'srv' } }));
    }
    if (uid) {
      const srv = uid.closest('.u.srv'), on = !srv.classList.contains('uid-on');
      srv.classList.toggle('uid-on', on);
      uid.setAttribute('aria-pressed', String(on));
    }
  });
  // The server booted after RESET: POST on its LCD (unless the BIOS turned it off), then the usual frames.
  document.addEventListener('rack:unit', (e) => {
    if (!posting || e.detail?.key !== 'srv' || !e.detail.on) return;
    posting = false;
    const lcd = e.target.querySelector?.('.status-col .lcd');
    if (!lcd) return;
    lcd.classList.add('post');
    setTimeout(() => lcd.classList.remove('post'), 2200);
  });
})();
