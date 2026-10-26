import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { journalWriter, rollbackJournal } from '../plugin/engine/lib/apply/journal.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-j-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const items = { p: { id: 'p', name: 'Page', path: '/p', templateId: 't', templateName: 'T', parentId: '', version: 1, fields: { title: { value: 'old', std: false }, body: { value: '', std: true } } } };

test('journal is written before the step runs and rollback restores in reverse', async () => {
  const cm = fakeCm({ items });
  const file = path.join(tmp, 'j1.json');
  const jw = journalWriter(file, { key: 'k', env: 'dev' });
  let seenBefore = null;
  await jw.step({ op: 'update', id: 'p', fields: [{ name: 'title', from: 'old', std: false, to: 'new' }, { name: 'body', from: '', std: true, to: 'b' }] }, async () => { seenBefore = JSON.parse(fs.readFileSync(file, 'utf8')).steps[0].state; await cm.updateItem({ id: 'p', fields: [{ name: 'title', value: 'new' }, { name: 'body', value: 'b' }] }); });
  const rec = { op: 'create', parentId: 'p', name: 'New', preexisting: [] };
  await jw.step(rec, async () => { rec.id = await cm.createItem({ parentId: 'p', name: 'New', templateId: 't' }); });
  await jw.step({ op: 'rename', id: 'p', from: 'Page', to: 'Page2' }, () => cm.renameItem({ id: 'p', newName: 'Page2' }));
  jw.finish('done');
  assert.equal(seenBefore, 'started');
  const problems = await rollbackJournal(cm, jw.j);
  assert.deepEqual(problems, []);
  const p = await cm.getItem({ id: 'p' });
  assert.equal(p.name, 'Page');
  assert.equal(p.fields.title.value, 'old');
  assert.equal(p.fields.body.std, true);
  assert.equal(p.children.length, 0);
});
test('strict rollback leaves a field changed since the run and reports it', async () => {
  const cm = fakeCm({ items });
  const jw = journalWriter(path.join(tmp, 'j2.json'), { key: 'k', env: 'dev' });
  await jw.step({ op: 'update', id: 'p', fields: [{ name: 'title', from: 'old', std: false, to: 'new' }] }, () => cm.updateItem({ id: 'p', fields: [{ name: 'title', value: 'new' }] }));
  await cm.updateItem({ id: 'p', fields: [{ name: 'title', value: 'edited by author' }] });
  const problems = await rollbackJournal(cm, jw.j, { strict: true });
  assert.equal((await cm.getItem({ id: 'p' })).fields.title.value, 'edited by author');
  assert.match(problems[0], /title changed since run/);
});
