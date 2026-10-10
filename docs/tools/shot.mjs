// Скриншоты и проверка страницы в headless Chrome через CDP, без зависимостей (Node 22+: WebSocket встроен).
// Окно headless Chrome не сужается меньше ~500px, поэтому ширину задаёт Emulation.setDeviceMetricsOverride.
//
//   node docs/tools/shot.mjs http://127.0.0.1:8099/ [--sizes 390x844,1366x768] [--out shots] [--full]
//        [--dark] [--light] [--reduced] [--nojs] [--wait 1500] [--eval "js-выражение"] [--chrome путь]
//
// Печатает ошибки консоли, исключения, нарушения CSP и горизонтальную прокрутку; PNG кладёт в --out.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.match(/^--(sizes|out|wait|eval|chrome|name)$/));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const flag = (k) => args.includes('--' + k);
if (!url) { console.error('usage: node shot.mjs <url> [--sizes WxH,...] [--out dir] [--full] [--dark|--light] [--reduced] [--nojs] [--wait ms] [--eval js]'); process.exit(2); }

const sizes = opt('sizes', '390x844,768x1024,1366x768,1920x1080').split(',').map(s => s.split('x').map(Number));
const out = opt('out', 'shots');
const wait = Number(opt('wait', '1200'));
const name = opt('name', '');
const chrome = opt('chrome', process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : '/usr/bin/google-chrome');
mkdirSync(out, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'shot-'));
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsURL = await new Promise((ok, fail) => {
  let buf = '';
  proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) ok(m[1]); });
  proc.on('exit', c => fail(new Error('chrome exited ' + c + '\n' + buf)));
  setTimeout(() => fail(new Error('chrome did not start\n' + buf)), 15000);
});

const ws = new WebSocket(wsURL);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { ok, fail } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? fail(new Error(m.error.message)) : ok(m.result);
  } else if (m.method) listeners.forEach(l => l(m));
});
const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
  const id = ++seq;
  pending.set(id, { ok, fail });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const once = (method, sessionId) => new Promise(r => {
  const l = (m) => { if (m.method === method && m.sessionId === sessionId) { listeners.splice(listeners.indexOf(l), 1); r(m.params); } };
  listeners.push(l);
});

let problems = 0;
try {
  for (const [w, h] of sizes) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
    const log = [];
    listeners.push((m) => {
      if (m.sessionId !== s) return;
      if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
        log.push(`console.${m.params.type}: ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
      if (m.method === 'Runtime.exceptionThrown')
        log.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level))
        log.push(`${m.params.entry.source}.${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url || ''}`);
    });
    await send('Page.enable', {}, s);
    await send('Runtime.enable', {}, s);
    await send('Log.enable', {}, s);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }, s);
    if (w < 600) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, s);
    const features = [];
    if (flag('dark')) features.push({ name: 'prefers-color-scheme', value: 'dark' });
    if (flag('light')) features.push({ name: 'prefers-color-scheme', value: 'light' });
    if (flag('reduced')) features.push({ name: 'prefers-reduced-motion', value: 'reduce' });
    if (features.length) await send('Emulation.setEmulatedMedia', { features }, s);
    if (flag('nojs')) await send('Emulation.setScriptExecutionDisabled', { value: true }, s);
    await send('Page.addScriptToEvaluateOnNewDocument', { source:
      `addEventListener('securitypolicyviolation', e => console.error('CSP violation:', e.violatedDirective, e.blockedURI || '(inline)', e.sourceFile + ':' + e.lineNumber));` }, s);
    const loaded = once('Page.loadEventFired', s);
    await send('Page.navigate', { url }, s);
    await loaded;
    await new Promise(r => setTimeout(r, wait));

    const evalJS = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, s);
      return r.exceptionDetails ? 'ERROR ' + r.exceptionDetails.exception?.description : r.result.value;
    };
    const scroll = flag('nojs') ? null : await evalJS('({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})');
    const extra = opt('eval') && !flag('nojs') ? await evalJS(opt('eval')) : undefined;

    let clip;
    if (flag('full')) {
      const m = await send('Page.getLayoutMetrics', {}, s);
      clip = { x: 0, y: 0, width: w, height: Math.min(m.cssContentSize.height, 16000), scale: 1 };
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!clip, ...(clip ? { clip } : {}) }, s);
    const file = join(out, `${name ? name + '-' : ''}${w}x${h}${flag('nojs') ? '-nojs' : ''}.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));

    const overflow = scroll && scroll.sw > scroll.cw;
    problems += log.length + (overflow ? 1 : 0);
    console.log(`${w}x${h}: ${file}` + (overflow ? `  HORIZONTAL SCROLL ${scroll.sw} > ${scroll.cw}` : '') +
      (extra !== undefined ? '\n  eval: ' + JSON.stringify(extra) : ''));
    log.forEach(l => console.log('  ' + l));
    await send('Target.closeTarget', { targetId });
  }
} finally {
  ws.close();
  proc.kill();
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 500);
}
process.exitCode = problems ? 1 : 0;
