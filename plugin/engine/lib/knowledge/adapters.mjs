// Project-specific source readers in .content-ops/knowledge/adapters/*.mjs (spec 4.4). Code, reviewed as
// code: Node built-ins only, never shadow a built-in reader, every page they produce is flagged.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { knowledgeDir } from './store.mjs';

const IMPORT_RE = /(?:\bimport\s*(?:[\w{}*\s,]+from\s*)?|\bimport\(|\brequire\()\s*['"]([^'"]+)['"]/g;

export function checkAdapterSource(src) {
  const errors = [];
  for (const m of src.matchAll(IMPORT_RE)) if (!m[1].startsWith('node:')) errors.push(`imports "${m[1]}"; adapters may import node: built-ins only`);
  return errors;
}

export async function loadAdapters(projectDir) {
  const dir = path.join(knowledgeDir(projectDir), 'adapters');
  const out = { adapters: [], errors: [] };
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.mjs')).sort()) {
    const file = path.join(dir, f);
    const bad = checkAdapterSource(fs.readFileSync(file, 'utf8'));
    if (bad.length) { out.errors.push(`${path.relative(projectDir, file)}: ${bad.join('; ')}`); continue; }
    try {
      const mod = await import(`${pathToFileURL(file).href}?t=${fs.statSync(file).mtimeMs}`);
      if (typeof mod.matches !== 'function' || typeof mod.read !== 'function') { out.errors.push(`${path.relative(projectDir, file)}: must export matches(file) and read(file, ctx)`); continue; }
      out.adapters.push({ name: mod.name || f.replace(/\.mjs$/, ''), file, matches: mod.matches, read: mod.read });
    } catch (e) { out.errors.push(`${path.relative(projectDir, file)}: ${e.message}`); }
  }
  return out;
}
