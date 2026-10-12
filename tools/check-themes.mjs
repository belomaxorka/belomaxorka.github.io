// The theme is one switch in tokens.css (--light, set by the system or by :root[data-theme]). This check fails when
// another stylesheet asks for the theme itself, or when the switch's two light (or two dark) rules disagree.
//
//   node tools/check-themes.mjs assets/css
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.css') ? [p] : [];
});

// rules returns [selector, body, media] for every rule, top level or inside an @media (media: its condition).
function rules(css, media = '') {
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
    if (head.startsWith('@media')) out.push(...rules(body, head));
    else if (!head.startsWith('@')) out.push([head.replace(/\s+/g, ' '), body, media]);
    i = j;
  }
  return out;
}

const decls = (body) => body.split(';').map((d) => d.trim().replace(/\s+/g, ' ')).filter(Boolean).sort().join('; ');
const dir = process.argv[2] || 'assets/css';
const problems = [];
const sw = { light: [], dark: [] };
for (const f of files(dir)) {
  for (const [sel, body, media] of rules(readFileSync(f, 'utf8'))) {
    const asks = /prefers-color-scheme/.test(media) || /\[data-theme/.test(sel);
    if (basename(f) !== 'tokens.css') {
      if (asks) problems.push(`${f}: "${media ? media + ' ' : ''}${sel}" asks for the theme: write the value once in its rule, through --light (tokens.css)`);
      continue;
    }
    if (!/--light\s*:/.test(body)) {
      if (asks) problems.push(`${f}: "${sel}" asks for the theme but is not the switch (it sets no --light)`);
      continue;
    }
    const light = /--light\s*:\s*1\b/.test(body);
    sw[light ? 'light' : 'dark'].push([`${media ? media + ' ' : ''}${sel}`, decls(body)]);
  }
}
for (const [theme, list] of Object.entries(sw)) {
  if (list.length !== 2) problems.push(`tokens.css: ${list.length} ${theme} rules of the switch, want 2 (${theme === 'light' ? 'the system\'s and the picked one' : 'the default and the picked one'})`);
  else if (list[0][1] !== list[1][1]) problems.push(`tokens.css: the ${theme} rules of the switch differ:\n    ${list[0][0]} { ${list[0][1]} }\n    ${list[1][0]} { ${list[1][1]} }`);
}
if (problems.length) {
  console.error('theme:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('theme: one switch in tokens.css, both sides of it agree');
