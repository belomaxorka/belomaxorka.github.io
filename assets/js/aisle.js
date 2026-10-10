// Проход между стойками: ←/→ и свайп переходят к соседней стойке по ссылкам-стрелкам прохода
// (templates/aisle.html). Без JS работают сами ссылки. Анимацию перехода делает CSS (View Transitions).
(() => {
  const go = (which) => {
    const a = document.querySelector(`#aisle a.step.${which}`);
    if (a) a.click();
  };
  // Где стрелки и жесты заняты своим: поля ввода, галерея аватарок, холст, диалоги, провода.
  const busy = (t) => t instanceof Element && t.closest('input, textarea, select, [contenteditable], .slides, .pad, canvas, dialog, svg, .bars');

  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (busy(e.target) || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    go(e.key === 'ArrowLeft' ? 'prev' : 'next');
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
    if (quick && Math.abs(dx) > 80 && Math.abs(dx) > 2 * Math.abs(dy)) go(dx > 0 ? 'prev' : 'next');
  }, { passive: true });
})();
