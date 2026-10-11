// Проход между стойками: стойка меняется без перезагрузки. Ссылки на стойки ряда (таблички, стрелки и любые
// ссылки на адреса из <html data-racks>), ←/→ и свайп загружают страницу стойки целиком (fetch, она маленькая
// и сразу несёт свои <title> и meta) и подменяют комнату #room. Камеру вдоль ряда двигает CSS
// (assets/css/aisle.css): через View Transitions, где они есть, иначе старая стойка уезжает копией.
// Остальные скрипты узнают о подмене из событий на document:
//   rack:swap   — новая комната уже на месте (app.js раскладывает юниты, power.js перечитывает ИБП, sticker.js
//                 убирает упавшие стикеры старой стойки, net.js держит юниты без сети, пока не протянут провода);
//                 detail.quiet — приедет без анимаций;
//   rack:landed — стойка доехала (detail.dir: 1 вперёд, -1 назад; detail.quiet — без анимаций): провода.
// Без JS работают сами ссылки; не вышло загрузить — обычный переход по ссылке.
(() => {
  const root = document.documentElement;
  const order = (root.dataset.racks || '').trim().split(/\s+/);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (sel) => document.querySelector(sel);
  const indexOf = (path) => order.indexOf(path);
  const pathOf = (a) => new URL(a.getAttribute('href'), location.href).pathname;
  const signs = () => [...document.querySelectorAll('#aisle .signs a')];

  // Стойка на экране — по горящей табличке (страница /u/<юнит> — та же стойка с выдвинутым юнитом).
  const shown = () => { const a = $('#aisle .signs a[aria-current]'); return a ? indexOf(pathOf(a)) : -1; };
  let here = location.pathname + location.search; // адрес показанной страницы
  let aim = -1; // куда едем или приехали: ←/→ считаются от неё (табличка сменится, только когда стойку подменят)

  // ---------- какие ссылки перехватывать ----------
  // Только левая кнопка без модификаторов (колёсико, Ctrl, Shift — новая вкладка, как обычно), свой сайт,
  // путь стойки и без ?запроса (?lang=ru — переключатель языка, ему нужна настоящая загрузка).
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

  // Мышью: страницу начинаем грузить уже на нажатии кнопки, к отпусканию она почти готова. Пальцем — нет:
  // касание бывает началом прокрутки, а каждая загрузка — просмотр в счётчике.
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

  // ---------- переход ----------
  let job = 0;    // номер последнего перехода: ответы на прежние уже не нужны
  let ctl = null; // его загрузка

  async function go(url, { push = true, via = null } = {}) {
    const id = ++job;
    ctl?.abort();
    if (url.pathname + url.search === here) { // та же стойка: просто наверх (или к якорю)
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
      location.href = url.href; // сервер не ответил стойкой: пусть браузер сходит сам
      return;
    }
    if (id !== job) return;
    wait(-1);
    const dest = page.url.pathname + page.url.search;
    if (push) history.pushState({ rack: dest }, '', dest + url.hash);
    here = dest;
    hop(page.doc, shown(), to, url);
  }

  // Страница стойки целиком: в ней и комната, и всё, что нужно <head>. Картинки стойки (обложка, аватарки)
  // подгружаются заранее, но не дольше 300 мс, чтобы стойка приехала уже с ними.
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

  // Пока грузится: табличка, к которой едем, мигает, стрелка подталкивает (aisle.css, .pending).
  function wait(to, via) {
    document.querySelectorAll('#aisle .pending').forEach((el) => el.classList.remove('pending'));
    const room = $('#room');
    root.classList.toggle('hop-wait', to >= 0);
    if (room) { if (to >= 0) room.setAttribute('aria-busy', 'true'); else room.removeAttribute('aria-busy'); }
    if (to < 0) return;
    signs().find((a) => indexOf(pathOf(a)) === to)?.classList.add('pending');
    if (via?.classList.contains('step')) via.classList.add('pending');
  }

  // Наверх, к проходу: камера сначала поднимается, потом едет. Сама, а не behavior: 'smooth' — так одинаково
  // во всех браузерах и известно, когда закончилась.
  let rising = null; // { raf, done }
  function toTop() {
    if (rising) { cancelAnimationFrame(rising.raf); rising.done(); rising = null; }
    const y0 = scrollY;
    if (y0 < 1) return Promise.resolve();
    if (reduce.matches) { scrollTo(0, 0); return Promise.resolve(); }
    const ms = Math.min(420, 160 + y0 / 8), t0 = performance.now();
    return new Promise((done) => {
      const me = rising = { done, raf: 0 };
      const frame = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        scrollTo(0, y0 * (1 - k) ** 3);
        if (k < 1 && rising === me) me.raf = requestAnimationFrame(frame);
        else { if (rising === me) rising = null; done(); }
      };
      me.raf = requestAnimationFrame(frame);
    });
  }

  function reveal(url) {
    const el = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (el) el.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth' });
    else if (scrollY > 0) scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
  }

  // ---------- подмена комнаты ----------
  // В <head> у каждой стойки свои заголовок, описание, robots или canonical, og:*, profile:*, twitter:*, JSON-LD —
  // их берём из новой страницы; палитру ЖК — свежую. Не трогаем viewport и theme-color (его красит theme.js).
  // Атрибуты <html> тоже из новой страницы, кроме тех, что ставит сам посетитель.
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
    const room = doc.getElementById('room');
    $('#room').replaceWith(room); // старые юниты: Alpine их разберёт, опрос htmx у отцепленных сам кончится
    if (window.htmx) htmx.process(room);
    fetch('/events/visit', { method: 'POST', keepalive: true }).catch(() => {}); // the rack is shown: a page view
    document.dispatchEvent(new CustomEvent('rack:swap', { detail: { quiet } }));
  }

  // После подмены: старая табличка гаснет (.was), фокус — туда же, где был (на стрелку или табличку),
  // скринридеру — какая стойка теперь.
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

  // ---------- камера ----------
  const VARS = ['--hop-d', '--hop-s', '--hop-oy', '--hop-ox', '--hop-ry', '--hop-dim', '--hop-blur', '--cam0'];
  const CLASSES = ['hop', 'hop-vt', 'hop-fwd', 'hop-back', 'hop-signs', 'hop-land'];
  const ms = (name, d) => { const v = getComputedStyle(root).getPropertyValue(name).trim(); return (parseFloat(v) || d) * (/ms$/.test(v) ? 1 : 1000); };
  let run = null; // переход, который сейчас едет: { dir, vt, ghost, timers, landed }

  function hop(doc, from, to, url) {
    const dir = Math.sign(to - from), focus = focusOf();
    if (reduce.matches || !dir || !$('#rack')) {
      swap(doc, true);
      settle(from, focus, url);
      document.dispatchEvent(new CustomEvent('rack:landed', { detail: { dir, quiet: true } }));
      return;
    }
    // Шаг ряда: от этой стойки до соседа в зале; соседей не видно (телефон, светлая тема) — ширина стойки
    // и проход.
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
      // Провода старой стойки — отдельными снимками, чтобы уехали вместе с ней.
      cab?.style.setProperty('view-transition-name', 'hop-cables');
      pow?.style.setProperty('view-transition-name', 'hop-power');
      net?.style.setProperty('view-transition-name', 'hop-net');
      root.classList.add('hop-vt');
      me.vt = document.startViewTransition(() => { swap(doc); on(); settle(from, focus, url); });
      me.vt.ready.catch(() => {}); // пропущенный переход (вкладка скрыта, следующий клик) — не ошибка
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

  // Копия старой стойки с проводами для браузеров без View Transitions: без id, Alpine и htmx её не трогают.
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

  // Новый переход, пока старый едет: старый сразу в конец.
  function stop() {
    const me = run;
    if (!me) return;
    me.timers.forEach(clearTimeout);
    me.vt?.skipTransition();
    me.ghost?.remove();
    clean();
    if (!me.landed) document.dispatchEvent(new CustomEvent('rack:landed', { detail: { dir: me.dir, quiet: true } }));
  }

  // Назад и вперёд в истории — та же камера, в обратную сторону. Не стойка (например, /u/<юнит>) — загрузить.
  addEventListener('popstate', () => {
    if (location.pathname + location.search === here) return; // сменился только якорь
    if (indexOf(location.pathname) < 0) { location.reload(); return; }
    go(new URL(location.href), { push: false });
  });

  // ---------- ←/→ и свайп ----------
  function step(d) {
    const now = shown(), from = aim >= 0 ? aim : now, to = from + d;
    if (from < 0 || to < 0 || to >= order.length) return;
    go(new URL(order[to], location.href), { via: from === now ? $(`#aisle a.step.${d < 0 ? 'prev' : 'next'}`) : null });
  }
  // Где стрелки и жесты заняты своим: поля ввода, галерея аватарок, холст, диалоги, провода.
  const busy = (t) => t instanceof Element && t.closest('input, textarea, select, [contenteditable], .slides, .pad, canvas, dialog, svg, .bars');

  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (busy(e.target) || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    step(e.key === 'ArrowLeft' ? -1 : 1);
  });

  // Свайп: быстрый и в основном горизонтальный, иначе это прокрутка.
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
