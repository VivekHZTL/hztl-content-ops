import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRefIndex } from '../plugin/engine/lib/refs/index.mjs';

const T = 'd8401815ae71411ab3986d260e17c36b';
const tree = [
  { id: 'r', name: 'Home', path: '/s/Home', parentId: '', templateId: '', templateName: 'Folder' },
  { id: T, name: 'target', path: '/s/Home/target', parentId: 'r', templateId: '', templateName: 'Landing Page' },
  { id: 'd1', name: 'DS', path: '/s/Home/target/Data/DS', parentId: T, templateId: '', templateName: 'Ds' },
  { id: 'a', name: 'A', path: '/s/Home/a', parentId: 'r', templateId: '', templateName: 'Landing Page' },
  { id: 'b', name: 'B', path: '/s/Home/b', parentId: 'r', templateId: '', templateName: 'Landing Page' },
];
const fields = {
  [T]: { version: 1, f: { '__Final Renderings': '<r/>' } },
  a: { version: 1, f: { link: '<link id="{D8401815-AE71-411A-B398-6D260E17C36B}" />', __Updated: '{D8401815-AE71-411A-B398-6D260E17C36B}', rte: '<a href="/target">t</a>' } },
  b: { version: 1, f: { ds: 'local:/Data/DS', p: '/s/Home/target' } },
  d1: { version: 1, f: {} },
};
test('finds GUID, URL, local: and path references and groups by target', () => {
  const { refs, byTarget } = buildRefIndex({ tree, fields, targets: new Set([T, 'd1']), homePath: '/s/Home' });
  const hows = refs.filter((r) => r.from === 'a').map((r) => r.how).sort();
  assert.deepEqual(hows, ['URL', 'id']);
  assert.ok(refs.some((r) => r.from === 'b' && r.how === 'sitecore path' && r.target === T));
  assert.ok(!refs.some((r) => r.field === '__Updated'));
  assert.ok(byTarget.get(T).length >= 3);
});
test('a local: reference resolves against the referring item path', () => {
  const t2 = [...tree, { id: 'd2', name: 'DS', path: '/s/Home/b/Data/DS', parentId: 'b', templateId: '', templateName: 'Ds' }];
  const { refs } = buildRefIndex({ tree: t2, fields: { ...fields, b: { version: 1, f: { ds: 'local:/Data/DS' } } }, targets: new Set(['d2']), homePath: '/s/Home' });
  assert.ok(refs.some((r) => r.from === 'b' && r.target === 'd2' && r.how === 'local: path'));
});
