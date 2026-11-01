// The guestbook's drawing pad: a white 640x400 canvas (site-api takes no more), a brush with pen pressure, eraser,
// fill, colours, size, undo/redo, full screen. Every action writes the picture into a hidden field, so htmx and a plain
// form both send it. What was written and drawn is kept as a draft until it is sent: a refused entry (the server answers
// with a new, empty form), a reload or a closed tab lose nothing.
document.addEventListener('alpine:init', () => {
  const Alpine = window.Alpine;
  const store = window.Rack.store;
  const W = 640, H = 400;
  const MAX_URL = 1524362;     // site-api: guestbook.MaxDrawing, any 640x440 PNG
  const DRAFT = 'gb-draft';
  const DRAFT_TTL = 24 * 60 * 60 * 1000; // site-api: a form older than a day is stale anyway
  const HISTORY = 25;          // undo steps (1 MB a step)
  const BASE = ['#111111', '#ffffff', '#8a8f98', '#e0322b', '#ff8a00', '#ffd23f', '#3daa63', '#2bb3c0',
    '#3a7bd5', '#7b4fd6', '#ff6fb5', '#8b5a2b'];

  Alpine.data('oekaki', () => ({
    open: false,
    full: false,
    tool: 'brush', // brush, eraser, fill
    color: '#111111',
    size: 6,
    colors: [],
    undoN: 0,
    redoN: 0,
    tooBig: false,

    init() {
      // Besides the base palette, the rack's colours: the LCD (it changes with the track's cover) and the accent.
      const rack = ['--lcd', '--accent'].map((v) => this.hex(v)).filter(Boolean);
      this.colors = [...new Set([...BASE, ...rack])];
      const c = this.$refs.pad;
      c.width = W; c.height = H;
      this.g = c.getContext('2d', { willReadFrequently: true });
      this.wipe();
      this.past = [this.snap()];
      this.future = [];
      this.stroke = null;
      c.addEventListener('pointerdown', (e) => this.down(e));
      c.addEventListener('pointermove', (e) => this.move(e));
      c.addEventListener('pointerup', (e) => this.up(e));
      c.addEventListener('pointercancel', (e) => this.up(e));
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      this.onKey = (e) => this.key(e);
      addEventListener('keydown', this.onKey);
      // The KVM lost power (assets/js/power.js, the unit turns inert): finish the stroke, leave full screen. What was
      // typed and drawn stays; turned on, draw on.
      this.unit = this.$root.closest('.u');
      this.onPower = (e) => { if (!e.detail.on) this.dark(); };
      this.unit?.addEventListener('rack:unit', this.onPower);
      // The open canvas changes the unit's height: lay out the rack and the cables again.
      this.$watch('open', () => this.$nextTick(() => document.dispatchEvent(new Event('rack:layout'))));
      // The draft: sent (the status above the form says so), it is forgotten; otherwise it comes back.
      if (this.$root.previousElementSibling?.matches('.gb-status.ok')) store.set(DRAFT, '');
      else this.restore();
      this.$root.addEventListener('input', () => this.later());
      this.$root.addEventListener('submit', () => this.save(), true);
      // Leaving within the save's delay (a reload, a closed tab) keeps the last keystrokes too.
      this.onHide = () => this.flush();
      addEventListener('pagehide', this.onHide);
      // A drawing the server would refuse is not sent: the canvas stays, with the warning in view.
      this.$root.addEventListener('htmx:beforeRequest', (e) => {
        if (this.tooBig && this.$refs.drawing.value) { e.preventDefault(); this.open = true; }
      });
    },
    destroy() {
      // Swapped out (the aisle went to another rack, the server answered the form) a moment after a keystroke: the
      // save still waiting is done now. app.js and aisle.js destroy the old form before the new one starts, and a new
      // form after a sent entry forgets the draft.
      this.flush();
      this.gone = true;
      removeEventListener('pagehide', this.onHide);
      removeEventListener('keydown', this.onKey);
      this.unit?.removeEventListener('rack:unit', this.onPower);
      document.documentElement.classList.remove('pad-full');
    },
    dark() {
      const s = this.stroke;
      if (s) {
        try { this.$refs.pad.releasePointerCapture(s.id); } catch { /* no capture any more */ }
        this.stroke = null;
        this.commit();
      }
      this.setFull(false);
    },

    // A colour token as #rrggbb, as the browser computes it (tokens are color-mix() of both themes); null if none.
    hex(token) {
      const probe = document.createElement('i');
      probe.style.color = `var(${token})`;
      this.$root.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      const n = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((x) => (c.startsWith('color(') ? x * 255 : x));
      return n.length === 3 ? '#' + n.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('') : null;
    },

    // ---------- the draft ----------
    field(name) { return this.$root.elements.namedItem(name); },
    save() {
      clearTimeout(this.saveTimer);
      this.saveTimer = 0;
      const name = this.field('name').value, text = this.field('text').value, drawing = this.$refs.drawing.value;
      if (!name.trim() && !text.trim() && !drawing) { store.set(DRAFT, ''); return; }
      store.setJSON(DRAFT, { at: Date.now(), name, text, private: this.field('private').checked, drawing });
    },
    later() {
      clearTimeout(this.saveTimer);
      if (this.gone) return; // a drawing restored after the form was swapped out: not this form's draft any more
      this.saveTimer = setTimeout(() => this.save(), 800);
    },
    flush() { if (this.saveTimer) this.save(); },
    restore() {
      const d = store.json(DRAFT, null);
      if (!d || typeof d.at !== 'number' || Date.now() - d.at > DRAFT_TTL) return;
      if (typeof d.name === 'string') this.field('name').value = d.name;
      if (typeof d.text === 'string') this.field('text').value = d.text;
      this.field('private').checked = !!d.private;
      if (typeof d.drawing !== 'string' || !d.drawing.startsWith('data:image/png;base64,')) return;
      const img = new Image();
      img.onload = () => {
        this.g.globalCompositeOperation = 'source-over';
        this.g.drawImage(img, 0, 0, W, H);
        this.commit(); // undo still goes back to the blank canvas
        this.open = true;
      };
      img.src = d.drawing;
    },

    // ---------- buttons ----------
    toggle() { this.open = !this.open; if (!this.open) this.setFull(false); },
    use(tool) { this.tool = tool; },
    isTool(tool) { return this.tool === tool; },
    pick(c) { this.color = c; if (this.tool === 'eraser') this.tool = 'brush'; },
    isColor(c) { return this.color === c && this.tool !== 'eraser'; },
    pickCustom() { this.pick(this.$refs.custom.value); },
    setSize(e) { this.size = Number(e.target.value); },
    get canUndo() { return this.undoN > 0; },
    get canRedo() { return this.redoN > 0; },
    setFull(on) {
      this.full = on;
      document.documentElement.classList.toggle('pad-full', on);
    },
    toggleFull() { this.setFull(!this.full); },

    // ---------- the canvas ----------
    wipe() {
      this.g.globalCompositeOperation = 'source-over';
      this.g.fillStyle = '#ffffff';
      this.g.fillRect(0, 0, W, H);
    },
    snap() { return this.g.getImageData(0, 0, W, H); },
    commit() {
      this.past.push(this.snap());
      if (this.past.length > HISTORY + 1) this.past.shift();
      this.future = [];
      this.sync();
      this.later();
    },
    sync() {
      this.undoN = this.past.length - 1;
      this.redoN = this.future.length;
      const url = this.$refs.pad.toDataURL('image/png');
      this.tooBig = url.length > MAX_URL;
      this.$refs.drawing.value = this.blank() ? '' : url;
    },
    blank() {
      const d = this.past[this.past.length - 1].data;
      for (let i = 0; i < d.length; i += 4) if (d[i] !== 255 || d[i + 1] !== 255 || d[i + 2] !== 255) return false;
      return true;
    },
    undo() {
      if (this.past.length < 2) return;
      this.future.push(this.past.pop());
      this.g.putImageData(this.past[this.past.length - 1], 0, 0);
      this.sync();
      this.later();
    },
    redo() {
      if (!this.future.length) return;
      const img = this.future.pop();
      this.past.push(img);
      this.g.putImageData(img, 0, 0);
      this.sync();
      this.later();
    },
    clear() { this.wipe(); this.commit(); },

    key(e) {
      if (!this.open || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (this.$root.closest('[inert]')) return; // without power the canvas does not listen
      if (e.target instanceof Element && e.target.closest('input:not([type="range"]):not([type="color"]), textarea')) return; // they have their own undo
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); this.redo(); }
    },

    // ---------- drawing ----------
    pos(e) {
      const r = this.$refs.pad.getBoundingClientRect();
      return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
    },
    // The width: a pen's from its pressure, a mouse's and a finger's as on the slider.
    width(e) {
      const p = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
      return Math.max(0.6, this.size * (0.25 + p * 1.5));
    },
    down(e) {
      if (e.button !== 0 && e.button !== 5) return;
      e.preventDefault();
      const p = this.pos(e);
      if (this.tool === 'fill') { this.fill(Math.floor(p.x), Math.floor(p.y)); this.commit(); return; }
      try { this.$refs.pad.setPointerCapture(e.pointerId); } catch { /* the pointer is gone already: draw without the capture */ }
      // The pen's back end erases, even with the brush chosen.
      const erase = this.tool === 'eraser' || (e.pointerType === 'pen' && (e.buttons & 32) !== 0);
      this.stroke = { id: e.pointerId, erase, pts: [p], w: this.width(e) };
      this.dot(p, this.stroke.w, erase);
    },
    move(e) {
      const s = this.stroke;
      if (!s || e.pointerId !== s.id) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) {
        const p = this.pos(ev), w = this.width(ev);
        s.pts.push(p);
        // Smoothing: a curve through the middles of neighbouring segments, the width easing towards the new one.
        const n = s.pts.length;
        if (n < 3) { this.line(s.pts[0], p, w, s.erase); s.w = w; continue; }
        const a = s.pts[n - 3], b = s.pts[n - 2];
        const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, m2 = { x: (b.x + p.x) / 2, y: (b.y + p.y) / 2 };
        s.w += (w - s.w) * 0.5;
        this.curve(m1, b, m2, s.w, s.erase);
      }
    },
    up(e) {
      const s = this.stroke;
      if (!s || e.pointerId !== s.id) return;
      this.stroke = null;
      this.commit();
    },
    ink(w, erase) {
      const g = this.g;
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = g.fillStyle = erase ? '#ffffff' : this.color;
      g.lineWidth = erase ? Math.max(w, this.size * 1.5) : w;
      g.lineCap = g.lineJoin = 'round';
    },
    dot(p, w, erase) {
      this.ink(w, erase);
      this.g.beginPath();
      this.g.arc(p.x, p.y, this.g.lineWidth / 2, 0, Math.PI * 2);
      this.g.fill();
    },
    line(a, b, w, erase) {
      this.ink(w, erase);
      this.g.beginPath(); this.g.moveTo(a.x, a.y); this.g.lineTo(b.x, b.y); this.g.stroke();
    },
    curve(a, c, b, w, erase) {
      this.ink(w, erase);
      this.g.beginPath(); this.g.moveTo(a.x, a.y); this.g.quadraticCurveTo(c.x, c.y, b.x, b.y); this.g.stroke();
    },

    // Fill: line by line, with a tolerance, so the lines' smoothed edges leave no gaps.
    fill(x, y) {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const img = this.snap(), d = img.data;
      const hex = this.color.replace('#', '');
      const to = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
      const at = (y * W + x) * 4, from = [d[at], d[at + 1], d[at + 2]];
      if (Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) + Math.abs(from[2] - to[2]) < 8) return;
      const TOL = 96;
      const like = (i) => Math.abs(d[i] - from[0]) + Math.abs(d[i + 1] - from[1]) + Math.abs(d[i + 2] - from[2]) <= TOL;
      const seen = new Uint8Array(W * H);
      const stack = [[x, y]];
      while (stack.length) {
        let [cx, cy] = stack.pop();
        while (cx >= 0 && !seen[cy * W + cx] && like((cy * W + cx) * 4)) cx--;
        cx++;
        let up = false, down = false;
        while (cx < W && !seen[cy * W + cx] && like((cy * W + cx) * 4)) {
          const k = cy * W + cx, i = k * 4;
          seen[k] = 1;
          d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2]; d[i + 3] = 255;
          if (cy > 0) {
            const u = (cy - 1) * W + cx;
            if (!seen[u] && like(u * 4)) { if (!up) { stack.push([cx, cy - 1]); up = true; } } else up = false;
          }
          if (cy < H - 1) {
            const v = (cy + 1) * W + cx;
            if (!seen[v] && like(v * 4)) { if (!down) { stack.push([cx, cy + 1]); down = true; } } else down = false;
          }
          cx++;
        }
      }
      this.g.putImageData(img, 0, 0);
    },
  }));
});
