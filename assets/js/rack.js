// What the rack's scripts share. Loaded before them (templates/layout.html), it only defines window.Rack.
window.Rack = (() => {
  // The toys (power plugs, network cords, the UPS, fallen stickers) remember what a visitor did for a while: a
  // reload or a walk to another rack and back finds them as they were. Not for good: a visitor who comes back
  // later finds the rack running, not dark and unclickable because of what someone did on this device last week.
  const TOY_TTL = 30 * 60 * 1000; // after the last change

  // toyStore(key, empty) keeps one object in localStorage with the time it was saved; get() returns empty() when
  // there is none, it is older than TOY_TTL, or it was saved in an earlier format.
  function toyStore(key, empty) {
    return {
      get() {
        try {
          const s = JSON.parse(localStorage.getItem(key) || 'null');
          if (s && typeof s.at === 'number' && Date.now() - s.at < TOY_TTL && s.v && typeof s.v === 'object') return s.v;
        } catch { /* no storage, or not ours */ }
        return empty();
      },
      set(v) {
        try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), v })); } catch { /* no storage: the toys forget */ }
      },
    };
  }

  return { TOY_TTL, toyStore };
})();
