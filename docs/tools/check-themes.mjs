// The light theme is written twice in the stylesheets: for a visitor whose system is light
// (@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) … }) and for one who picked it with the
// theme key (:root[data-theme="light"] …). CSS has no way to say it once without changing the cascade or browser
// support, so this check makes sure every such rule has its twin with the same declarations.
//
//   node docs/tools/check-themes.mjs assets/css     (CI runs it before a deploy; exit 1 lists what differs)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.css') ? [p] : [];
});

// rules returns [selector, body, inMediaLight] for every rule, top level or inside an @media.
function rules(css, media = false) {
  const out = [];
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (head.startsWith('@media')) out.push(...rules(body, media || /prefers-color-scheme:\s*light/.test(head)));
    else if (!head.startsWith('@')) out.push([head.replace(/\s+/g, ' '), body, media]);
    i = j;
  }
  return out;
}

const decls = (body) => body.split(';').map((d) => d.trim().replace(/\s+/g, ' ')).filter(Boolean).sort().join('; ');

const problems = [];
for (const f of files(process.argv[2] || 'assets/css')) {
  const system = new Map(), picked = new Map();
  for (const [sel, body, media] of rules(readFileSync(f, 'utf8'))) {
    for (const s of sel.split(',').map((x) => x.trim())) {
      if (media && s.startsWith(':root:not([data-theme="dark"])')) system.set(s.slice(':root:not([data-theme="dark"])'.length), decls(body));
      if (!media && s.startsWith(':root[data-theme="light"]')) picked.set(s.slice(':root[data-theme="light"]'.length), decls(body));
    }
  }
  for (const [rest, d] of system) {
    if (!picked.has(rest)) problems.push(`${f}: "${rest || ':root'}" has a light rule for the system theme only`);
    else if (picked.get(rest) !== d) problems.push(`${f}: "${rest || ':root'}" differs between the system's light theme and the picked one`);
  }
  for (const rest of picked.keys()) if (!system.has(rest)) problems.push(`${f}: "${rest || ':root'}" has a light rule for the picked theme only`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('light theme: both twins agree');
