// The client's sitemap (Page ID → name, url) and link resolution against the CM.
import fs from 'node:fs';
import { readWorkbook } from './xlsx.mjs';

/** Accepts a { pid: { name, url } } object, a .json path, or an .xlsx path with ID/Name/URL columns. */
export function loadSitemap(input) {
  let map = input;
  if (typeof input === 'string') {
    if (/\.json$/i.test(input)) map = JSON.parse(fs.readFileSync(input, 'utf8'));
    else {
      const wb = readWorkbook(fs.readFileSync(input)); map = {};
      for (const sheet of wb.sheets) {
        const header = sheet.rows[1] || {}; const cols = Object.entries(header);
        const idCol = cols.find(([, v]) => /^(page\s*)?id$/i.test(String(v)))?.[0], nameCol = cols.find(([, v]) => /name|title/i.test(String(v)))?.[0], urlCol = cols.find(([, v]) => /url|path/i.test(String(v)))?.[0];
        if (!idCol || !urlCol) continue;
        for (let r = 2; r <= sheet.maxRow; r++) { const row = sheet.rows[r] || {}; const id = row[idCol]; if (id == null || id === '') continue; map[String(id).trim()] = { name: String(row[nameCol] ?? '').trim(), url: String(row[urlCol] ?? '').trim() }; }
      }
    }
  }
  const byPid = new Map(), byUrl = new Map();
  for (const [pid, e] of Object.entries(map)) { const raw = String(e.url || '').trim(); const url = raw ? raw.replace(/\/$/, '') || '/' : null; byPid.set(pid, { pid, name: e.name, url }); if (url) byUrl.set(url.toLowerCase(), { pid, name: e.name, url }); }
  return { byPid, byUrl };
}

const isLink = (v) => v && typeof v === 'object' && !Array.isArray(v) && ('url' in v || 'pid' in v || 'text' in v);
/** Any URL form → { path, querystring } under the site, or null when it is not an own-site page. */
function toPath(url, ownHosts) {
  if (!url) return null;
  const u = String(url).split('#')[0];
  const abs = u.match(/^https?:\/\/([^/]+)(\/[^?]*)?(?:\?(.*))?$/i);
  if (abs) { if (!ownHosts.some((h) => h.toLowerCase() === abs[1].toLowerCase())) return null; return { path: (abs[2] || '/').replace(/\/$/, '') || '/', querystring: abs[3] || null }; }
  if (/^\/(?!\/)/.test(u)) { const [p, qs] = u.split('?'); return { path: p.replace(/\/$/, '') || '/', querystring: qs || null }; }
  return null;
}
const words = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2));

/** Resolves { text, url, pid } links to internal ids where the page exists on the CM. Async, read-only. */
export async function resolveLinks(content, { sitemap, cm, homePath, ownHosts = [] }) {
  const out = structuredClone(content); out.flags ||= [];
  const home = homePath.replace(/\/$/, '');
  const cache = new Map();
  const itemAt = async (p) => { const k = p.toLowerCase(); if (!cache.has(k)) cache.set(k, await cm.getItem({ path: p })); return cache.get(k); };
  const locatorOf = (p) => out.locators?.[p] || p;
  const pushFlag = (kind, p, text) => out.flags.push({ kind, where: locatorOf(p), path: p, text });
  const resolveOne = async (node, p) => {
    let target = null;
    if (node.pid) {
      const e = sitemap.byPid.get(String(node.pid));
      if (!e) { pushFlag('pid-fix', p, `Page ID ${node.pid} is not in the sitemap`); return; }
      if (!e.url) { pushFlag('pid-fix', p, `Page ID ${node.pid} (${e.name}) has no URL in the sitemap`); return; }
      if (node.text && words(node.text).size && ![...words(node.text)].some((w) => words(e.name).has(w))) pushFlag('suspect-link', p, `Link text "${node.text}" vs sitemap ${node.pid} "${e.name}"; confirm the Page ID`);
      target = toPath(e.url, ownHosts) || { path: e.url, querystring: null };
      if (!node.url) node.url = e.url;
    } else if (node.url) target = toPath(node.url, ownHosts);
    if (!target) return;
    const item = await itemAt(home + (target.path === '/' ? '' : target.path));
    if (item) { node.id = item.id; delete node.url; if (target.querystring) node.querystring = target.querystring; }
    else if (node.pid) pushFlag('link-pending', p, `Page ID ${node.pid} (${target.path}) does not exist yet; kept as URL, relink after it is built`);
  };
  // Only field VALUES can be links: a component's `fields` object may itself have keys named text/url.
  const visitFields = async (fields, p) => { for (const [k, v] of Object.entries(fields || {})) { if (isLink(v)) await resolveOne(v, `${p}.${k}`); else if (Array.isArray(v)) for (const [i, x] of v.entries()) if (isLink(x)) await resolveOne(x, `${p}.${k}.${i}`); } };
  const visitComps = async (comps, p) => { for (const [i, c] of (comps || []).entries()) { await visitFields(c.fields, `${p}.${i}.fields`); for (const l of c.links || []) await resolveOne(l, `${p}.${i}.links`); await visitComps(c.children, `${p}.${i}.children`); } };
  await visitComps(out.components, 'components');
  await visitFields(out.pageFields || {}, 'pageFields');
  return out;
}
