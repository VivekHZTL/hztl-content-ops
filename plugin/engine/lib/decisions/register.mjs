// Decision register and source overrides, both with provenance (who, when, why).
import fs from 'node:fs';
import path from 'node:path';
import { writeJson } from '../config/project.mjs';

const file = (projectDir, name) => path.join(path.resolve(projectDir), '.content-ops', name);
const read = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);

export function listDecisions(projectDir) { return read(file(projectDir, 'decisions.json'), []); }
export function addDecision(projectDir, { scope, decision, reason, who, enforcedBy = null }) {
  const list = listDecisions(projectDir);
  const entry = { id: `D-${list.length + 1}`, date: new Date().toISOString().slice(0, 10), scope, decision, reason, who, enforcedBy };
  writeJson(file(projectDir, 'decisions.json'), [...list, entry]);
  return entry;
}

export function loadOverrides(projectDir) { return { cells: {}, keys: {}, links: {}, urls: [], ...read(file(projectDir, 'overrides.json'), {}) }; }

const getPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const setPath = (obj, p, v) => { const ks = p.split('.'); let o = obj; for (const k of ks.slice(0, -1)) o = o[k]; o[ks.at(-1)] = v; };
const isLink = (v) => v && typeof v === 'object' && !Array.isArray(v) && ('url' in v || 'text' in v || 'pid' in v);

/** Returns a new content object with overrides applied by locator and by URL rule; records what it applied. */
export function applyOverrides(content, overrides) {
  const out = structuredClone(content);
  out.appliedOverrides = [];
  out.unmatchedOverrides = [];
  out.flags ||= [];
  const overridden = new Set();
  const byLocator = new Map(Object.entries(out.locators || {}).map(([p, loc]) => [loc, p]));
  for (const [loc, o] of Object.entries(overrides.cells || {})) {
    const p = byLocator.get(loc); if (!p) { out.unmatchedOverrides.push(loc); continue; }
    overridden.add(loc);
    setPath(out, p, o.value);
    out.appliedOverrides.push({ kind: 'cell', locator: loc, path: p, why: o.why, who: o.who });
    out.flags.push({ kind: 'confirm', where: loc, text: `Value overridden: ${o.why || 'no reason given'}${o.who ? ` (${o.who})` : ''}` });
  }
  for (const [loc, url] of Object.entries(overrides.links || {})) {
    const p0 = byLocator.get(loc); if (!p0) { out.unmatchedOverrides.push(loc); continue; }
    overridden.add(loc);
    const p = p0.replace(/\.url$/, '');
    const cur = getPath(out, p);
    setPath(out, p, isLink(cur) ? { ...cur, url } : { text: typeof cur === 'string' ? cur : '', url });
    out.appliedOverrides.push({ kind: 'link', locator: loc, path: p, url });
  }
  const rules = (overrides.urls || []).map((r) => ({ re: new RegExp(r.match, 'i'), replace: r.replace, why: r.why }));
  if (rules.length) {
    const walk = (node, p) => {
      if (isLink(node) && typeof node.url === 'string') { for (const r of rules) if (r.re.test(node.url)) { const next = node.url.replace(r.re, r.replace); if (next !== node.url) { out.appliedOverrides.push({ kind: 'url', path: p, from: node.url, to: next, why: r.why }); node.url = next; } break; } return; }
      if (Array.isArray(node)) node.forEach((x, i) => walk(x, `${p}.${i}`));
      else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) if (k !== 'appliedOverrides') walk(v, p ? `${p}.${k}` : k);
    };
    walk(out.components, 'components'); walk(out.pageFields || {}, 'pageFields');
  }
  out.flags = out.flags.filter((f) => !(overridden.has(f.where) && ['missing-url', 'placeholder'].includes(f.kind)));
  return out;
}
