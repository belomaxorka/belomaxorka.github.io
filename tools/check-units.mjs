// Fails CI for a unit (class "u ...") that forgets a declaration the scripts go by (assets/js/rack.js): live data
// (hx-*, data-live) without data-net, data-host or data-role; a declaration without data-key; a key used twice; an
// unknown value; data-feed with a source site-api does not know; data-host naming no unit.
//
//   node tools/check-units.mjs [templates]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'templates';
const files = (function walk(d) {
  return readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.html') ? [join(d, f)] : []));
})(dir).filter((f) => !/[\\/]lite[\\/]/.test(f)); // the light version has no scripts and no units of this kind

const NET = ['lan', 'wan'], ROLE = ['switch', 'router', 'ups'], LIVE = ['lamps', 'bar', 'text', 'image'], NEWS = ['', 'markup'], VLAN = ['mgmt'];
// The sources data-feed can name: those of site-api's live stream (its TestEverySourceIsListed), plus site and guestbook.
const FEEDS = ['gatus', 'koito', 'proxmox', 'telegram', 'ups', 'wakapi', 'webring', 'site', 'guestbook'];
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s>{])`)); return m ? m[1] ?? '' : null; };
const unitTag = /<([a-z]+)\s[^>]*class="u[ "][^>]*>/g;

const problems = [], keys = new Map(), hosts = [];
for (const f of files) {
  let src = readFileSync(f, 'utf8').replace(/\{\{\/\*[\s\S]*?\*\/\}\}/g, ''); // template comments
  // A template's own constants ({{$feed := "koito gatus"}}) stand where they are used.
  for (const [, name, value] of src.matchAll(/\{\{-?\s*\$(\w+) := "([^"]*)"\s*-?\}\}/g)) src = src.replaceAll(`{{$${name}}}`, value);
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
    for (const name of (feed || '').split(/\s+/).filter(Boolean)) if (!FEEDS.includes(name)) problems.push(`${where} data-feed "${name}": ${FEEDS.join(', ')}`);
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
