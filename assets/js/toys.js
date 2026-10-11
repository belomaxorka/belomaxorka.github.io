// Игрушки стойки, без которых всё работает: пасхалки и мелкие кнопки «как на настоящем железе».
//   - BIOS на KVM: код Konami (↑↑↓↓←→←→BA) или пять быстрых тапов по надписи «kvm · гостевая» — экран BIOS Setup
//     поверх консоли. Три настройки меняют стойку: радуга на диодах («на 20% круче»), ровный свет вместо мигания,
//     экран POST при перезагрузке сервера. Стрелки — выбор, Enter или пробел — сменить, Esc — выйти. Выбор помнится.
//   - RESET на сервере: отверстие под скрепку — сервер перезагружается (power.js гасит его и грузит заново), на его
//     ЖК пробегает POST.
//   - UID на сервере: «найди меня» — синий диод мигает, пока не нажмёшь ещё раз.
// Погасший юнит inert (power.js): его кнопки не нажимаются, BIOS на обесточенном KVM не открывается.
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
  // Ловится до всех (capture на window): ← и → — ещё и переход к соседней стойке (aisle.js); когда ↑↑↓↓ уже набраны,
  // они идут в код, а не в проход, иначе посреди кода уехала бы вся стойка.
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
    if (c) c.textContent = '[' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Barnaul' }) + ']';
  }
  // Подписи значений — data-yes/data-no: атрибут data-on html/template принял бы за обработчик события (on…) и
  // экранировал бы как строку JS, с кавычками.
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

  // ---------- RESET и UID на сервере ----------
  // Без JS эти кнопки ничего не умеют — они скрыты; показать после каждой раскладки (новая стойка, htmx).
  const reveal = () => document.querySelectorAll('.srv .uid[hidden], .srv .rst[hidden]').forEach((b) => { b.hidden = false; });
  document.addEventListener('rack:laidout', reveal);
  document.addEventListener('DOMContentLoaded', reveal);
  let posting = false;
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const rst = t?.closest('.srv .rst'), uid = t?.closest('.srv .uid');
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
  // Сервер загрузился после RESET: на ЖК — POST (если его не выключили в BIOS), потом обычные кадры.
  document.addEventListener('rack:unit', (e) => {
    if (!posting || e.detail?.key !== 'srv' || !e.detail.on) return;
    posting = false;
    const lcd = e.target.querySelector?.('.status-col .lcd');
    if (!lcd) return;
    lcd.classList.add('post');
    setTimeout(() => lcd.classList.remove('post'), 2200);
  });
})();
