// Тема и цвет ЖК из прошлого визита: до первой отрисовки, чтобы страница не мигала.
// Отдельным файлом, а не inline: CSP страницы разрешает только свои скрипты.
(function () {
  try {
    var r = document.documentElement, t = localStorage.getItem('theme'), l = localStorage.getItem('lcd');
    if (t) r.dataset.theme = t;
    if (l) r.dataset.lcd = l;
  } catch (e) {}
})();
