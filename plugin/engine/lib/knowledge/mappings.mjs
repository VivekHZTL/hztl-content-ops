// Confirmed intake profiles, keyed by the sheet's header fingerprint. A sheet with the same shape maps
// itself next time and says where the mapping came from (spec 4.3).
import fs from 'node:fs';
import path from 'node:path';
import { ensureKnowledge, knowledgeDir, readJsonSafe } from './store.mjs';
import { headerFingerprint } from './fingerprint.mjs';
import { detectLayout, numToCol } from '../ingest/xlsx.mjs';
import { writeJson } from '../config/project.mjs';
import { deckHeadings } from '../ingest/deck-adapter.mjs';

export function sheetFingerprint(sheet) {
  const layout = detectLayout(sheet);
  const row = sheet.rows[layout.headerRow] || {};
  const headers = [];
  for (let n = 1; n <= sheet.maxCol; n++) headers.push(String(row[numToCol(n)] ?? ''));
  while (headers.length && headers.at(-1) === '') headers.pop();
  return { fingerprint: headerFingerprint(headers, sheet.name), headers, tab: sheet.name, layout };
}

/** A deck's shape: its headings, fingerprinted under the constant tab 'deck'. */
export const deckFingerprint = (text) => { const headers = deckHeadings(text); return { fingerprint: headerFingerprint(headers, 'deck'), headers, tab: 'deck', kind: 'deck' }; };

const fileFor = (projectDir, fp) => path.join(knowledgeDir(projectDir), 'mappings', `${fp}.json`);

export function saveMapping(projectDir, { fingerprint, headers, tab, sourceFile, profile, provenance = 'project', kind = 'sheet' }) {
  ensureKnowledge(projectDir);
  const file = fileFor(projectDir, fingerprint);
  writeJson(file, { fingerprint, headers, tab, kind, sourceFile, confirmedAt: new Date().toISOString(), provenance, profile });
  return file;
}
export const findMapping = (projectDir, fingerprint) => readJsonSafe(fileFor(projectDir, fingerprint), null);
export function listMappings(projectDir) {
  const d = path.join(knowledgeDir(projectDir), 'mappings');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => readJsonSafe(path.join(d, f), null)).filter(Boolean);
}
export function forgetMapping(projectDir, fingerprint) {
  const f = fileFor(projectDir, fingerprint);
  if (!fs.existsSync(f)) return false;
  fs.rmSync(f); return true;
}
