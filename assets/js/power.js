// Питание стойки. У каждого активного юнита свой кабель от вертикального PDU на правой рейке.
// Вилку можно вытащить мышкой или пальцем: кабель повиснет и закачается (верёвка на Verlet),
// юнит погаснет. Поднести вилку к разъёму (или тапнуть по ней) — воткнётся, юнит загорится.
// Кнопка на ИБП гасит всю стойку и загружает её обратно. Шнур самого ИБП тоже выдёргивается из розетки:
// ИБП уходит на батарею (красный свет в зале, ЖК мигает, заряд тает), батарея села — гаснет всё; воткнул —
// заряжается и стойка загружается. У каждой стойки ряда своё питание: свой ИБП, кнопка, шнур, батарея, вилки.
// Щиток на стене зала (рядом с розеткой) обесточивает розетки всего ряда разом: все ИБП уходят на батарею, каждая
// стойка живёт, пока держит её батарея. Батарея считается по времени: ушёл к другой стойке — эта садится дальше.
// Состояние только у посетителя (localStorage, на полчаса: Rack.toyStore). Погасший юнит не нажимается (inert); событие rack:unit на юните
// говорит тем, кто внутри, что он погас или загрузился.
// Без JS всего этого нет: юниты просто горят и работают.
(() => {
  // Юниты с питанием; патч-панель и заглушки с наклейками пассивные, как в жизни. Несколько одинаковых юнитов
  // (контейнеры в /lab) различаются атрибутом data-power.
  const POWERED = ['tor', 'rtr', 'mgmt', 'srv', 'media', 'mon', 'log', 'sw', 'kvm', 'pve'];
  const NS = 'http://www.w3.org/2000/svg';
  const COLOR = '#4a4f57';
  const PLUG = '#1b1d20';
  const MAINS = '#26292e';       // шнур ИБП
  const DRAIN = 90, CHARGE = 30; // секунд на разрядку и зарядку батареи (ускорено, чтобы было видно)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // { racks: { <rack id>: { off, unplugged, mains, charge, at } }, breaker, breakerAt }, for Rack.TOY_TTL (rack.js).
  const store = Rack.toyStore('rack-power', () => ({}));
  const saved = store.get();
  const all = { racks: saved.racks || {}, breaker: saved.breaker !== false, breakerAt: saved.breakerAt || 0 };
  const save = () => store.set(all);
  // Питание стойки: off — кнопка ИБП; unplugged — выдернутые вилки юнитов; mains — шнур ИБП в розетке; charge — %
  // батареи, пока идёт своя симуляция (null — полная и на сети); at — когда charge посчитан.
  function rackState(id) {
    const r = (all.racks[id] ||= {});
    r.off = !!r.off;
    r.unplugged ||= {};
    r.mains = r.mains !== false;
    if (typeof r.charge !== 'number') r.charge = null;
    return r;
  }
  // Есть ли ток в розетке у ИБП этой стойки: шнур воткнут и щиток включён.
  const fed = (r) => r.mains && all.breaker;
  // Заряд к моменту now: пока стойку не видно, батарея садится (или заряжается) так же, как на глазах. ИБП ушёл на
  // батарею, когда пропал ток: выдернули шнур (тогда charge уже есть) или выключили щиток (breakerAt).
  function settle(r, now) {
    if (r.charge === null) {
      if (fed(r)) return;
      r.charge = 100;
      r.at = all.breakerAt || now;
    }
    const dt = Math.max(0, (now - (r.at || now)) / 1000);
    r.charge = fed(r) ? Math.min(100, r.charge + 100 / CHARGE * dt) : Math.max(0, r.charge - 100 / DRAIN * dt);
    if (fed(r) && r.charge >= 100) r.charge = null;
    r.at = now;
  }
  const here = () => document.getElementById('room')?.dataset.rack || '';
  let state = null, stateId = null; // питание той стойки, что сейчас в комнате (useRack)

  const ropes = new Map(); // ключ юнита → верёвка
  let probing = null;      // ключ шнура под мышью (тестер кабеля)
  let room = null, svg = null, raf = 0, calm = 0, drag = null;
  let kick = 0; // стойка доехала: куда качнуть кабели при следующей раскладке (1, -1)

  const keyOf = (u) => u.dataset.power || POWERED.find((k) => u.classList.contains(k));
  const units = () => [...document.querySelectorAll('#rack-body > .u')].filter(keyOf);
  const unitBy = (k) => units().find((u) => keyOf(u) === k);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // Стойка в комнате сменилась (или страница только открылась): её питание, досчитанное до этой минуты. Батарея
  // прошлой стойки досчитана и сохранена, её таймер остановлен; верёвки строятся заново из нового состояния.
  function useRack() {
    const id = here();
    if (state && id === stateId) return;
    const now = Date.now();
    if (state) settle(state, now);
    clearInterval(timer); timer = 0; wasDead = null;
    // Настоящие ЖК ИБП и свет в зале у новой стойки — свои; запомнить их до того, как их подменит симуляция.
    lcdReal = lightReal = null;
    ropes.clear();
    stateId = id;
    state = rackState(id);
    settle(state, now);
    save();
  }

  // ---------- юниты: разъёмы и свет ----------
  function powered(k) { return !state.off && !state.unplugged[k] && !dead(); }

  // Погасший юнит ещё и не нажимается: inert на нём и на его выдвинутом ящике — ни клика, ни наведения, ни фокуса
  // (Tab его пропускает), скринридеру его нет. Одно место на все причины: вилка, кнопка ИБП, села батарея.
  // Набранный текст, рисунок и данные остаются на месте: включили — всё как было.
  function paint(u, k, boot) {
    const on = powered(k) && !queued.has(k);
    const box = u.nextElementSibling?.classList.contains('drawer') ? u.nextElementSibling : null;
    const was = !u.hasAttribute('inert');
    if (on && u.classList.contains('off') && boot) {
      u.classList.add('booting');
      setTimeout(() => u.classList.remove('booting'), 700);
    }
    if (was && !on) shutdown(u, k, box);
    u.classList.toggle('off', !on);
    u.toggleAttribute('inert', !on);
    if (box) {
      box.classList.toggle('off', !on);
      box.toggleAttribute('inert', !on);
    }
    if (!was && on) u.dispatchEvent(new CustomEvent('rack:unit', { bubbles: true, detail: { key: k, on } }));
  }

  // Перед тем как юнит станет inert: сказать тем, кто внутри (рисовалка дописывает штрих и выходит из полного
  // экрана), закрыть его диалоги (лайтбокс гостевой модальный: внутри inert он запер бы всю страницу) и увести
  // фокус, если он был внутри.
  function shutdown(u, k, box) {
    u.dispatchEvent(new CustomEvent('rack:unit', { bubbles: true, detail: { key: k, on: false } }));
    [u, box].forEach((n) => n?.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    const f = document.activeElement;
    if (f && f !== document.body && (u.contains(f) || box?.contains(f))) park();
  }

  // Куда фокус из погасшего юнита: не на кнопку (пробел, набранный по инерции, нажал бы её), а на сам ИБП — на нём
  // видно, что с питанием, следующий Tab попадёт на его кнопку. Нет ИБП — на стойку. tabindex только на это время.
  function park() {
    const t = upsUnit() || document.getElementById('rack');
    if (!t) { document.activeElement.blur(); return; }
    if (!t.hasAttribute('tabindex')) {
      t.tabIndex = -1;
      t.addEventListener('blur', () => t.removeAttribute('tabindex'), { once: true });
    }
    t.focus({ preventScroll: true });
  }

  // Загрузка сверху вниз, юнит за юнитом. Пока очередь юнита не дошла, он тёмный и не нажимается, даже если его
  // перерисует кто-то ещё (раскладка, ответ htmx). Подменил его htmx — загружается новый.
  const queued = new Set();
  function bootAll() {
    units().forEach((u, i) => {
      const k = keyOf(u);
      if (u.classList.contains('off')) queued.add(k);
      setTimeout(() => {
        queued.delete(k);
        const cur = u.isConnected ? u : unitBy(k);
        if (cur) paint(cur, k, true);
      }, reduce.matches ? 0 : 110 * i);
    });
  }

  function ensureDom() {
    room = document.getElementById('room');
    if (!room || !document.getElementById('rack-body')) return false;
    useRack();
    svg = document.getElementById('power');
    if (!svg) {
      svg = el('svg', { id: 'power', class: 'cables power', 'aria-hidden': 'true' }, room);
      svg.addEventListener('pointerdown', grab);

    }
    units().forEach((u) => {
      if (!u.querySelector(':scope > .psu')) {
        const s = document.createElement('span');
        s.className = 'psu';
        s.setAttribute('aria-hidden', 'true');
        u.appendChild(s);
      }
      u.classList.add('has-psu'); // и после htmx: на settle он возвращает юниту class из ответа
      paint(u, keyOf(u), false);
    });
    const rack = document.getElementById('rack');
    if (rack) rack.classList.toggle('powered-off', state.off || dead());
    wireButton();
    wireTest();
    breaker();
    switcher();
    neighbours();
    if (fed(state) && state.charge === null && !testing) room.dataset.light = lamp();
    return true;
  }

  // Вся стойка погасла или загорелась: кнопкой на ИБП или села батарея (why: button, battery).
  // Шнур ИБП из розетки сам ничего не гасит — батарея ещё держит.
  function dark(on, why) { document.dispatchEvent(new CustomEvent('rack:power', { detail: { on, why } })); }

  // ---------- ИБП на батарее ----------
  // Пока шнур в розетке и батарея полна, ЖК ИБП показывает настоящие данные (NUT). Иначе — своя симуляция.
  let lcdReal = null, lightReal = null, alarmReal = false, timer = 0, wasDead = null; // null: ещё не смотрели

  // Выключатель у таблички «выход»: auto — свет по часам Барнаула (как его отдал сервер), или вручную день, вечер,
  // ночь. Пока в розетках есть ток; без тока горит аварийка, настоящая (сервер сказал battery) — тоже.
  const MODES = ['auto', 'day', 'evening', 'night'];
  let mode = (() => { try { const m = localStorage.getItem('hall-light'); return MODES.includes(m) ? m : 'auto'; } catch { return 'auto'; } })();
  function lamp() {
    if (lightReal === null) lightReal = room.dataset.light;
    return mode === 'auto' || lightReal === 'battery' ? lightReal : mode;
  }
  const upsUnit = () => document.querySelector('#rack-body > .ups');
  const upsLcd = () => document.querySelector('#rack-body > .ups .lcd');
  const full = () => { const v = parseInt(upsLcd()?.dataset.charge, 10); return v > 0 ? v : 100; };
  // Села батарея — или у стойки нет ИБП вовсе (заглушки ряда): тогда она живёт, только пока в розетке ток.
  function dead() { return upsUnit() ? dying(state) : !fed(state); }
  const dying = (r) => !fed(r) && r.charge !== null && r.charge <= 0;

  // Соседние стойки в зале (data-rack у .nb в templates/aisle.html) — те же стойки ряда: их лампы гаснут, когда та
  // стойка выключена кнопкой ИБП или села её батарея (заряд досчитан по часам), у стойки без ИБП — без тока.
  function neighbours() {
    const now = Date.now();
    document.querySelectorAll('.hall .nb[data-rack]').forEach((nb) => {
      const r = rackState(nb.dataset.rack);
      settle(r, now);
      nb.classList.toggle('dark', r.off || ('noups' in nb.dataset ? !fed(r) : dying(r)));
    });
  }

  // Стойка без ИБП (заглушки ряда) тоже живёт от него: свет в зале и юниты — как у всех, только ЖК нет.
  function battery() {
    const lcd = upsLcd();
    if (!room || testing) return;
    // Настоящие ЖК и свет — пока их не подменила симуляция; на новой стойке (rack:swap) — заново.
    if (lightReal === null) lightReal = room.dataset.light;
    if (lcd && lcdReal === null) {
      lcdReal = [...lcd.childNodes].map((n) => n.cloneNode(true));
      alarmReal = lcd.classList.contains('alarm');
    }
    const rack = document.getElementById('rack');
    if (fed(state) && (state.charge === null || state.charge >= full())) {
      if (state.charge !== null) { state.charge = null; save(); }
      clearInterval(timer); timer = 0;
      if (lcd) {
        lcd.replaceChildren(...lcdReal.map((n) => n.cloneNode(true)));
        lcd.classList.toggle('alarm', alarmReal);
      }
      room.dataset.light = lamp();
      upsUnit()?.classList.remove('off');
      rack?.classList.toggle('powered-off', state.off);
      neighbours();
      return;
    }
    const isDead = dead();
    room.dataset.light = fed(state) ? lamp() : 'battery';
    upsUnit()?.classList.toggle('off', isDead);
    rack?.classList.toggle('powered-off', state.off || isDead);
    if (lcd) screen(lcd, isDead);
    neighbours();
    // Батарея села — всё гаснет; вернулось питание — юниты загружаются сверху вниз. Сообщить только о смене
    // на глазах у посетителя, не о состоянии, с которым страница открылась.
    if (isDead !== wasDead) {
      if (isDead) units().forEach((u) => paint(u, keyOf(u), false));
      else bootAll();
      if (wasDead !== null && !state.off) dark(!isDead, 'battery');
      wasDead = isDead;
    }
  }

  // ЖК: батарейка, «на батарее · 73%» или «заряжается · 40%», сколько осталось.
  function screen(lcd, isDead) {
    lcd.classList.toggle('alarm', !fed(state) && !isDead);
    const pc = Math.round(state.charge), d = lcd.dataset;
    const bars = document.createElement('span');
    bars.className = 'batt' + (pc <= 20 ? ' low' : '');
    bars.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('i');
      if (i >= Math.ceil(pc / 20)) b.className = 'e';
      bars.appendChild(b);
    }
    const text = document.createElement('span');
    text.append((fed(state) ? d.charging : d.battery) + ' · ' + pc + '%', document.createElement('br'));
    const sub = document.createElement('span');
    sub.className = 'd';
    sub.textContent = fed(state) ? d.mains : (d.left || '%d').replace('%d', Math.ceil(state.charge / 100 * DRAIN));
    text.append(sub);
    lcd.replaceChildren(bars, text);
  }

  function runBattery() {
    if (timer) { battery(); return; }
    if (state.charge === null) state.charge = full();
    let n = 0;
    state.at = Date.now();
    timer = setInterval(() => {
      const dt = 0.5;
      state.charge = fed(state) ? Math.min(full(), state.charge + 100 / CHARGE * dt) : Math.max(0, state.charge - 100 / DRAIN * dt);
      state.at = Date.now();
      if (++n % 4 === 0 || state.charge <= 0) save();
      if (!fed(state) && state.charge <= 0) { clearInterval(timer); timer = 0; save(); }
      battery();
    }, 500);
    battery();
  }

  // ---------- кнопка на ИБП ----------
  function wireButton() {
    const b = document.querySelector('.ups .pwr');
    if (!b || b.dataset.wired) return;
    b.dataset.wired = '1';
    b.hidden = false;
    b.setAttribute('aria-pressed', String(!state.off));
    b.addEventListener('click', () => {
      const wasOn = !state.off && !dead();
      state.off = !state.off;
      save();
      b.setAttribute('aria-pressed', String(!state.off));
      document.getElementById('rack').classList.toggle('powered-off', state.off || dead());
      if (wasOn !== (!state.off && !dead())) dark(!wasOn, 'button');
      if (state.off) {
        units().forEach((u) => paint(u, keyOf(u), false));
        return;
      }
      bootAll();
    });
  }

  // ---------- выключатель света ----------
  let sw = null;
  function switcher() {
    if (sw?.isConnected) return;
    const d = document.getElementById('cables')?.dataset || {};
    sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'lightsw';
    sw.innerHTML = '<span class="plate"><i class="rocker"></i></span><span class="lbl"></span>';
    sw.addEventListener('click', () => {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      try { localStorage.setItem('hall-light', mode); } catch {}
      showSwitch();
      if (fed(state) && !dead()) room.dataset.light = lamp();
      document.dispatchEvent(new CustomEvent('rack:click', { detail: { what: 'switch' } }));
    });
    sw.dataset.labels = d.lightModes || 'auto,day,evening,night';
    sw.dataset.aria = d.lightAria || 'hall lights';
    room.appendChild(sw);
    showSwitch();
  }
  function showSwitch() {
    const names = sw.dataset.labels.split(','), name = names[MODES.indexOf(mode)] || mode;
    sw.querySelector('.lbl').textContent = name;
    sw.dataset.mode = mode;
    sw.setAttribute('aria-label', sw.dataset.aria + ': ' + name);
  }

  // ---------- самотест ИБП ----------
  // Кнопка test: ИБП пищит, ЖК гоняет батарею вниз и обратно, свет в зале трижды моргает — нагрузка на миг ушла на
  // батарею. Стойка не гаснет. Без тока, выключенный или севший ИБП тест не делает: на ЖК — отказ.
  let testing = false;
  function wireTest() {
    const b = document.querySelector('.ups .utest');
    if (!b || b.dataset.wired) return;
    b.dataset.wired = '1';
    b.hidden = false;
    b.addEventListener('click', selfTest);
  }
  function selfTest() {
    const lcd = upsLcd();
    if (!lcd || testing) return;
    const beep = (n) => document.dispatchEvent(new CustomEvent('rack:beep', { detail: { n } }));
    if (!fed(state) || state.off || dead() || state.charge !== null) {
      beep(3);
      const was = [...lcd.childNodes].map((n) => n.cloneNode(true));
      lcd.replaceChildren(lcd.dataset.testNo || 'test: no', document.createElement('br'), Object.assign(document.createElement('span'), { className: 'd', textContent: lcd.dataset.testWhy || '' }));
      setTimeout(() => { if (lcd.isConnected) lcd.replaceChildren(...was); runBattery(); }, 1800);
      return;
    }
    testing = true;
    if (lcdReal === null) { lcdReal = [...lcd.childNodes].map((n) => n.cloneNode(true)); alarmReal = lcd.classList.contains('alarm'); }
    beep(1);
    const steps = [100, 80, 60, 40, 60, 80, 100], tick = reduce.matches ? 0 : 420;
    steps.forEach((pc, i) => setTimeout(() => {
      if (!lcd.isConnected) return;
      const bars = document.createElement('span');
      bars.className = 'batt';
      bars.setAttribute('aria-hidden', 'true');
      for (let j = 0; j < 5; j++) { const c = document.createElement('i'); if (j >= Math.ceil(pc / 20)) c.className = 'e'; bars.appendChild(c); }
      const text = document.createElement('span');
      text.append(lcd.dataset.test || 'self test', document.createElement('br'), Object.assign(document.createElement('span'), { className: 'd', textContent: pc + '%' }));
      lcd.replaceChildren(bars, text);
    }, i * tick));
    if (!reduce.matches) [0, 1, 2].forEach((i) => {
      setTimeout(() => { room.dataset.light = 'battery'; }, 300 + i * 500);
      setTimeout(() => { room.dataset.light = lamp(); }, 480 + i * 500);
    });
    setTimeout(() => {
      testing = false;
      beep(1);
      if (lcd.isConnected) {
        lcd.replaceChildren(...lcdReal.map((n) => n.cloneNode(true)));
        lcd.classList.toggle('alarm', alarmReal);
      }
      room.dataset.light = lamp();
      runBattery();
    }, steps.length * tick + 300);
  }

  // ---------- перезагрузка юнита (RESET на сервере, assets/js/toys.js) ----------
  // Юнит гаснет, как без питания, и через пару секунд загружается; остальная стойка работает.
  document.addEventListener('rack:reset', (e) => {
    const k = e.detail?.key, u = k && unitBy(k);
    if (!u || !powered(k) || queued.has(k)) return;
    queued.add(k);
    paint(u, k, false);
    setTimeout(() => {
      queued.delete(k);
      const cur = unitBy(k);
      if (cur) paint(cur, k, true);
    }, reduce.matches ? 300 : 1600);
  });

  // ---------- щиток зала ----------
  // Рубильник на стене рядом с розеткой: ток во всех розетках ряда. Выключил — все ИБП на батарее (у каждой
  // стойки свой заряд, досчитанный до этой минуты), включил — заряжаются. Подписи — data-* на #cables (i18n).
  let lever = null;
  function breaker() {
    if (lever?.isConnected) return;
    const d = document.getElementById('cables')?.dataset || {};
    lever = document.createElement('button');
    lever.type = 'button';
    lever.className = 'breaker';
    lever.setAttribute('aria-label', d.breakerAria || 'hall power');
    lever.innerHTML = '<span class="box"><i class="handle"></i></span><span class="lbl"></span>';
    lever.querySelector('.lbl').textContent = d.breaker || 'hall';
    lever.addEventListener('click', () => {
      const now = Date.now();
      for (const id in all.racks) settle(all.racks[id], now);
      all.breaker = !all.breaker;
      if (!all.breaker) all.breakerAt = now;
      for (const id in all.racks) settle(all.racks[id], now);
      save();
      showBreaker();
      runBattery();
    });
    room.appendChild(lever);
    showBreaker();
  }
  function showBreaker() {
    lever.setAttribute('aria-pressed', String(all.breaker));
    lever.classList.toggle('down', !all.breaker);
  }
  // Место — на стене слева от розетки ИБП; если стены не видно (узко) — на полу правее розетки.
  function placeBreaker() {
    if (!lever) return;
    const { wall, s } = mainsAnchors(upsUnit());
    lever.classList.toggle('floor', !wall);
    lever.style.left = (wall ? s.x - 74 : s.x + 30) + 'px';
    lever.style.top = (wall ? s.y - 46 : s.y - 22) + 'px';
  }

  // ---------- геометрия ----------
  function anchors(u) {
    const R = room.getBoundingClientRect();
    const rack = document.getElementById('rack').getBoundingClientRect();
    const sock = u.querySelector(':scope > .psu').getBoundingClientRect();
    const railW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail-w')) || 34;
    const s = { x: sock.left - R.left + sock.width / 2, y: sock.top - R.top + sock.height / 2 };
    // Розетка PDU на правой рейке, чуть ниже разъёма юнита.
    const o = { x: rack.right - R.left - railW / 2, y: s.y + 8 };
    return { s, o };
  }

  // Верёвка из точек: концы — вилка (points[0]) и розетка PDU (последняя точка, всегда закреплена).
  function rest(a, b, len, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t + Math.sin(Math.PI * t) * len * 0.32;
      pts.push({ x, y, px: x, py: y });
    }
    return pts;
  }

  // Шнур ИБП: закреплён внизу ИБП (outlet — тут неподвижный конец), вилка — в розетке на стене слева от стойки
  // или, если места нет, на полу (socket). Розетка и подпись «220 В» рисуются вместе с ним.
  function mainsAnchors(ups) {
    const R = room.getBoundingClientRect();
    const rk = document.getElementById('rack').getBoundingClientRect();
    const u = (ups || document.getElementById('rack')).getBoundingClientRect();
    const railW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail-w')) || 34;
    const x0 = rk.left - R.left, b0 = rk.bottom - R.top;
    const wall = x0 > 110;
    const ox = wall ? x0 - 62 : x0 + railW + 120, oy = wall ? b0 - 40 : b0 + 34 + 26;
    // s — точка, где вилка в розетке: её центр приходится на отверстия (drawMains рисует розетку вокруг неё).
    return { wall, s: { x: ox, y: oy - 6 }, o: { x: x0 + railW + 46, y: u.bottom - R.top - 6 } };
  }

  function relayout() {
    if (!ensureDom()) return;
    const R = room.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${R.width} ${R.height}`);
    const seen = new Set();
    const ups = upsUnit();
    if (ups) {
      seen.add('mains');
      const { wall, s, o } = mainsAnchors(ups);
      let r = ropes.get('mains');
      if (!r) {
        const len = dist(s, o) * 1.25 + 40;
        r = { key: 'mains', mains: true, n: 14, len, seg: len / 14, socket: s, outlet: o, pts: rest(s, o, len, 14), plugged: state.mains };
        ropes.set('mains', r);
      } else {
        const dx = o.x - r.outlet.x, dy = o.y - r.outlet.y;
        r.socket = s;
        r.outlet = o;
        if (r.plugged && drag?.key !== 'mains') r.pts = rest(s, o, r.len, r.n);
        else r.pts.forEach((p) => { p.x += dx; p.y += dy; p.px += dx; p.py += dy; });
      }
      r.wall = wall;
    }
    if (!fed(state) || state.charge !== null) runBattery();
    placeBreaker();
    units().forEach((u) => {
      const k = keyOf(u);
      seen.add(k);
      const { s, o } = anchors(u);
      let r = ropes.get(k);
      if (!r) {
        const len = Math.max(60, dist(s, o) * 1.6);
        r = { key: k, n: 12, len, seg: len / 12, socket: s, outlet: o, pts: rest(s, o, len, 12) };
        r.plugged = !state.unplugged[k];
        ropes.set(k, r);
      } else {
        const dx = o.x - r.outlet.x, dy = o.y - r.outlet.y;
        r.socket = s;
        r.outlet = o;
        if (r.plugged && drag?.key !== k) {
          r.pts = rest(s, o, r.len, r.n);
        } else {
          r.pts.forEach((p) => { p.x += dx; p.y += dy; p.px += dx; p.py += dy; });
        }
      }
    });
    for (const k of ropes.keys()) if (!seen.has(k)) ropes.delete(k);
    // Пол и стены комнаты: выдернутая вилка ложится на фальшпол, а не улетает за край страницы.
    for (const r of ropes.values()) { r.floor = R.height - 34; r.right = R.width - 8; }
    if (kick) swing(kick);
    kick = 0;
    draw();
    wake();
  }

  // Стойка приехала из соседней (assets/js/aisle.js): кабели по инерции ещё едут в сторону хода и качаются.
  function swing(dir) {
    if (reduce.matches) return;
    for (const r of ropes.values()) {
      if (drag?.key === r.key) continue;
      const n = r.pts.length - 1;
      r.pts.forEach((p, i) => {
        if (i === 0 || i === n) return;
        const s = Math.sin(Math.PI * i / n);
        p.px = p.x + dir * 6 * s;
        p.py = p.y + 1.5 * s;
      });
    }
  }

  // ---------- физика ----------
  function step(r) {
    const g = 0.42;                           // гравитация, px за кадр²
    const damp = reduce.matches ? 0.8 : 0.985; // без анимаций — быстро успокаивается
    const last = r.pts.length - 1;
    const pinned = (i) => i === last || (i === 0 && (r.plugged || drag?.key === r.key));
    let motion = 0;
    const floor = r.floor ?? Infinity, right = r.right ?? Infinity;
    const keepIn = (p) => {
      if (p.y > floor) p.y = floor;
      if (p.x < 8) p.x = 8; else if (p.x > right) p.x = right;
    };
    r.pts.forEach((p, i) => {
      if (pinned(i)) return;
      const rub = p.y >= floor - 0.5 ? 0.7 : 1; // на полу кабель не скользит, а ложится
      const vx = (p.x - p.px) * damp * rub, vy = (p.y - p.py) * damp;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + g;
      motion += Math.abs(vx) + Math.abs(vy);
    });
    const head = r.pts[0];
    if (r.plugged) {
      head.x = head.px = r.socket.x; head.y = head.py = r.socket.y;
    } else if (drag?.key === r.key) {
      // Вилка за пальцем, но не дальше, чем пускает кабель.
      let tx = drag.x, ty = drag.y;
      const d = Math.hypot(tx - r.outlet.x, ty - r.outlet.y), max = r.len * 0.97;
      if (d > max) { tx = r.outlet.x + (tx - r.outlet.x) * max / d; ty = r.outlet.y + (ty - r.outlet.y) * max / d; }
      head.px = head.x; head.py = head.y;
      head.x = tx; head.y = ty;
      keepIn(head);
      motion += 1;
    }
    const tail = r.pts[last];
    tail.x = tail.px = r.outlet.x; tail.y = tail.py = r.outlet.y;
    for (let k = 0; k < 16; k++) {
      for (let i = 0; i < last; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001;
        const diff = (d - r.seg) / d;
        const pa = pinned(i), pb = pinned(i + 1);
        if (pa && pb) continue;
        const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
        a.x += dx * diff * wa; a.y += dy * diff * wa;
        b.x -= dx * diff * wb; b.y -= dy * diff * wb;
      }
      r.pts.forEach((p, i) => { if (!pinned(i)) keepIn(p); });
    }
    return motion;
  }

  // ---------- рисование ----------
  function drawMains(r) {
    const p = r.pts, s = r.socket;
    // Розетка на стене (или на полу) и подпись.
    // Отверстия — на 2 px ниже s: там центр корпуса воткнутой вилки (он сдвинут к кабелю), и вилка их закрывает.
    el('rect', { x: s.x - 16, y: s.y - 12, width: 32, height: 36, rx: 5, class: 'outlet' }, svg);
    el('circle', { cx: s.x - 6, cy: s.y + 2, r: 2.6, class: 'outlet-hole' }, svg);
    el('circle', { cx: s.x + 6, cy: s.y + 2, r: 2.6, class: 'outlet-hole' }, svg);
    const label = document.getElementById('cables')?.dataset.power;
    if (r.wall && label) el('text', { x: s.x - 22, y: s.y - 20, class: 'lbl' }, svg).textContent = label;
    let d = `M${p[0].x} ${p[0].y}`;
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      d += ` Q${p[i].x} ${p[i].y} ${mx} ${my}`;
    }
    d += ` L${p[p.length - 1].x} ${p[p.length - 1].y}`;
    const line = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    const cord = el('g', { class: r.key === probing ? 'probe' : '', 'data-cord': r.key }, svg);
    el('path', { ...line, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 9, transform: 'translate(0 2)' }, cord);
    el('path', { ...line, stroke: MAINS, 'stroke-width': 6 }, cord);
    el('path', { ...line, stroke: 'rgba(255,255,255,.28)', 'stroke-width': 1.6, transform: 'translate(-1.2 -1.2)' }, cord);
    // Вилка: в розетке — корпус поверх неё, кабель уходит вниз; выдернута — штыри наружу, вдоль кабеля.
    const a = r.plugged ? -Math.PI / 2 : Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x);
    const g = el('g', { transform: `translate(${p[0].x} ${p[0].y}) rotate(${a * 180 / Math.PI})` }, svg);
    el('rect', { x: -11, y: -9, width: 18, height: 18, rx: 4, fill: MAINS, stroke: 'rgba(0,0,0,.5)' }, g);
    if (!r.plugged) {
      el('rect', { x: 7, y: -6, width: 7, height: 3, rx: 1.5, fill: '#b9bec5' }, g);
      el('rect', { x: 7, y: 3, width: 7, height: 3, rx: 1.5, fill: '#b9bec5' }, g);
    }
    el('circle', { cx: 0, cy: 0, r: 18, class: 'hit', 'data-key': r.key }, g);
  }

  function draw() {
    svg.replaceChildren();
    for (const r of ropes.values()) {
      if (r.mains) { drawMains(r); continue; }
      const p = r.pts;
      // Розетка PDU.
      el('rect', { x: r.outlet.x - 6, y: r.outlet.y - 5, width: 12, height: 10, rx: 2, fill: '#0c0d0f', stroke: '#3b3f46' }, svg);
      let d = `M${p[0].x} ${p[0].y}`;
      for (let i = 1; i < p.length - 1; i++) {
        const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
        d += ` Q${p[i].x} ${p[i].y} ${mx} ${my}`;
      }
      d += ` L${p[p.length - 1].x} ${p[p.length - 1].y}`;
      const line = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      const cord = el('g', { class: r.key === probing ? 'probe' : '', 'data-cord': r.key }, svg);
      el('path', { ...line, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 7, transform: 'translate(0 2)' }, cord);
      el('path', { ...line, stroke: COLOR, 'stroke-width': 4.5 }, cord);
      el('path', { ...line, stroke: 'rgba(255,255,255,.22)', 'stroke-width': 1.2, transform: 'translate(-1 -1)' }, cord);
      // Вилка: повёрнута вдоль кабеля; когда воткнута — смотрит в разъём.
      const a = r.plugged ? Math.PI : Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x);
      const g = el('g', { transform: `translate(${p[0].x} ${p[0].y}) rotate(${a * 180 / Math.PI})` }, svg);
      el('rect', { x: -9, y: -6, width: 14, height: 12, rx: 2.5, fill: PLUG, stroke: 'rgba(255,255,255,.25)' }, g);
      el('rect', { x: 3, y: -3, width: 3, height: 6, rx: 1, fill: '#9aa0a8' }, g);
      // Широкая невидимая зона, чтобы попасть пальцем.
      el('circle', { cx: 0, cy: 0, r: 16, class: 'hit', 'data-key': r.key }, g);
    }
  }

  function tick() {
    let motion = 0;
    for (const r of ropes.values()) motion += step(r);
    draw();
    calm = motion < 0.08 && !drag ? calm + 1 : 0;
    raf = calm > 45 ? 0 : requestAnimationFrame(tick);
  }

  function wake() {
    calm = 0;
    if (!raf && svg) raf = requestAnimationFrame(tick);
  }

  // ---------- тестер кабеля ----------
  // Навёл мышь на вилку — шнур светится целиком. Только переключает класс у уже нарисованного шнура (data-cord), ничего
  // не перерисовывает: перерисовка прямо на наведении уводила круг из-под нажатия (Chrome перед pointerdown шлёт
  // pointerover новому кругу) — вилку было не схватить, а «ушёл» исчезнувшему кругу не приходит — подсветка залипала.
  // Поэтому и смотрим цель каждого движения мыши, а не pointerover/pointerout.
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || drag || !svg) return;
    const k = (e.target instanceof Element && e.target.closest('#power .hit')?.dataset.key) || null;
    if (k === probing) return;
    probing = k;
    svg.querySelectorAll('g[data-cord]').forEach((g) => g.classList.toggle('probe', g.dataset.cord === k));
  }, { passive: true });

  // ---------- руки ----------
  function local(e) {
    const R = room.getBoundingClientRect();
    return { x: e.clientX - R.left, y: e.clientY - R.top };
  }

  function grab(e) {
    const k = e.target?.dataset?.key;
    const r = k && ropes.get(k);
    if (!r) return;
    e.preventDefault();
    const at = local(e);
    drag = { key: k, ...at, from: at, wasPlugged: r.plugged, moved: false };
    addEventListener('pointermove', move);
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);
    wake();
  }

  function move(e) {
    if (!drag) return;
    const at = local(e);
    drag.x = at.x; drag.y = at.y;
    if (!drag.moved && dist(at, drag.from) > 6) {
      drag.moved = true;
      const r = ropes.get(drag.key);
      if (r.plugged) unplug(r);
    }
    wake();
  }

  function release() {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', release);
    removeEventListener('pointercancel', release);
    if (!drag) return;
    const r = ropes.get(drag.key);
    if (r) {
      if (!drag.moved) {
        // Тап: воткнутую — вытащить, висящую — воткнуть обратно.
        if (drag.wasPlugged) unplug(r); else plug(r);
      } else if (dist(r.pts[0], r.socket) < (r.mains ? 30 : 22)) {
        plug(r);
      }
    }
    drag = null;
    wake();
  }

  // Кто ещё следит за вилками (assets/js/sticker.js): событие на каждую выдернутую и воткнутую.
  const told = (key, on) => document.dispatchEvent(new CustomEvent('rack:plug', { detail: { key, on } }));

  function unplug(r) {
    r.plugged = false;
    told(r.key, false);
    if (r.mains) { state.mains = false; save(); runBattery(); return; }
    state.unplugged[r.key] = true;
    save();
    const u = unitBy(r.key);
    if (u) paint(u, r.key, false);
  }

  function plug(r) {
    r.plugged = true;
    told(r.key, true);
    if (r.mains) { state.mains = true; save(); runBattery(); return; }
    delete state.unplugged[r.key];
    save();
    const u = unitBy(r.key);
    if (u) paint(u, r.key, true);
  }

  // Раскладку стойки считает app.js; провода — сразу после неё и в том же кадре (draw в relayout), иначе они
  // догоняют юниты кадр-два спустя и дёргаются.
  document.addEventListener('rack:laidout', relayout);

  // htmx подменил юнит (опрос раз в 30–60 с, отправка гостевой) или выдвинул ящик: новый элемент сразу в состоянии
  // питания — в той же задаче, что и вставка, так что между ними не пройдёт ни один клик и юнит не мигнёт светом.
  // На settle htmx возвращает новому элементу его class из ответа (до того держит старый) — ещё раз. Опрос у
  // погасших юнитов идёт как шёл: включили — на экране сразу свежие данные.
  const again = () => { if (svg) ensureDom(); };
  document.addEventListener('htmx:afterSwap', again);
  document.addEventListener('htmx:afterSettle', again);

  // Стойку подменили без перезагрузки (assets/js/aisle.js): у новой своё питание (useRack), свой ИБП и свой свет в
  // зале; юниты и кнопку сразу привести в состояние питания, пока стойку не показали.
  document.addEventListener('rack:swap', () => {
    if (!ensureDom()) return;
    if (!fed(state) || state.charge !== null) runBattery();
  });
  // Доехала: следующая раскладка качнёт кабели (app.js раскладывает стойку на это же событие).
  document.addEventListener('rack:landed', (e) => { kick = e.detail && !e.detail.quiet ? e.detail.dir || 0 : 0; });
})();
