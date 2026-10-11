// Тема и цвет ЖК из прошлого визита: до первой отрисовки, чтобы страница не мигала.
// Отдельным файлом, а не inline: CSP страницы разрешает только свои скрипты.
(function () {
  try {
    var r = document.documentElement, t = localStorage.getItem('theme'), l = localStorage.getItem('lcd');
    if (t) r.dataset.theme = t;
    if (l) r.dataset.lcd = l;
  } catch (e) {}
})();

// Цвет панели браузера (<meta name="theme-color">, по одному на тёмную и светлую тему системы): тема, выбранная
// кнопкой (data-theme), важнее системной — тогда оба meta получают её цвет.
(function () {
  var r = document.documentElement, metas = document.querySelectorAll('meta[name="theme-color"][media]');
  function paint() {
    var t = r.dataset.theme, pick = '';
    for (var i = 0; i < metas.length; i++) {
      var m = metas[i];
      if (!m.dataset.color) m.dataset.color = m.content;
      if (t && m.media.indexOf(t) >= 0) pick = m.dataset.color;
    }
    for (var j = 0; j < metas.length; j++) metas[j].content = pick || metas[j].dataset.color;
  }
  paint();
  new MutationObserver(paint).observe(r, { attributes: true, attributeFilter: ['data-theme'] });
})();

// Переход между стойками ряда, когда страница всё-таки загружается заново (View Transitions между страницами,
// assets/css/aisle.css): вперёд по ряду — стойка уезжает влево, назад — вправо. Обычно стойку меняет без
// перезагрузки assets/js/aisle.js, сюда попадают остальные случаи: назад в историю на /u/<юнит>, загрузка
// после ошибки. Порядок стоек — <html data-racks>. Всё остальное (та же стойка, выдвинутый юнит, админка) —
// без анимации. Здесь, а не в отложенном скрипте: pagereveal срабатывает до первой отрисовки.
(function () {
  var order = (document.documentElement.dataset.racks || '').trim().split(/\s+/);
  function dir(from, to) {
    var a = order.indexOf(from), b = order.indexOf(to);
    return a < 0 || b < 0 || a === b ? '' : b < a ? 'back' : 'forward';
  }
  function apply(vt, d) {
    if (!d) vt.skipTransition();
    else if (vt.types) vt.types.add(d);
  }
  addEventListener('pageswap', function (e) {
    if (e.viewTransition && e.activation && e.activation.entry) apply(e.viewTransition, dir(location.pathname, new URL(e.activation.entry.url).pathname));
  });
  addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    var from = window.navigation && navigation.activation && navigation.activation.from;
    apply(e.viewTransition, from && from.url ? dir(new URL(from.url).pathname, location.pathname) : '');
  });
})();
