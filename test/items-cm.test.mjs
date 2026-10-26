import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { cmFromClient } from '../plugin/engine/lib/cm/adapter.mjs';

const tree = () => ({
  root: { id: 'root', name: 'Site', path: '/s', parentId: null, templateId: 't', templateName: 'Site', fields: {} },
  a: { id: 'a', name: 'A', path: '/s/A', parentId: 'root', templateId: 't', templateName: 'Folder', fields: {} },
  b: { id: 'b', name: 'B', path: '/s/B', parentId: 'root', templateId: 't', templateName: 'Folder', fields: {} },
  x: { id: 'x', name: 'X', path: '/s/A/X', parentId: 'a', templateId: 't', templateName: 'Item', fields: { Title: { value: 'x', std: false } } },
  y: { id: 'y', name: 'Y', path: '/s/A/X/Y', parentId: 'x', templateId: 't', templateName: 'Item', fields: {} },
});

test('fake moveItem moves a subtree and rewrites descendant paths', async () => {
  const cm = fakeCm({ items: tree() });
  await cm.moveItem({ id: 'x', toParentId: 'b' });
  assert.equal((await cm.getItem({ id: 'x' })).path, '/s/B/X');
  assert.equal((await cm.getItem({ id: 'y' })).path, '/s/B/X/Y');
  assert.equal((await cm.getItem({ id: 'x' })).parentId, 'b');
});
test('fake copyItem copies one item or a deep subtree under a new name with new ids', async () => {
  const cm = fakeCm({ items: tree() });
  const shallow = await cm.copyItem({ id: 'x', toParentId: 'b', name: 'X2', deep: false });
  const s = await cm.getItem({ id: shallow });
  assert.equal(s.path, '/s/B/X2'); assert.equal(s.fields.Title.value, 'x'); assert.equal(s.children.length, 0);
  const deep = await cm.copyItem({ id: 'x', toParentId: 'b', name: 'X3', deep: true });
  const d = await cm.getItem({ id: deep });
  assert.equal(d.children.length, 1); assert.notEqual(d.children[0].id, 'y');
  assert.equal((await cm.getItem({ id: d.children[0].id })).path, '/s/B/X3/Y');
});
test('adapter sends moveItem and copyItem with the confirmed input shapes', async () => {
  const calls = [];
  const client = { env: 'dev', writable: true, async query() { return null; }, async mutate(q, v) { calls.push([q, v]); return /copyItem/.test(q) ? { copyItem: { item: { itemId: '{AAAAAAAA-0000-0000-0000-000000000001}' } } } : { moveItem: { item: { itemId: 'x' } } }; } };
  const cm = cmFromClient(client);
  await cm.moveItem({ id: '11111111111111111111111111111111', toParentId: '22222222222222222222222222222222', sortOrder: 100 });
  assert.match(calls[0][0], /moveItem\(input:\$i\)/);
  assert.deepEqual(calls[0][1].i, { itemId: '11111111111111111111111111111111', targetParentId: '22222222222222222222222222222222', sortOrder: 100 });
  const id = await cm.copyItem({ id: '11111111111111111111111111111111', toParentId: '22222222222222222222222222222222', name: 'Copy', deep: true });
  assert.deepEqual(calls[1][1].i, { itemId: '11111111111111111111111111111111', targetParentId: '22222222222222222222222222222222', copyItemName: 'Copy', deepCopy: true });
  assert.equal(id, 'aaaaaaaa000000000000000000000001');
});
test('adapter restores from the recycle bin by looking up the archival id for the item, across pages', async () => {
  const calls = [];
  const page = (n, from) => Array.from({ length: n }, (_, i) => ({ archivalId: `a${from + i}`, itemId: `{0000000${from + i}-0000-0000-0000-000000000000}`.slice(0, 38) }));
  const client = { env: 'dev', writable: true,
    async query(q, v) { calls.push(['q', v]); if (v.page === 0) return { archivedItems: page(100, 0) }; return { archivedItems: [{ archivalId: 'target-archival', itemId: '{11111111-2222-3333-4444-555555555555}' }] }; },
    async mutate(q, v) { calls.push(['m', q, v]); return { restoreArchivedItem: { successful: true } }; } };
  const cm = cmFromClient(client);
  await cm.restoreArchivedItem({ id: '11111111222233334444555555555555' });
  const m = calls.find((c) => c[0] === 'm');
  assert.match(m[1], /restoreArchivedItem\(input:\$i\)/);
  assert.deepEqual(m[2].i, { archivalId: 'target-archival', archiveName: 'recyclebin' });
  const none = cmFromClient({ ...client, async query() { return { archivedItems: [] }; } });
  await assert.rejects(none.restoreArchivedItem({ id: '9'.repeat(32) }), /not in the recycle bin/);
});
