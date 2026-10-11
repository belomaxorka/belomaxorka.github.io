// Картинка для превью ссылок (og:image): одна на весь сайт, 1200×630 PNG в assets/og/site.png. Без зависимостей
// (Node 22+ и Chrome, как docs/tools/shot.mjs):
//
//   node docs/tools/og/make.mjs [--chrome путь]
//
// Поднимает на минуту локальный сервер на корень репозитория (card.html берёт шрифты, цвета и i18n сайта),
// снимает card.html через shot.mjs и пережимает PNG в палитру на 256 цветов (pack.mjs), чтобы превью весило меньше
// 300 КБ. Перезапускать, только если поменялись подписи на карточке (i18n) или сама карточка; новая стойка — нет.
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
  // Асинхронно: сервер выше живёт в этом же процессе и должен отвечать Chrome, пока идёт снимок.
  // shot.mjs выходит с 1, если в консоли страницы были ошибки: тогда картинку не пишем.
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
