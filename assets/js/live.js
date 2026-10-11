// Живые гости (site-api /events, Server-Sent Events): кто ещё смотрит стойку и что на ней происходит прямо сейчас.
//   - online: сколько страниц открыто. Каждый другой гость — патч-корд из свободного гнезда патч-панели в свободный
//     порт коммутатора (рисует app.js по data-guests на <html>); пришёл — корд протягивается, ушёл — исчезает;
//   - visit: кто-то открыл страницу — пакет бежит с потолка по оптике в роутер (на других стойках — по аплинку
//     в коммутатор), оттуда в коммутатор и к серверу;
//   - gb: новая запись в гостевой — пакет тем же путём к KVM;
//   - новые данные юнита (опрос htmx: новый трек на медиасервере, строка журнала, лампы мониторинга) — сначала пакет
//     бежит к этому юниту, и только когда он добежал, юнит меняется;
//   - фонарики: на стене зала у выключателя висит фонарик. Взял (это и есть согласие) — за курсором пятно света, и
//     куда он светит (доли ширины и высоты стойки, без всего остального), видят другие гости этой стойки; повесил —
//     погас. Чужие фонарики — такие же пятна; пропал гость или 15 с от него ничего — гаснут.
// Пакетов нет без интернета у стойки, без коммутатора или роутера; до юнита без связи пакет не доходит. Без
// анимаций (prefers-reduced-motion) и во вкладке в фоне пакетов нет, корды гостей есть. Без JS — ничего.
(() => {
  if (!window.EventSource) return;
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let cords = [], token = '';

  document.addEventListener('rack:laidout', (e) => { if (Array.isArray(e.detail?.cords)) cords = e.detail.cords; torch(); });

  function connect() {
    const es = new EventSource('/events');
    es.addEventListener('hello', (e) => { try { token = JSON.parse(e.data).token || ''; } catch {} });
    es.addEventListener('beam', (e) => { try { spot(JSON.parse(e.data)); } catch {} });
    es.addEventListener('beam-off', (e) => { try { gone(JSON.parse(e.data).id); } catch {} });
    es.addEventListener('online', (e) => {
      let n = 0;
      try { n = JSON.parse(e.data).n || 0; } catch {}
      const g = String(Math.max(0, n - 1));
      if (root.dataset.guests === g) return;
      root.dataset.guests = g;
      document.dispatchEvent(new Event('rack:layout'));
    });
    es.addEventListener('visit', () => run(document.querySelector('#rack-body > .u.srv') ? 'srv' : null));
    es.addEventListener('gb', () => run('kvm'));
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

  // ---------- пакеты ----------
  const cord = (k) => cords.find((c) => c.key === k);
  // Путь корда в SVG app.js: группа номер wire, в ней цветной контур — второй.
  const path = (c) => document.querySelectorAll('#cables > g')[c.wire]?.children[1] || null;

  // Маршрут к юниту: снаружи по оптике (WAN роутера или аплинк коммутатора; оба нарисованы от гнезда к потолку —
  // значит, против хода), по LAN роутера в коммутатор (по ходу), от коммутатора по корду юнита (против хода: корд
  // идёт от его сетевой карты). Юнита нет — до первого юнита с кордом.
  function route(target) {
    const rack = document.getElementById('rack'), body = document.getElementById('rack-body');
    if (!rack || !body || rack.classList.contains('nonet') || rack.classList.contains('powered-off')) return null;
    if (body.querySelector(':scope > .u.tor.off, :scope > .u.rtr.off')) return null;
    const legs = [];
    const up = cord('wan') || cord('uplink');
    if (!up || !path(up)) return null;
    legs.push([path(up), -1]);
    const lan = cord('lan');
    if (lan && path(lan)) legs.push([path(lan), 1]);
    const nic = (target && cord(target)) || cords.find((c) => c.type === 'nic' && c.key !== 'mgmt');
    const unit = nic && (body.querySelector(`:scope > .u[data-power="${CSS.escape(nic.key)}"]`) || body.querySelector(`:scope > .u.${CSS.escape(nic.key)}`));
    if (nic && path(nic) && unit && !unit.classList.contains('off') && !unit.classList.contains('unlinked')) legs.push([path(nic), -1]);
    return legs;
  }

  // Пускает пакет; возвращает, сколько он будет бежать (мс), или 0, если не побежал.
  function run(target) {
    if (reduce.matches || document.hidden) return 0;
    const legs = route(target);
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
      const [p, dir] = legs[leg];
      if (!p.isConnected) { dot.remove(); return; }
      const len = p.getTotalLength(), dur = Math.max(260, len * 1.1);
      const k = Math.min(1, (now - t0) / dur), at = p.getPointAtLength(dir > 0 ? k * len : (1 - k) * len);
      dot.setAttribute('cx', at.x.toFixed(1));
      dot.setAttribute('cy', at.y.toFixed(1));
      if (k < 1) { requestAnimationFrame(step); return; }
      if (++leg < legs.length) { t0 = now; requestAnimationFrame(step); return; }
      dot.classList.add('done');
      setTimeout(() => dot.remove(), 300);
    };
    requestAnimationFrame(step);
    return total;
  }

  // Опрос htmx принёс юниту новое: пакет к нему, обмен — когда пакет добежал (swap:…ms). Что считать новым — по юниту:
  // у медиасервера текст ЖК (трек), у журнала первая строка, у мониторинга состояние ламп.
  const SIG = { media: '.lcd', log: 'ol li', mon: '.matrix' };
  document.addEventListener('htmx:beforeSwap', (e) => {
    const t = e.detail.target;
    if (!(t instanceof Element) || t.parentElement?.id !== 'rack-body' || !t.hasAttribute('hx-get')) return;
    const key = Object.keys(SIG).find((k) => t.classList.contains(k));
    if (!key || !e.detail.shouldSwap) return;
    const sel = SIG[key];
    const now = t.querySelector(sel), next = new DOMParser().parseFromString(e.detail.serverResponse, 'text/html').querySelector(sel);
    const sig = (n) => (key === 'mon' ? n?.innerHTML : n?.textContent)?.replace(/\s+/g, ' ').trim() || '';
    if (sig(now) === sig(next)) return;
    const ms = run(key);
    if (ms) e.detail.swapOverride = `outerHTML swap:${Math.round(ms)}ms`;
  });
})();
