// The plugin is shared across projects and may be public: no client names, people, tenant hosts or client
// page data may appear anywhere in the repo, including inside the .docx/.xlsx fixtures.
// Banned words are stored as hashes so this test does not itself publish them. To ban a new word, add
// sha256(word.toLowerCase()).slice(0, 16) to BANNED.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { unzip } from '../plugin/engine/lib/ingest/xlsx.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.superpowers', 'runs']);
const BANNED = new Set(['3b5a165f6f19efeb', '4e558a75f9042932', 'a3da73976501812c', '4d2fb5ecbde9d0e3']);
const hash = (w) => crypto.createHash('sha256').update(w).digest('hex').slice(0, 16);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name)); continue; }
    files.push(path.join(dir, e.name));
  }
})(root);

const textOf = (f) => {
  const buf = fs.readFileSync(f);
  if (/\.(docx|xlsx)$/i.test(f)) return Object.values(unzip(buf)).map((read) => read()).join('\n');
  if (/\.(png|jpg|jpeg|gif|ico|pdf|zip)$/i.test(f)) return '';
  return buf.toString('utf8');
};

test('no banned client or person names anywhere in the repo (hashed word list)', () => {
  const hits = [];
  for (const f of files) {
    const words = new Set(textOf(f).toLowerCase().match(/[a-z0-9]+/g) || []);
    for (const w of words) if (BANNED.has(hash(w))) hits.push(`${path.relative(root, f)}: a banned word (hash ${hash(w)})`);
  }
  assert.deepEqual(hits, []);
});

test('no real tenant hosts, deployment hosts or email addresses of real people', () => {
  const hits = [];
  for (const f of files) {
    const s = textOf(f);
    for (const m of s.matchAll(/\bxmc-[a-z0-9]+(?:-[a-z0-9]+){2,}\.sitecorecloud\.io/gi)) if (!/^xmc-demo-/i.test(m[0])) hits.push(`${path.relative(root, f)}: ${m[0]}`);
    for (const m of s.matchAll(/\b[a-z0-9-]+\.vercel\.app\b/gi)) hits.push(`${path.relative(root, f)}: ${m[0]}`);
    for (const m of s.matchAll(/\b[\w.+-]+@([a-z0-9-]+\.)+[a-z]{2,}\b/gi)) if (!/@(example\.(com|org|net|test)|anthropic\.com)$/i.test(m[0])) hits.push(`${path.relative(root, f)}: ${m[0]}`);
  }
  assert.deepEqual(hits, []);
});

test('the guard really scans: it sees the fixtures, including inside the Office files', () => {
  const rel = files.map((f) => path.relative(root, f));
  for (const f of ['test/fixtures/page-snapshot.json', 'test/fixtures/deck.docx', 'test/fixtures/workbook.xlsx', 'plugin/knowledge/playbooks/README.md']) assert.ok(rel.includes(f), f);
  assert.match(textOf(path.join(root, 'test/fixtures/deck.docx')), /North Clinic/);
});
