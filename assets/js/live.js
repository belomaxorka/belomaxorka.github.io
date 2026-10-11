// Живые гости (site-api /events, Server-Sent Events): кто ещё смотрит стойку и что на ней происходит прямо сейчас.
//   - online: сколько страниц открыто. Каждый другой гость — патч-корд из свободного гнезда патч-панели в свободный
//     порт коммутатора (рисует app.js по data-guests на <html>); пришёл — корд протягивается, ушёл — исчезает;
//   - visit: кто-то открыл страницу — пакет бежит с потолка по оптике в роутер, оттуда в коммутатор и к серверу
//     (сайт отдаёт он; на стойке без сервера пакета нет: запрос не к ней);
//   - gb: новая запись в гостевой — пакет тем же путём к KVM (только на стойке с KVM);
//   - новые данные юнита (опрос htmx: новый трек на медиасервере, строка журнала, лампы мониторинга) — сначала пакет
//     бежит к этому юниту (на других стойках — по аплинку в коммутатор), и только когда он добежал, юнит меняется;
//   - лампы активности (WAN роутера, порты коммутатора, сетевые карты, net и hdd сервера) мигают, только когда через
//     них правда что-то прошло: пакет пробегает мимо, пришёл ответ на запрос этой страницы (опрос htmx без новых
//     данных, ящик, форма) — к его юниту, событие из /events или свой фонарь — к серверу, рассылка всем — порты
//     гостей; hdd — когда сервер записал визит. Ничего не идёт — горят ровно;
//   - фонарики: на стене зала у выключателя висит фонарик. Взял (это и есть согласие) — за курсором пятно света, и
//     куда он светит (доли ширины и высоты стойки, без всего остального), видят другие гости этой стойки; повесил —
//     погас. Чужие фонарики — такие же пятна; пропал гость или 15 с от него ничего — гаснут.
// Пакетов нет без интернета у стойки, без коммутатора или роутера; до юнита без связи пакет не доходит. Без
// анимаций (prefers-reduced-motion) и во вкладке в фоне пакетов и миганий нет (и с «ровным светом» в BIOS), корды
// гостей есть. Без JS — ничего.
(() => {
  if (!window.EventSource) return;
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let cords = [], token = '';

  document.addEventListener('rack:laidout', (e) => { if (Array.isArray(e.detail?.cords)) cords = e.detail.cords; torch(); });

  function connect() {
    const es = new EventSource('/events');
    // Каждое событие пришло от сервера по этому потоку — мигают лампы на пути к нему. Рассылку всем (гость пришёл или
    // ушёл, визит, запись в гостевой) получили и гости — мигают их порты.
    es.addEventListener('hello', (e) => { try { token = JSON.parse(e.data).token || ''; } catch {} pulse('srv', NET); });
    es.addEventListener('beam', (e) => { try { spot(JSON.parse(e.data)); } catch {} pulse('srv', NET); });
    es.addEventListener('beam-off', (e) => { try { gone(JSON.parse(e.data).id); } catch {} pulse('srv', NET); });
    es.addEventListener('online', (e) => {
      let n = 0;
      try { n = JSON.parse(e.data).n || 0; } catch {}
      const g = String(Math.max(0, n - 1));
      if (root.dataset.guests !== g) {
        root.dataset.guests = g;
        document.dispatchEvent(new Event('rack:layout'));
      }
      pulse('srv', NET);
      guests();
    });
    es.addEventListener('visit', () => { run('srv', [...NET, '.led.hdd']); guests(); });
    es.addEventListener('gb', () => { run('kvm'); guests(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect);
  else connect();

  // ---------- фонарики ----------
  const here = () => document.getElementById('room')?.dataset.rack || '';
  const rackBox = () => document.getElementById('rack')?.getBoundingClientRect();
  const spots = new Map(); // id гостя → { el, t: когда пришло последнее }
  let taken = false, mine = null, sent = 0, pending = null, hook = null;

  // Фонарик на стене: кнопка в комнате под выключателем света (подписи — data-* на #cables).
  function torch() {
    const room = document.getElementById('room');
    if (!room || hook?.isConnected) return;
    const d = document.getElementById('cables')?.dataset || {};
    hook = document.createElement('button');
    hook.type = 'button';
    hook.className = 'torch';
    hook.innerHTML = '<span class="shell"><i class="lens"></i></span><span class="lbl"></span>';
    hook.querySelector('.lbl').textContent = d.torch || 'torch';
    hook.dataset.take = d.torchTake || 'take the torch';
    hook.dataset.back = d.torchBack || 'hang the torch back';
    hook.addEventListener('click', () => take(!taken));
    room.appendChild(hook);
    show();
    // Пятна чужих фонарей остались в старой комнате (переход между стойками) — в новой их заново рисует spot().
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
    pulse('srv', NET);
    fetch('/events/beam', { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  }
  // Свой фонарь: пятно за курсором, позиция — долями стойки, не чаще раза в 100 мс (последняя — всегда).
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
  // Чужой фонарь на этой стойке — пятно в комнате; на другой стойке — убрать.
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

  // ---------- лампы активности и пакеты ----------
  const cord = (k) => cords.find((c) => c.key === k);
  // Путь корда в SVG app.js: группа номер wire, в ней цветной контур — второй.
  const path = (c) => document.querySelectorAll('#cables > g')[c.wire]?.children[1] || null;
  const NET = ['.led.net']; // своя лампа сети у сервера — рядом с сетевой картой мигает и она
  const unitOf = (body, k) => body.querySelector(`:scope > .u[data-power="${CSS.escape(k)}"]`) || body.querySelector(`:scope > .u.${CSS.escape(k)}`);
  // Лампа порта коммутатора — если в нём линк (её зажигает net.js).
  const port = (c) => (c?.port?.classList.contains('link') ? c.port.querySelector('.led') : null);

  // Мигнуть: через лампу прошли данные. Не чаще, чем она успевает погаснуть и загореться.
  function flash(led) {
    if (!led || reduce.matches || document.hidden || root.classList.contains('steady') || led.classList.contains('tx')) return;
    led.classList.add('tx');
    setTimeout(() => led.classList.remove('tx'), 90);
  }

  // Стойка в сети: есть интернет, коммутатор и роутер включены.
  function up() {
    const rack = document.getElementById('rack'), body = document.getElementById('rack-body');
    return !!rack && !!body && !rack.classList.contains('nonet') && !rack.classList.contains('powered-off') &&
      !body.querySelector(':scope > .u.tor.off, :scope > .u.rtr.off');
  }

  // Маршрут к юниту target: снаружи по оптике (WAN роутера или аплинк коммутатора; оба нарисованы от гнезда к
  // потолку — значит, против хода), по LAN роутера в коммутатор (по ходу), от коммутатора по корду юнита (против
  // хода: корд идёт от его сетевой карты). Ноги — [путь, направление, лампы, которые мигают, когда пакет добежал до
  // конца ноги]: WAN роутера; порт LAN и порт юнита в коммутаторе; сетевая карта юнита и extra (селекторы его ламп).
  // Юнита на этой стойке нет — маршрута нет: данные шли не к ней.
  function route(target, extra = []) {
    if (!up()) return null;
    const body = document.getElementById('rack-body');
    const fiber = cord('wan') || cord('uplink'), nic = cord(target), unit = nic && unitOf(body, target);
    if (!fiber || !path(fiber) || !unit) return null;
    const legs = [[path(fiber), -1, [body.querySelector(':scope > .u.rtr:not(.nowan) .led.wan')]]];
    const lan = cord('lan');
    if (lan && path(lan)) legs.push([path(lan), 1, [port(lan)]]);
    legs[legs.length - 1][2].push(port(nic));
    // До юнита без связи пакет не доходит.
    if (path(nic) && !unit.classList.contains('off') && !unit.classList.contains('unlinked')) {
      legs.push([path(nic), -1, [unit.querySelector(':scope > .nic .led'), ...extra.map((s) => unit.querySelector(s))]]);
    }
    return legs;
  }

  // Данные прошли без пакета (ответ без новых данных, событие потока): лампы на пути к юниту мигают разом.
  function pulse(target, extra) {
    route(target, extra)?.forEach(([, , leds]) => leds.forEach(flash));
  }
  // Рассылку всем получили и гости: мигают их порты.
  function guests() {
    if (up()) cords.filter((c) => c.type === 'guest').forEach((c) => flash(port(c)));
  }

  // Пускает пакет; возвращает, сколько он будет бежать (мс), или 0, если не побежал.
  function run(target, extra) {
    if (reduce.matches || document.hidden) return 0;
    const legs = route(target, extra);
    if (!legs || !legs.length) return 0;
    const room = document.getElementById('room'), cab = document.getElementById('cables');
    if (!room || !cab) return;
    let svg = document.getElementById('packets');
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.id = 'packets';
      svg.setAttribute('class', 'cables packets');
      svg.setAttribute('aria-hidden', 'true');
      room.appendChild(svg);
    }
    svg.setAttribute('viewBox', cab.getAttribute('viewBox') || '');
    const total = legs.reduce((s, [p]) => s + Math.max(260, p.getTotalLength() * 1.1), 0);
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '3.6');
    dot.setAttribute('class', 'packet');
    svg.appendChild(dot);
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

  // Пришёл ответ на запрос юнита (опрос htmx, ящик, форма в ящике). Опрос принёс новое — пакет к юниту, обмен — когда
  // пакет добежал (swap:…ms). Что считать новым — по юниту: у медиасервера текст ЖК (трек), у журнала первая строка,
  // у мониторинга состояние ламп. Нового нет или это не опрос — просто мигают лампы на пути к юниту.
  const SIG = { media: '.lcd', log: 'ol li', mon: '.matrix' };
  const keyOf = (u) => u && (u.dataset.power || cords.find((c) => c.type === 'nic' && u.classList.contains(c.key))?.key);
  document.addEventListener('htmx:beforeSwap', (e) => {
    const t = e.detail.target, elt = e.detail.requestConfig?.elt || e.detail.elt;
    if (!(elt instanceof Element)) return;
    const unit = elt.closest('#rack-body > .u') || elt.closest('#rack-body > .drawer')?.previousElementSibling;
    const target = keyOf(unit);
    if (!target) return;
    const key = t === unit && t.hasAttribute('hx-get') && e.detail.shouldSwap && Object.keys(SIG).find((k) => t.classList.contains(k));
    if (key) {
      const sel = SIG[key];
      const now = t.querySelector(sel), next = new DOMParser().parseFromString(e.detail.serverResponse, 'text/html').querySelector(sel);
      const sig = (n) => (key === 'mon' ? n?.innerHTML : n?.textContent)?.replace(/\s+/g, ' ').trim() || '';
      if (sig(now) !== sig(next)) {
        const ms = run(target);
        if (ms) { e.detail.swapOverride = `outerHTML swap:${Math.round(ms)}ms`; return; }
      }
    }
    pulse(target, target === 'srv' ? NET : []);
  });
})();
