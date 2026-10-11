// Просмотр одной картинки стены мемов (templates/infra.html, "meme"): ← и → — к соседней (новее и старее), свайп —
// так же, Esc — назад к стене. Ходит по ссылкам страницы, без них ничего не делает.
(() => {
  const go = (sel) => {
    const a = document.querySelector(sel);
    if (a) location.href = a.href;
  };
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === 'ArrowLeft') go('a[rel="prev"]');
    else if (e.key === 'ArrowRight') go('a[rel="next"]');
    else if (e.key === 'Escape') go('a.back');
  });
  let x0 = null, y0 = 0;
  addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) go(dx > 0 ? 'a[rel="prev"]' : 'a[rel="next"]');
  }, { passive: true });
})();
