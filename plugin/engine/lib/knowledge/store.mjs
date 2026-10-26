// The project's knowledge folder: what this project taught the tool. Lives in the repo, committed like catalog.json.
import fs from 'node:fs';
import path from 'node:path';

export const knowledgeDir = (projectDir) => path.join(path.resolve(projectDir), '.content-ops', 'knowledge');

export function ensureKnowledge(projectDir) {
  const d = knowledgeDir(projectDir);
  for (const sub of ['', 'mappings', 'adapters']) fs.mkdirSync(path.join(d, sub), { recursive: true });
  return d;
}

export const readJsonSafe = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
