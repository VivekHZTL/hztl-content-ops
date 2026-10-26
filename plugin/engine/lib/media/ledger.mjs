// Media ledger: which legacy image became which DAM/media item, per environment. Committed in .content-ops/.
import fs from 'node:fs';
import path from 'node:path';
import { writeJson } from '../config/project.mjs';

const file = (d) => path.join(path.resolve(d), '.content-ops', 'media-ledger.json');
export const loadLedger = (projectDir) => (fs.existsSync(file(projectDir)) ? JSON.parse(fs.readFileSync(file(projectDir), 'utf8')) : { entries: [] });
export const saveLedger = (projectDir, ledger) => writeJson(file(projectDir), ledger);
export const lookup = (ledger, { legacyUrl, sha256 }) => ledger.entries.find((e) => (legacyUrl && e.legacyUrl === legacyUrl) || (sha256 && e.sha256 === sha256)) || null;
export function record(ledger, entry) {
  const i = ledger.entries.findIndex((e) => e.legacyUrl === entry.legacyUrl);
  if (i >= 0) ledger.entries[i] = { ...ledger.entries[i], ...entry, envs: { ...ledger.entries[i].envs, ...entry.envs }, usedBy: [...new Set([...(ledger.entries[i].usedBy || []), ...(entry.usedBy || [])])] };
  else ledger.entries.push({ usedBy: [], envs: {}, ...entry });
  return ledger;
}
const isImage = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'url' in v && ('alt' in v || /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(v.url || ''));
export function annotateImages(content, ledger, env) {
  const out = structuredClone(content); out.flags ||= [];
  const walk = (node, p) => {
    if (isImage(node)) { const e = lookup(ledger, { legacyUrl: node.url }); const id = e?.envs?.[env]?.itemId; if (id) node.itemId = id; else out.flags.push({ kind: 'missing-image', where: out.locators?.[p] || p, text: `Image ${node.url} has no ${env} item in the media ledger` }); return; }
    if (Array.isArray(node)) node.forEach((x, i) => walk(x, `${p}.${i}`));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${p}.${k}`);
  };
  walk(out.components, 'components');
  return out;
}
