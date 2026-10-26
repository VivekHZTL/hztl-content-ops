import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeCm, itemsFromSnapshot } from '../plugin/engine/lib/cm/fake.mjs';
import { snapshotPage, fingerprint } from '../plugin/engine/lib/snapshot/page.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const snap0 = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/page-snapshot.json'), 'utf8'));

test('snapshotPage reads the page and its Data tree', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const s = await snapshotPage(cm, snap0.page.id);
  assert.equal(s.page.id, snap0.page.id);
  assert.equal(s.data.name, 'Data');
  assert.ok(s.data.children.length > 0);
});
test('fingerprint ignores __Updated but not content', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const a = fingerprint(await snapshotPage(cm, snap0.page.id));
  await cm.updateItem({ id: snap0.page.id, fields: [{ name: '__Updated', value: '20991231T000000Z' }] });
  assert.equal(fingerprint(await snapshotPage(cm, snap0.page.id)), a);
  await cm.updateItem({ id: snap0.page.id, fields: [{ name: 'pageTitle', value: 'changed' }] });
  assert.notEqual(fingerprint(await snapshotPage(cm, snap0.page.id)), a);
});
