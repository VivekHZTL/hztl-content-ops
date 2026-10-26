import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { applyMany } from '../plugin/engine/lib/apply/many.mjs';
import { rollbackPage } from '../plugin/engine/lib/apply/undo.mjs';
import { journalWriter } from '../plugin/engine/lib/apply/journal.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-many-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('applyMany runs with bounded concurrency and stops after maxFailures', async () => {
  const plans = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, itemId: `i${i}`, title: `t${i}` }));
  let active = 0, peak = 0;
  const applyFn = async ({ plan }) => { active++; peak = Math.max(peak, active); await new Promise((ok) => setTimeout(ok, 5)); active--; return { key: plan.key, status: +plan.key.slice(1) % 3 === 0 ? 'failed' : 'done' }; };
  const out = await applyMany({ cm: { env: 'fake', isProd: false, writable: true }, plans, runDir: tmp, applyId: 'x', site: {}, confirm: 'fake', concurrency: 3, maxFailures: 2, applyFn });
  assert.ok(peak <= 3 && peak >= 2);
  assert.match(out.stoppedEarly, /2 failures/);
  assert.ok(out.notStarted.length > 0);
  assert.equal(out.results.length + out.notStarted.length, 10);
});
test('rollbackPage finds the journal by applyId and key and restores strictly', async () => {
  const items = { p: { id: 'p', name: 'Page', path: '/p', templateId: 't', templateName: 'T', parentId: '', version: 1, fields: { title: { value: 'old', std: false } } } };
  const cm = fakeCm({ items });
  fs.mkdirSync(path.join(tmp, 'journal'), { recursive: true });
  const jw = journalWriter(path.join(tmp, 'journal', 'a9_k.json'), { key: 'k', itemId: 'p', env: 'fake', applyId: 'a9' });
  await jw.step({ op: 'update', id: 'p', fields: [{ name: 'title', from: 'old', std: false, to: 'new' }] }, () => cm.updateItem({ id: 'p', fields: [{ name: 'title', value: 'new' }] }));
  jw.finish('done');
  const problems = await rollbackPage({ cm, runDir: tmp, applyId: 'a9', key: 'k' });
  assert.deepEqual(problems, []);
  assert.equal((await cm.getItem({ id: 'p' })).fields.title.value, 'old');
  assert.ok(JSON.parse(fs.readFileSync(path.join(tmp, 'journal', 'a9_k.json'), 'utf8')).manualRollback);
  await assert.rejects(rollbackPage({ cm, runDir: tmp, applyId: 'a9', key: 'nope' }), /No journal/);
});
