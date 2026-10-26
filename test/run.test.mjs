import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { newRunDir, writeRun, loadRun, summarize, assertRunFresh } from '../plugin/engine/lib/plan/run.mjs';

const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-run-'));
test.after(() => fs.rmSync(d, { recursive: true, force: true }));
const pages = [
  { key: 'a', status: 'ready', ops: { creates: [{}], updates: [{}, {}], layout: { to: 'x' }, rename: null }, pending: [{ category: 'placeholder' }, { category: 'review' }] },
  { key: 'b', status: 'up-to-date', ops: null, pending: [] },
  { key: 'c', status: 'needs-review', reasons: ['x'], pending: [{ category: 'review' }] },
];
test('write, load and summarize a run', () => {
  const { runId, dir } = newRunDir(d, 'dev');
  assert.match(runId, /_dev_plan$/);
  writeRun(dir, { runId, env: 'dev', project: 'demo', createdAt: new Date().toISOString(), pages, sources: [{ file: 'sources/x.txt', sha256: 'abc' }] });
  const run = loadRun(d, runId);
  assert.equal(run.pages.length, 3);
  const s = summarize(run);
  assert.deepEqual(s.counts, { ready: 1, 'up-to-date': 1, 'needs-review': 1, 'no-match': 0 });
  assert.equal(s.creates, 1); assert.equal(s.updates, 2); assert.equal(s.layouts, 1);
  assert.deepEqual(s.pendingByCategory, { placeholder: 1, review: 2 });
  assert.ok(fs.existsSync(path.join(dir, 'summary.json')));
});
test('assertRunFresh refuses an old run or a changed source, passes otherwise', () => {
  const base = { createdAt: new Date().toISOString(), sources: [{ file: 'sources/x.txt', sha256: 'abc' }] };
  assert.doesNotThrow(() => assertRunFresh(base, { maxAgeHours: 12, sources: [{ file: 'sources/x.txt', status: 'ok', sha256: 'abc' }] }));
  assert.throws(() => assertRunFresh({ ...base, createdAt: new Date(Date.now() - 13 * 3600e3).toISOString() }, { maxAgeHours: 12, sources: [] }), /older than 12 hours/);
  assert.throws(() => assertRunFresh(base, { maxAgeHours: 12, sources: [{ file: 'sources/x.txt', status: 'changed', sha256: 'zzz' }] }), /sources\/x\.txt changed/);
  assert.throws(() => assertRunFresh(base, { maxAgeHours: 12, sources: [{ file: 'sources/x.txt', status: 'missing', sha256: null }] }), /missing/);
});
