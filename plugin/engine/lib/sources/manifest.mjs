// Sources manifest: which input files a run used, by content hash. Lives in .content-ops/sources.json.
// SharePoint is unreachable from here, so authors download files into <project>/sources/ and register them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeJson } from '../config/project.mjs';

const manifestFile = (projectDir) => path.join(path.resolve(projectDir), '.content-ops', 'sources.json');
const read = (projectDir) => (fs.existsSync(manifestFile(projectDir)) ? JSON.parse(fs.readFileSync(manifestFile(projectDir), 'utf8')) : { sources: [] });

export const hashFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function registerSource({ projectDir, file, note = '', by = '' }) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`Source file not found: ${abs}`);
  const rel = path.relative(path.resolve(projectDir), abs).split(path.sep).join('/');
  const st = fs.statSync(abs);
  const entry = { file: rel, sha256: hashFile(abs), mtime: st.mtime.toISOString(), size: st.size, note, by, registeredAt: new Date().toISOString() };
  const m = read(projectDir);
  m.sources = [...m.sources.filter((s) => s.file !== rel), entry];
  writeJson(manifestFile(projectDir), m);
  return entry;
}

export const listSources = (projectDir) => read(projectDir).sources;

export function verifySources(projectDir) {
  return listSources(projectDir).map((s) => {
    const abs = path.join(path.resolve(projectDir), s.file);
    if (!fs.existsSync(abs)) return { file: s.file, status: 'missing', sha256: null, registered: s.sha256 };
    const now = hashFile(abs);
    return { file: s.file, status: now === s.sha256 ? 'ok' : 'changed', sha256: now, registered: s.sha256 };
  });
}
