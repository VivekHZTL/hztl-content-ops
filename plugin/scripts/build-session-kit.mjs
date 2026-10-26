#!/usr/bin/env node
// Builds the training session kit: a zip of a fresh content-ops project folder plus START-HERE and the
// cards. Refuses anything that looks like a credential, never follows symlinks, and prints a short summary.
// Usage: node build-session-kit.mjs <project-dir> <out.zip>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipStore } from '../engine/lib/util/zip.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', 'runs', 'work']);
const CRED_NAME = /^\.env(\..*)?$|\.env$|\.(pem|key|p12|pfx)$|^id_rsa/i;
const MAX_BYTES = 20 * 1024 * 1024;
const SECRET_BODY = /SITECORE_CLIENT_SECRET|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/;
const KIT_FILES = [['START-HERE.md', 'training/START-HERE.md'], ['training/take-home-card.md', 'training/take-home-card.md'], ['training/session-run-sheet.md', 'training/session-run-sheet.md'], ['training/00-before-the-session.md', 'training/00-before-the-session.md']];

export function buildSessionKit({ projectDir, out, pluginDir }) {
  const root = path.resolve(projectDir);
  if (!fs.existsSync(path.join(root, '.content-ops', 'project.json'))) throw new Error(`${root} has no .content-ops/project.json; the kit is built from a set-up content-ops project`);
  const entries = []; const refused = [];
  const outAbs = path.resolve(out);
  const kitNames = new Set(KIT_FILES.map(([z]) => z));
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, name); const r = rel ? `${rel}/${name}` : name;
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) { refused.push({ path: r, why: 'symlink; the kit never follows links' }); continue; }
      if (st.isDirectory()) { if (SKIP_DIRS.has(name)) continue; walk(abs, r); continue; }
      if (!st.isFile()) continue;
      if (abs === outAbs) continue;
      if (kitNames.has(r)) { refused.push({ path: r, why: 'replaced by the kit\'s own copy of this file' }); continue; }
      if (st.size > MAX_BYTES) { refused.push({ path: r, why: `over ${MAX_BYTES / 1024 / 1024} MB; the kit is for a fresh project, not data` }); continue; }
      if (CRED_NAME.test(name)) { refused.push({ path: r, why: 'credential-looking file name' }); continue; }
      if ((rel === 'sources' || rel.startsWith('sources/')) && !(rel === 'sources' && /^template-.*\.(xlsx|csv)$/.test(name))) { refused.push({ path: r, why: 'client source file; only generated templates travel' }); continue; }
      const buf = fs.readFileSync(abs);
      if (SECRET_BODY.test(buf.toString('latin1'))) { refused.push({ path: r, why: 'contains a secret marker' }); continue; }
      entries.push([r, buf]);
    }
  };
  walk(root, '');
  for (const [zipName, src] of KIT_FILES) {
    const f = path.join(pluginDir, src);
    if (!fs.existsSync(f)) throw new Error(`Kit file missing: ${f}`);
    entries.push([zipName, fs.readFileSync(f)]);
  }
  const zip = zipStore(entries);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, zip);
  return { out: path.resolve(out), files: entries.length, bytes: zip.length, refused, top: entries.slice(0, 20).map(([n]) => n) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [projectDir, out] = process.argv.slice(2);
  if (!projectDir || !out) { console.error('usage: node build-session-kit.mjs <project-dir> <out.zip>'); process.exit(2); }
  const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  console.log(JSON.stringify(buildSessionKit({ projectDir, out, pluginDir }), null, 1));
}
