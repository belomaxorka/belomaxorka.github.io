// The units' declarations (assets/js/rack.js) are what the scripts go by, so a unit that forgets one silently works
// without power or network: this check fails CI instead.
//
//   node docs/tools/check-units.mjs [templates]
//
// For every unit in the templates (an element with class "u ..."):
//   - one that shows live data (hx-get, hx-post, hx-trigger, data-live inside it) says how it gets it: data-net, or
//     data-host (it runs on another unit), or data-role (the rack's infrastructure);
//   - one with any declaration has a data-key, and no two units in one template share a key;
//   - data-net is lan or wan, data-role switch, router or ups, data-live lamps, bar, text or image, data-news empty
//     or markup, data-vlan mgmt, data-feed names at least one source;
//   - data-host names a unit that exists.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'templates';
const files = (function walk(d) {
  return readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.html') ? [join(d, f)] : []));
})(dir).filter((f) => !/[\\/]lite[\\/]/.test(f)); // the light version has no scripts and no units of this kind

const NET = ['lan', 'wan'], ROLE = ['switch', 'router', 'ups'], LIVE = ['lamps', 'bar', 'text', 'image'], NEWS = ['', 'markup'], VLAN = ['mgmt'];
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s>{])`)); return m ? m[1] ?? '' : null; };
const unitTag = /<([a-z]+)\s[^>]*class="u[ "][^>]*>/g;

const problems = [], keys = new Map(), hosts = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8').replace(/\{\{\/\*[\s\S]*?\*\/\}\}/g, ''); // template comments
  const tags = [...src.matchAll(unitTag)];
  tags.forEach((m, i) => {
    const tag = m[0], body = src.slice(m.index + tag.length, i + 1 < tags.length ? tags[i + 1].index : src.length);
    const where = `${f}: <${m[1]} class="${(tag.match(/class="([^"]*)"/) || [])[1]}">`;
    const key = attr(tag, 'data-key'), net = attr(tag, 'data-net'), host = attr(tag, 'data-host'), role = attr(tag, 'data-role');
    const power = attr(tag, 'data-power');
    const live = /\shx-(get|post|trigger)=|\sdata-live=/.test(tag + body);
    if (live && net === null && host === null && role === null) problems.push(`${where} shows live data but says neither data-net, data-host nor data-role`);
    if ((net ?? host ?? role ?? power) !== null && !key) problems.push(`${where} has declarations but no data-key`);
    if (net !== null && !NET.includes(net)) problems.push(`${where} data-net="${net}": lan or wan`);
    if (role !== null && !ROLE.includes(role)) problems.push(`${where} data-role="${role}": ${ROLE.join(', ')}`);
    const vlan = attr(tag, 'data-vlan'), feed = attr(tag, 'data-feed');
    if (vlan !== null && !VLAN.includes(vlan)) problems.push(`${where} data-vlan="${vlan}": ${VLAN.join(', ')}`);
    if (feed !== null && !feed.trim()) problems.push(`${where} data-feed names no source`);
    if (feed !== null && net === null && host === null) problems.push(`${where} data-feed without data-net or data-host: the data could not reach it`);
    for (const n of (tag + body).matchAll(/\sdata-news(?:="([^"]*)")?(?=[\s>{])/g)) {
      if (!NEWS.includes(n[1] ?? '')) problems.push(`${where} data-news="${n[1]}": empty or markup`);
    }
    if (host !== null) hosts.push([where, host]);
    if (key && !key.includes('{{')) {
      if ((keys.get(f) || new Set()).has(key)) problems.push(`${where} data-key="${key}" twice in this template`);
      keys.set(f, (keys.get(f) || new Set()).add(key));
    }
    for (const l of (tag + body).matchAll(/\sdata-live="([^"]*)"/g)) {
      for (const v of l[1].split(/\s+/)) if (!LIVE.includes(v)) problems.push(`${where} data-live="${l[1]}": ${LIVE.join(', ')}`);
    }
  });
}
const all = new Set([...keys.values()].flatMap((s) => [...s]));
for (const [where, host] of hosts) if (!all.has(host)) problems.push(`${where} data-host="${host}": no unit has that key`);

if (problems.length) {
  console.error('units:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`units: ${files.length} templates, ${all.size} named units, every one declared`);
