// The link preview image (og:image): one for the whole site, a 1200x630 PNG in assets/og/site.png. No dependencies
// (Node 22+ and Chrome, like docs/tools/shot.mjs):
//
//   node docs/tools/og/make.mjs [--chrome path]
//
// Serves the repository's root locally for a minute (card.html takes the site's fonts, colours and i18n), shoots
// card.html with shot.mjs and repacks the PNG into a 256-colour palette (pack.mjs), so the preview weighs under
// 300 KB. Run it again only when the card's captions (i18n) or the card itself change; a new rack needs nothing.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack } from './pack.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i < 0 ? undefined : args[i + 1]; };

const types = { '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const p = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = readFileSync(p);
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const tmp = mkdtempSync(join(tmpdir(), 'og-'));
try {
  const shot = ['docs/tools/shot.mjs', `${base}/docs/tools/og/card.html`, '--sizes', '1200x630', '--out', tmp, '--name', 'site', '--wait', '1500'];
  if (opt('chrome')) shot.push('--chrome', opt('chrome'));
  // Asynchronously: the server above lives in this process and must answer Chrome while the shot is taken.
  // shot.mjs exits with 1 when the page's console had errors: then no picture is written.
  const { stdout } = await promisify(execFile)(process.execPath, shot, { cwd: root }).catch((e) => { console.error(e.stdout || e); process.exit(1); });
  process.stdout.write(stdout);
  const raw = readFileSync(join(tmp, 'site-1200x630.png'));
  const out = join(root, 'assets/og', 'site.png');
  writeFileSync(out, pack(raw));
  console.log(`${out}: ${(raw.length / 1024).toFixed(0)} KB → ${(statSync(out).size / 1024).toFixed(0)} KB`);
} finally {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}
