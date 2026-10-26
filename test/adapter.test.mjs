import test from 'node:test';
import assert from 'node:assert/strict';
import { cmFromClient } from '../plugin/engine/lib/cm/adapter.mjs';

function fakeClient(pages) {
  const calls = [];
  return { env: 'dev', host: 'h', isProd: false, writable: true, calls,
    async query(q, vars) { calls.push({ q, vars }); return pages.shift(); },
    async mutate(q, vars) { calls.push({ q, vars }); return { createItem: { item: { itemId: '{AAAAAAAA-0000-0000-0000-000000000001}', name: vars.i.name } } }; } };
}
const item = (after) => ({ item: { itemId: '{11111111-1111-1111-1111-111111111111}', name: 'Page', path: '/p', version: 2, parent: { itemId: '{22222222-2222-2222-2222-222222222222}' }, template: { templateId: '{33333333-3333-3333-3333-333333333333}', name: 'T' },
  fields: { nodes: [{ name: 'title', value: 'x', containsStandardValue: false }, { name: 'empty', value: null, containsStandardValue: true }] },
  children: after ? { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ itemId: '{44444444-4444-4444-4444-444444444444}', name: 'B', template: { name: 'C' } }] }
                 : { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [{ itemId: '{55555555-5555-5555-5555-555555555555}', name: 'A', template: { name: 'C' } }] } } });

test('getItem normalises ids, fields and paginates children', async () => {
  const c = fakeClient([item(false), item(true)]);
  const it = await cmFromClient(c).getItem({ id: '{11111111-1111-1111-1111-111111111111}' });
  assert.equal(it.id, '11111111111111111111111111111111');
  assert.equal(it.parentId, '22222222222222222222222222222222');
  assert.deepEqual(it.fields.title, { value: 'x', std: false });
  assert.deepEqual(it.fields.empty, { value: '', std: true });
  assert.deepEqual(it.children.map((x) => x.name), ['A', 'B']);
  assert.equal(c.calls[0].vars.language, 'en');
});
test('language is a parameter', async () => {
  const c = fakeClient([item(true)]);
  await cmFromClient(c, { language: 'de' }).getItem({ path: '/p' });
  assert.equal(c.calls[0].vars.language, 'de');
});
test('createItem braces the template id and returns a normalised id', async () => {
  const c = fakeClient([]);
  const id = await cmFromClient(c).createItem({ parentId: '{22222222-2222-2222-2222-222222222222}', name: 'N', templateId: '33333333333333333333333333333333' });
  assert.equal(id, 'aaaaaaaa000000000000000000000001');
  assert.equal(c.calls[0].vars.i.templateId, '{33333333-3333-3333-3333-333333333333}');
});
test('deleteItem is never permanent', async () => {
  const c = fakeClient([]);
  await cmFromClient(c).deleteItem({ id: 'x' });
  assert.equal(c.calls[0].vars.i.permanently, false);
});
