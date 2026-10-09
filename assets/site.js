const SITE = {
  lastfmUser: 'belomaxorka',
  // Last.fm public browser key retained from the previous version of this site.
  lastfmKey: atob('MTc0OTkxYjU1ZWViN2RkNzI1MmNjMGMwNTFjNDkwZjQ='),
  ring: 'https://webring.otomir23.me',
  githubRepo: 'belomaxorka/belomaxorka.github.io'
};

document.getElementById('year').textContent = new Date().getFullYear();

async function loadLastfm() {
  const target = document.getElementById('lastfm-track');
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  url.search = new URLSearchParams({
    method: 'user.getrecenttracks',
    user: SITE.lastfmUser,
    api_key: SITE.lastfmKey,
    limit: '1',
    format: 'json'
  });
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Last.fm unavailable');
    const data = await response.json();
    const track = data.recenttracks?.track?.[0];
    if (!track) throw new Error('No recent track');
    const artist = track.artist?.['#text'] || 'Unknown artist';
    const card = document.createElement('div');
    card.className = 'track';
    const imageUrl = track.image?.find(image => image.size === 'medium')?.['#text'];
    if (imageUrl && /^https:\/\//.test(imageUrl)) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = '';
      image.loading = 'lazy';
      card.append(image);
    }
    const text = document.createElement('div');
    text.className = 'track-text';
    const title = document.createElement('a');
    title.className = 'track-title';
    title.textContent = track.name || 'Untitled';
    title.href = /^https:\/\//.test(track.url || '') ? track.url : 'https://www.last.fm/user/belomaxorka';
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
    const artistLine = document.createElement('span');
    artistLine.className = 'track-artist';
    artistLine.textContent = artist;
    const status = document.createElement('span');
    status.className = 'track-status';
    status.textContent = track['@attr']?.nowplaying === 'true' ? '● listening now' : '↺ recently played';
    text.append(title, artistLine, status);
    card.append(text);
    target.replaceChildren(card);
  } catch {
    target.innerHTML = '<p class="muted">The music widget is taking a break.</p>';
  }
}

async function loadRing() {
  const nav = document.getElementById('webring-nav');
  const note = document.getElementById('ring-note');
  try {
    const response = await fetch(SITE.ring + '/sites');
    if (!response.ok) throw new Error('Ring unavailable');
    const sites = await response.json();
    const member = sites.find(site => /^https:\/\/(belomaxorka\.dev|belomaxorka\.github\.io)(\/|$)/i.test(site.url));
    if (!member) return;
    const slug = encodeURIComponent(member.slug);
    nav.replaceChildren();
    for (const [label, path] of [['← prev', 'prev'], ['the ring', ''], ['next →', 'next']]) {
      const link = document.createElement('a');
      link.href = path ? SITE.ring + '/' + slug + '/' + path : SITE.ring + '/';
      link.textContent = label;
      link.rel = 'noopener noreferrer';
      nav.append(link);
    }
    note.textContent = 'Proud member of the ring. Keep exploring!';
  } catch {
    note.textContent = 'Ring status is unavailable right now.';
  }
}

function extractMessage(body) {
  // GitHub Issue Forms render the input under a Markdown heading.
  const match = body.match(/### Your note\s*\n([\s\S]*?)(?=\n### |$)/i);
  const text = (match ? match[1] : body).trim();
  return text === '_No response_' ? '' : text.slice(0, 700);
}

async function loadGuestbook() {
  const target = document.getElementById('guestbook-entries');
  try {
    const url = 'https://api.github.com/repos/' + SITE.githubRepo + '/issues?state=open&labels=guestbook&per_page=6&sort=created&direction=desc';
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error('Guestbook unavailable');
    const issues = (await response.json()).filter(issue => !issue.pull_request);
    if (!issues.length) {
      target.innerHTML = '<p class="muted">No notes yet. Want to leave the first one?</p>';
      return;
    }
    target.replaceChildren();
    for (const issue of issues) {
      const entry = document.createElement('article');
      entry.className = 'guestbook-entry';
      const meta = document.createElement('div');
      meta.className = 'guestbook-meta';
      const author = document.createElement('a');
      author.href = /^https:\/\/github\.com\//.test(issue.user?.html_url || '') ? issue.user.html_url : '#guestbook';
      author.textContent = '@' + (issue.user?.login || 'visitor');
      author.target = '_blank';
      author.rel = 'noopener noreferrer';
      const date = document.createElement('time');
      date.dateTime = issue.created_at;
      date.textContent = new Date(issue.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      meta.append(author, date);
      const message = document.createElement('p');
      message.textContent = extractMessage(issue.body || '') || issue.title.replace(/^\[guestbook\]\s*/i, '');
      entry.append(meta, message);
      target.append(entry);
    }
  } catch {
    target.innerHTML = '<p class="muted">Notes are unavailable right now. You can still write one on GitHub.</p>';
  }
}

function setupDoodle() {
  const canvas = document.getElementById('pixel-canvas');
  const context = canvas.getContext('2d');
  const size = 16;
  const cell = canvas.width / size;
  const colors = new Set([...document.querySelectorAll('.swatch')].map(button => button.dataset.color));
  let pixels = Array(size * size).fill('');
  let selected = '#343b35';
  let drawing = false;
  let cursor = 0;
  try {
    const saved = JSON.parse(localStorage.getItem('belomaxorka-pixels-v1') || 'null');
    if (Array.isArray(saved) && saved.length === pixels.length && saved.every(value => colors.has(value))) pixels = saved;
  } catch { /* Storage can be blocked; drawing still works. */ }

  function render() {
    context.fillStyle = '#fffdf8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    pixels.forEach((color, index) => {
      if (!color) return;
      context.fillStyle = color;
      context.fillRect((index % size) * cell, Math.floor(index / size) * cell, cell, cell);
    });
    context.strokeStyle = '#e4e8dd';
    context.lineWidth = 1;
    for (let line = 1; line < size; line++) {
      const offset = line * cell + .5;
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset, canvas.height);
      context.moveTo(0, offset);
      context.lineTo(canvas.width, offset);
      context.stroke();
    }
  }
  function paint(index) {
    if (index < 0 || index >= pixels.length || pixels[index] === selected) return;
    pixels[index] = selected;
    render();
    try { localStorage.setItem('belomaxorka-pixels-v1', JSON.stringify(pixels)); } catch { /* optional persistence */ }
  }
  function cellAt(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * size);
    const y = Math.floor((event.clientY - rect.top) / rect.height * size);
    return x >= 0 && x < size && y >= 0 && y < size ? y * size + x : -1;
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    paint(cellAt(event));
  });
  canvas.addEventListener('pointermove', event => { if (drawing) paint(cellAt(event)); });
  canvas.addEventListener('pointerup', () => { drawing = false; });
  canvas.addEventListener('pointercancel', () => { drawing = false; });
  canvas.addEventListener('keydown', event => {
    const movements = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -size, ArrowDown: size };
    if (event.key in movements) {
      event.preventDefault();
      cursor = Math.max(0, Math.min(pixels.length - 1, cursor + movements[event.key]));
      canvas.setAttribute('aria-label', '16 by 16 pixel drawing canvas. Cursor row ' + (Math.floor(cursor / size) + 1) + ', column ' + (cursor % size + 1) + '. Press Space to paint.');
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      paint(cursor);
    }
  });
  document.querySelectorAll('.swatch').forEach(button => button.addEventListener('click', () => {
    selected = button.dataset.color;
    document.querySelectorAll('.swatch').forEach(swatch => {
      swatch.classList.toggle('active', swatch === button);
      swatch.setAttribute('aria-pressed', String(swatch === button));
    });
  }));
  document.getElementById('clear-canvas').addEventListener('click', () => {
    pixels.fill('');
    render();
    try { localStorage.removeItem('belomaxorka-pixels-v1'); } catch { /* optional persistence */ }
  });
  document.getElementById('download-canvas').addEventListener('click', () => {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportCanvas.height = 320;
    const exportContext = exportCanvas.getContext('2d');
    exportContext.fillStyle = '#fffdf8';
    exportContext.fillRect(0, 0, 320, 320);
    pixels.forEach((color, index) => {
      if (!color) return;
      exportContext.fillStyle = color;
      exportContext.fillRect((index % size) * cell, Math.floor(index / size) * cell, cell, cell);
    });
    const link = document.createElement('a');
    link.href = exportCanvas.toDataURL('image/png');
    link.download = 'belomaxorka-pixel-doodle.png';
    link.click();
  });
  render();
}

document.getElementById('copy-badge').addEventListener('click', async event => {
  const button = event.currentTarget;
  const code = '<a href="https://belomaxorka.dev/"><img src="https://belomaxorka.dev/assets/belomaxorka-88x31.svg" width="88" height="31" alt="belomaxorka"></a>';
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = 'copied! ✓';
  } catch {
    button.textContent = 'copy unavailable — open the badge image';
  }
  setTimeout(() => { button.textContent = 'copy my button HTML ⧉'; }, 3000);
});

setupDoodle();
loadLastfm();
loadRing();
loadGuestbook();
