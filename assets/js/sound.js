// Звук серверной (WebAudio, всё синтезируется, файлов нет). По умолчанию выключен: тумблер «звук» на mgmt, выбор
// помнится (localStorage). Браузер даёт звук только после нажатия — тумблер и есть это нажатие.
//   - гул вентиляторов: шум через фильтр, громче, чем больше юнитов работает; стойка погасла — стихает,
//     загружается — раскручивается. Соседние стойки в зале гудят тоже (тише, издали), пока живы — и когда своя
//     погасла, зал не замолкает;
//   - ИБП на батарее пищит (пара коротких раз в 4 с), самотест — по сигналу rack:beep (power.js);
//   - щелчки: вилки питания и RJ45 (rack:plug от power.js, rack:link от net.js), рубильник, выключатель света,
//     кнопки ИБП, клавиши, RESET;
//   - загрузка — как у настоящего железа: вентиляторы пару секунд ревут на полных оборотах и стихают, один короткий
//     писк POST («всё в порядке»): сервер после RESET, вся стойка после кнопки ИБП или батареи;
//   - вкладка в фоне — звук на паузе.
(() => {
  const KEY = 'sound';
  let on = (() => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } })();
  let ctx = null, master = null, hum = null, humGain = null, timer = 0, lastBeep = 0, surgeUntil = 0, rebooting = false;

  function start() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    // Гул: коричневый шум (интеграл белого) через низкочастотный фильтр и лёгкую «лопасть» на 120 Гц.
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    hum = ctx.createBufferSource();
    hum.buffer = buf;
    hum.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const blade = ctx.createOscillator(), bladeGain = ctx.createGain();
    blade.frequency.value = 120;
    bladeGain.gain.value = 0.012;
    humGain = ctx.createGain();
    humGain.gain.value = 0;
    hum.connect(lp).connect(humGain);
    blade.connect(bladeGain).connect(humGain);
    humGain.connect(master);
    hum.start();
    blade.start();
  }

  // ---------- голоса ----------
  function tone(freq, dur, { type = 'square', vol = 0.06, at = 0 } = {}) {
    if (!ctx || !on) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + dur - 0.01);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  // Щелчок: короткий всплеск шума через полосовой фильтр — частота задаёт «материал» (пластик RJ45, вилка, рубильник).
  function click(freq, { vol = 0.35, dur = 0.03, q = 4, at = 0 } = {}) {
    if (!ctx || !on) return;
    const t = ctx.currentTime + at, n = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    g.gain.value = vol;
    src.connect(bp).connect(g).connect(master);
    src.start(t);
  }
  const beep = (n = 1) => { for (let i = 0; i < n; i++) tone(2350, 0.12, { vol: 0.035, at: i * 0.22 }); };
  // Загрузка: вентиляторы на полные обороты (сколько юнитов — столько и рёва), через пару секунд — к обычному гулу
  // (poll). Писк POST — только где есть сервер с BIOS (сервер, хост Proxmox): коммутатор и mgmt не пищат.
  function boot() {
    if (!ctx || !on) return;
    surgeUntil = Date.now() + 2200;
    humGain.gain.cancelScheduledValues(ctx.currentTime);
    humGain.gain.setTargetAtTime(0.03 + units() * 0.012 + far() * 0.014, ctx.currentTime, 0.25);
    if (document.querySelector('#rack-body > .u:is(.srv, .pve)')) tone(1000, 0.16, { vol: 0.045, at: 0.5 });
  }

  // ---------- гул и тревога ИБП по состоянию стойки ----------
  // Сколько юнитов своей стойки работает; сколько соседних стоек в зале живы (power.js гасит их .dark).
  function units() {
    const rack = document.getElementById('rack');
    return rack && !rack.classList.contains('powered-off') ? document.querySelectorAll('#rack-body > .u.has-psu:not(.off)').length : 0;
  }
  const far = () => document.querySelectorAll('.hall .nb[data-rack]:not(.dark)').length;

  function poll() {
    const n = units();
    if (!ctx || !on || Date.now() < surgeUntil) return;
    const level = (n ? 0.025 + n * 0.006 : 0) + far() * 0.014;
    humGain.gain.setTargetAtTime(level, ctx.currentTime, n ? 0.8 : 0.5);
    if (document.querySelector('#rack-body > .ups .lcd.alarm') && Date.now() - lastBeep > 4000) { lastBeep = Date.now(); beep(2); }
  }

  function set(v) {
    on = v;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
    if (on) { start(); clearInterval(timer); timer = setInterval(poll, 500); poll(); click(1800, { vol: 0.25 }); }
    else { clearInterval(timer); timer = 0; if (humGain) humGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2); }
    show();
  }

  // ---------- тумблер на mgmt ----------
  function show() {
    document.querySelectorAll('.snd').forEach((b) => {
      b.hidden = false;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? b.dataset.yes : b.dataset.no);
      b.title = on ? b.dataset.yes : b.dataset.no;
    });
  }
  document.addEventListener('DOMContentLoaded', show);
  document.addEventListener('rack:laidout', show);

  // Включить можно только нажатием: сохранённое «вкл» ждёт первого клика по странице.
  document.addEventListener('pointerdown', () => { if (on && !ctx) set(true); }, { capture: true, once: true });

  // ---------- события ----------
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    if (t.closest('.snd')) { set(!on); return; }
    if (!on) return;
    if (t.closest('.breaker')) { click(240, { vol: 0.9, dur: 0.08, q: 2 }); click(900, { vol: 0.4, at: 0.05 }); }
    else if (t.closest('.lightsw')) click(2600, { vol: 0.3 });
    else if (t.closest('.ups .pwr')) { click(700, { vol: 0.5, dur: 0.05 }); tone(1500, 0.06, { vol: 0.03, at: 0.08 }); }
    else if (t.closest('.ups .utest, .srv button.uid, .bios button')) click(3200, { vol: 0.22, dur: 0.02 });
    else if (t.closest('.srv .rst')) click(4200, { vol: 0.18, dur: 0.015, q: 8 });
    else if (t.closest('.key, .port, .bay, .pull')) click(2200, { vol: 0.18, dur: 0.02 });
  }, true);
  // Вилки питания: тяжёлый щелчок; шнур ИБП — ещё тяжелее; RJ45 — звонкий пластик с защёлкой.
  document.addEventListener('rack:plug', (e) => {
    const big = e.detail?.key === 'mains';
    click(big ? 300 : 520, { vol: big ? 0.8 : 0.55, dur: big ? 0.07 : 0.05, q: 2.5 });
  });
  document.addEventListener('rack:link', (e) => {
    click(3400, { vol: 0.3, dur: 0.018, q: 6 });
    if (e.detail?.on) click(5200, { vol: 0.2, dur: 0.012, q: 8, at: 0.04 });
  });
  document.addEventListener('rack:beep', (e) => beep(e.detail?.n || 1));
  // RESET сервера (toys.js): загрузится — POST; вся стойка включилась (power.js) — тоже.
  document.addEventListener('rack:reset', () => { rebooting = true; });
  document.addEventListener('rack:unit', (e) => {
    if (rebooting && e.detail?.on) { rebooting = false; boot(); }
  });
  document.addEventListener('rack:power', (e) => { if (e.detail?.on) boot(); });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (on) ctx.resume();
  });
})();
