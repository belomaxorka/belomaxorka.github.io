// Картинки для превью ссылок (og:image): по одной на каждую стойку из content/racks.yaml, 1200×630 PNG
// в assets/og/<id>.png. Без зависимостей (Node 22+ и Chrome, как docs/tools/shot.mjs):
//
//   node docs/tools/og/make.mjs [--only home,lab] [--chrome путь]
//
// Поднимает на минуту локальный сервер на корень репозитория (card.html берёт шрифты, цвета и i18n сайта),
// снимает card.html?rack=<id> через shot.mjs и пережимает PNG в палитру на 256 цветов (pack.mjs), чтобы
// превью весило меньше 300 КБ. Новая стойка или новая подпись в i18n — запустить ещё раз и закоммитить PNG.
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
const only = opt('only')?.split(',');

// content/racks.yaml: блоки «- id: …», в них path и stub. Хватает построчного разбора, YAML-библиотека не нужна.
const racks = [];
for (const line of readFileSync(join(root, 'content/racks.yaml'), 'utf8').split('\n')) {
  let m;
  if ((m = line.match(/^- id:\s*(\S+)/))) racks.push({ id: m[1], path: '/', stub: false });
  else if (racks.length && (m = line.match(/^\s+path:\s*(\S+)/))) racks.at(-1).path = m[1];
  else if (racks.length && /^\s+stub:\s*true/.test(line)) racks.at(-1).stub = true;
}

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
  const ids = racks.map((r) => r.id).join(',');
  for (const [i, r] of racks.entries()) {
    if (only && !only.includes(r.id)) continue;
    const url = `${base}/docs/tools/og/card.html?rack=${r.id}&n=${i + 1}&path=${encodeURIComponent(r.path)}&racks=${ids}&stub=${r.stub ? 1 : 0}`;
    const shot = ['docs/tools/shot.mjs', url, '--sizes', '1200x630', '--out', tmp, '--name', r.id, '--wait', '1500'];
    if (opt('chrome')) shot.push('--chrome', opt('chrome'));
    // Асинхронно: сервер выше живёт в этом же процессе и должен отвечать Chrome, пока идёт снимок.
    // shot.mjs выходит с 1, если в консоли страницы были ошибки: тогда картинку не пишем.
    const { stdout } = await promisify(execFile)(process.execPath, shot, { cwd: root }).catch((e) => { console.error(e.stdout || e); process.exit(1); });
    process.stdout.write(stdout);
    const raw = readFileSync(join(tmp, `${r.id}-1200x630.png`));
    const out = join(root, 'assets/og', `${r.id}.png`);
    writeFileSync(out, pack(raw));
    console.log(`${out}: ${(raw.length / 1024).toFixed(0)} KB → ${(statSync(out).size / 1024).toFixed(0)} KB`);
  }
} finally {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}
