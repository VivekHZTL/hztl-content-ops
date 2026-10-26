import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeCm, itemsFromSnapshot } from '../plugin/engine/lib/cm/fake.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const snap = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/page-snapshot.json'), 'utf8'));

test('fake cm round-trips create, update, rename, delete and logs them', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap) });
  const page = await cm.getItem({ id: snap.page.id });
  assert.equal(page.name, snap.page.name);
  const data = page.children.find((c) => c.name === 'Data');
  const id = await cm.createItem({ parentId: data.id, name: 'New', templateId: 'abc' });
  await cm.updateItem({ id, fields: [{ name: 'title', value: 'T' }] });
  await cm.renameItem({ id, newName: 'New2' });
  assert.equal((await cm.getItem({ id })).fields.title.value, 'T');
  assert.equal((await cm.getItem({ id })).name, 'New2');
  await cm.deleteItem({ id });
  assert.equal(await cm.getItem({ id }), null);
  assert.deepEqual(cm.log.map((l) => l[0]), ['create', 'update', 'rename', 'delete']);
});
test('failOn injects a failure', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap), failOn: (op) => op === 'update' });
  await assert.rejects(cm.updateItem({ id: snap.page.id, fields: [] }), /Injected failure on update/);
});
