// Живые гости (site-api /events, Server-Sent Events): кто ещё смотрит стойку и что на ней происходит прямо сейчас.
//   - online: сколько страниц открыто. Каждый другой гость — патч-корд из свободного гнезда патч-панели в свободный
//     порт коммутатора (рисует app.js по data-guests на <html>); пришёл — корд протягивается, ушёл — исчезает;
//   - visit: кто-то открыл страницу — пакет бежит с потолка по оптике в роутер (на других стойках — по аплинку
//     в коммутатор), оттуда в коммутатор и к серверу;
//   - gb: новая запись в гостевой — пакет тем же путём к KVM.
// Пакетов нет без интернета у стойки, без коммутатора или роутера; до юнита без связи пакет не доходит. Без
// анимаций (prefers-reduced-motion) и во вкладке в фоне пакетов нет, корды гостей есть. Без JS — ничего.
(() => {
  if (!window.EventSource) return;
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let cords = [];

  document.addEventListener('rack:laidout', (e) => { if (Array.isArray(e.detail?.cords)) cords = e.detail.cords; });

  function connect() {
    const es = new EventSource('/events');
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

  function run(target) {
    if (reduce.matches || document.hidden) return;
    const legs = route(target);
    if (!legs || !legs.length) return;
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
  }
})();
