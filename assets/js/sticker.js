// Стикеры отклеиваются и падают на пол серверной, как листок: раскачиваются, наклоняются по ходу движения,
// медленно планируют. Когда:
//   - выдернули вилку юнита, на котором стикер (data-sticker = ключ питания юнита в power.js, srv — сервер);
//   - погасла вся стойка: кнопка на ИБП или села батарея — тогда падают все стикеры, вразнобой.
// Шнур ИБП из розетки стикеры не трогает: батарея ещё держит. Тап по упавшему — прилипает обратно.
// Где лежат — только у посетителя (localStorage). Без JS стикеры просто наклеены.
(() => {
  const KEY = 'stickers-fallen';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(fallen)); } catch {} };
  const fallen = load();   // ключ → { fx: x центра как доля ширины комнаты, dy: разброс по высоте, rot }
  if (fallen.mains) { fallen.ups = fallen.mains; delete fallen.mains; keep(); } // стикер ИБП раньше звался mains
  const live = new Map();  // ключ → { el, w, h, x, y, rot, flying }

  const room = () => document.getElementById('room');
  const sticker = (key) => document.querySelector(`[data-sticker="${key}"]`);
  // Центр лежащего стикера: на фальшполе под стойкой.
  const floorY = (r, h, dy) => r.offsetHeight - 72 - h / 2 + dy;

  function angle(node) {
    const m = getComputedStyle(node).transform;
    if (!m || m === 'none') return 0;
    const [a, b] = m.slice(m.indexOf('(') + 1, -1).split(',').map(Number);
    return Math.atan2(b, a) * 180 / Math.PI;
  }

  // Копия стикера в комнате: те же шрифт, цвета и размер, но свободная.
  function clone(src) {
    const cs = getComputedStyle(src);
    const c = src.cloneNode(true);
    c.removeAttribute('data-sticker');
    c.className = 'fallen-sticker';
    c.setAttribute('aria-hidden', 'true');
    for (const p of ['font', 'color', 'background', 'padding', 'lineHeight', 'letterSpacing', 'textAlign', 'boxShadow']) c.style[p] = cs[p];
    c.style.width = src.offsetWidth + 'px';
    c.style.height = src.offsetHeight + 'px';
    if (src.dataset.back) c.title = src.dataset.back;
    return c;
  }

  function place(s) { s.el.style.transform = `translate(${s.x - s.w / 2}px, ${s.y - s.h / 2}px) rotate(${s.rot}deg)`; }

  function settle(key, s) {
    s.flying = false;
    s.el.classList.add('on-floor');
    const R = room();
    fallen[key] = { fx: s.x / R.offsetWidth, dy: s.dy, rot: s.rot };
    keep();
  }

  function fall(key) {
    const src = sticker(key), R = room();
    if (!src || !R || live.has(key) || !src.offsetParent) return; // на телефоне стикер сервера спрятан
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
    if (reduce.matches) {
      s.y = land; s.rot = dir * 8; place(s); settle(key, s);
      return;
    }
    // Лист: маятник из стороны в сторону, вниз быстрее всего в нижней точке размаха, наклон по ходу.
    const A = 30 + Math.random() * 22;         // размах, px
    const w = 2 + Math.random() * 0.7;        // частота качания, рад/с
    const fallV = 80 + Math.random() * 30;     // скорость снижения, px/с
    const drift = dir * (6 + Math.random() * 10);
    const base = s.rot;
    let phase = Math.random() * Math.PI, t = 0, last = performance.now();
    const frame = (now) => {
      if (!s.flying) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (t < 0.5) {
        // Отходит от угла: поворот и чуть вниз, ещё держится за край.
        s.rot = base + dir * 26 * (t / 0.5) ** 2;
        s.y += 10 * dt;
      } else {
        // Пока стикер на экране, он планирует медленно; ушёл за край — догоняет пол быстрее (страница длинная,
        // а смотреть полминуты на пустой экран скучно). Прокрутишь следом — снова увидишь медленный полёт.
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
      delete fallen[key];
      keep();
    };
    if (!src || !R || reduce.matches || !src.offsetParent) return done();
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

  // Упавшие в прошлый раз лежат на полу сразу; после перестройки стойки — на своих местах.
  function restore() {
    const R = room();
    if (!R) return;
    for (const key of Object.keys(fallen)) {
      const src = sticker(key);
      if (!src || !src.offsetParent) continue;
      let s = live.get(key);
      if (!s) {
        s = { el: clone(src), w: src.offsetWidth, h: src.offsetHeight, flying: false, dy: fallen[key].dy || 0, rot: fallen[key].rot || 0 };
        s.el.addEventListener('click', () => stickBack(key));
        s.el.classList.add('on-floor');
        R.appendChild(s.el);
        src.classList.add('peeled');
        live.set(key, s);
      }
      if (s.flying) continue;
      s.x = Math.min(Math.max(fallen[key].fx * R.offsetWidth, s.w / 2 + 4), R.offsetWidth - s.w / 2 - 4);
      s.y = floorY(R, s.h, s.dy);
      place(s);
    }
  }

  // Все сразу, но не хором: каждый со своей задержкой.
  function fallAll() {
    [...document.querySelectorAll('[data-sticker]')].forEach((el, i) => {
      setTimeout(() => fall(el.dataset.sticker), reduce.matches ? 0 : i * 280 + Math.random() * 250);
    });
  }

  // power.js сообщает о каждой выдернутой вилке и о том, что погасла вся стойка.
  document.addEventListener('rack:plug', (e) => { if (!e.detail.on) fall(e.detail.key); });
  document.addEventListener('rack:power', (e) => { if (!e.detail.on) fallAll(); });
  document.addEventListener('rack:laidout', () => requestAnimationFrame(restore));

  // Стойку подменили без перезагрузки (assets/js/aisle.js): упавшие стикеры остались в старой комнате. Кто ещё
  // летел — ляжет на пол там, где был: вернёшься к той стойке — найдёшь его на полу.
  document.addEventListener('rack:swap', () => {
    const w = room()?.offsetWidth || 1;
    for (const [key, s] of live) {
      if (s.flying) {
        s.flying = false;
        fallen[key] = { fx: s.x / w, dy: s.dy, rot: Math.max(-24, Math.min(24, s.rot % 360)) };
      }
      s.el.remove();
    }
    live.clear();
    keep();
  });
})();
