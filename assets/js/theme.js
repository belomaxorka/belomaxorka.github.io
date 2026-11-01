// The theme and the LCD colour from the last visit: before the first paint, so the page does not flash.
// A file of its own, not inline: the page's CSP allows only its own scripts.
(function () {
  try {
    var r = document.documentElement, t = localStorage.getItem('theme'), l = localStorage.getItem('lcd');
    if (t) r.dataset.theme = t;
    if (l) r.dataset.lcd = l;
  } catch (e) {}
})();

// The browser bar's colour (<meta name="theme-color">, one for the system's dark theme and one for its light one): a
// theme chosen with the button (data-theme) wins over the system's, and then both metas get its colour.
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

// View Transitions between the row's racks when a page does load anew (usually aisle.js swaps without a reload):
// forward the rack leaves to the left, back to the right; anything else has no animation. Here, not in a deferred
// script: pagereveal comes before the first paint.
(function () {
  var order = (document.documentElement.dataset.racks || '').trim().split(/\s+/);
  function dir(from, to) {
    var a = order.indexOf(from), b = order.indexOf(to);
    return a < 0 || b < 0 || a === b ? '' : b < a ? 'back' : 'forward';
  }
  function apply(vt, d) {
    // A skipped transition rejects ready: not an error, and not "Uncaught (in promise)" in the console either.
    if (vt.ready) vt.ready.catch(function () {});
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
