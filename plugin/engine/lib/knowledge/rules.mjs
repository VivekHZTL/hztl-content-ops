// Project rule overrides with provenance (spec 4.6). knowledge/rules.json wins over the legacy rules.json.
import path from 'node:path';
import { ensureKnowledge, knowledgeDir, readJsonSafe } from './store.mjs';
import { writeJson } from '../config/project.mjs';

const file = (projectDir) => path.join(knowledgeDir(projectDir), 'rules.json');
const RANK = { default: 0, merged: 1, project: 2 };
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function loadRuleOverrides(projectDir) {
  const out = { rules: {}, sources: {} };
  const legacy = readJsonSafe(path.join(path.resolve(projectDir), '.content-ops', 'rules.json'), {});
  for (const [k, v] of Object.entries(legacy)) { out.rules[k] = v; out.sources[k] = { provenance: 'project', since: null, why: 'legacy rules.json', from: null }; }
  const kn = readJsonSafe(file(projectDir), {});
  const entries = Object.entries(kn).sort(([, a], [, b]) => (RANK[a.provenance] ?? 1) - (RANK[b.provenance] ?? 1));
  for (const [k, e] of entries) { if (!isObj(e) || !('value' in e)) throw new Error(`knowledge/rules.json "${k}" must be { value, provenance, since, why }; use: content-ops rules set ${k} '<json>' --why "<reason>"`); out.rules[k] = e.value; out.sources[k] = { provenance: e.provenance || 'project', since: e.since || null, why: e.why || null, from: e.from || null }; }
  return out;
}

export function setRule(projectDir, key, value, { why = null, provenance = 'project', from = null } = {}) {
  ensureKnowledge(projectDir);
  const kn = readJsonSafe(file(projectDir), {});
  const prev = kn[key];
  if (prev && (RANK[prev.provenance] ?? 1) > (RANK[provenance] ?? 1)) return { key, kept: prev };
  kn[key] = { value, provenance, since: new Date().toISOString().slice(0, 10), ...(why ? { why } : {}), ...(from ? { from } : {}) };
  writeJson(file(projectDir), kn);
  return { key, ...kn[key] };
}

const deepMerge = (base, over) => { const out = { ...base }; for (const [k, v] of Object.entries(over || {})) out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v; return out; };
const setPath = (obj, dotted, value) => {
  const parts = dotted.split('.'); let o = obj;
  for (const p of parts.slice(0, -1)) { o[p] = isObj(o[p]) ? { ...o[p] } : {}; o = o[p]; }
  const last = parts.at(-1);
  o[last] = isObj(value) && isObj(o[last]) ? deepMerge(o[last], value) : value;
};
const leaves = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (isObj(v) && Object.keys(v).length ? leaves(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

/** Defaults plus overrides, and for every top-level and leaf key where its effective value came from. */
export function effectiveRules(defaults, overrides) {
  const rules = JSON.parse(JSON.stringify(defaults));
  const sources = {};
  const DEF = { provenance: 'default', since: null, why: null, from: null };
  for (const k of new Set([...Object.keys(defaults), ...leaves(defaults)])) sources[k] = DEF;
  for (const [k, v] of Object.entries(overrides.rules)) {
    setPath(rules, k, v);
    sources[k] = overrides.sources[k];
    for (const leaf of leaves({ [k]: v })) sources[leaf] = overrides.sources[k];
    if (isObj(v)) for (const leaf of leaves(v)) sources[`${k}.${leaf}`] = overrides.sources[k];
  }
  return { rules, sources };
}
