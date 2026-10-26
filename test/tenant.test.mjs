import test from 'node:test';
import assert from 'node:assert/strict';
import { scanTenant } from '../plugin/engine/lib/snapshot/tenant.mjs';

const G = (n) => `{${n.repeat(8)}-${n.repeat(4)}-${n.repeat(4)}-${n.repeat(4)}-${n.repeat(12)}}`;
const norm = (s) => s.replace(/[{}-]/g, '').toLowerCase();
function fakeClient() {
  const nodes = { [norm(G('1'))]: [{ itemId: G('2'), name: 'Home', path: '/s/Home', hasChildren: true, template: { templateId: G('a'), name: 'Folder' } }], [norm(G('2'))]: [{ itemId: G('3'), name: 'P', path: '/s/Home/P', hasChildren: false, template: { templateId: G('b'), name: 'Page' } }] };
  return { async query(q, vars) {
    if (/path:\$p/.test(q)) return { item: { itemId: G('1'), name: 'Root', path: '/s', hasChildren: true, template: { templateId: G('a'), name: 'Folder' } } };
    if (/children\(/.test(q)) return { item: { children: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: nodes[norm(vars.id)] || [] } } };
    const out = {}; [...q.matchAll(/(i\d+): item\(where:\{itemId:"([^"]+)"/g)].forEach((m) => { out[m[1]] = { version: 1, fields: { nodes: [{ name: 'title', value: 'T', containsStandardValue: false }, { name: 'x', value: 'std', containsStandardValue: true }, { name: 'e', value: '', containsStandardValue: false }] } }; });
    return out;
  } };
}
test('scanTenant walks the tree and collects non-standard, non-empty fields', async () => {
  const { tree, fields } = await scanTenant({ client: fakeClient(), root: '/s', concurrency: 2, fieldBatch: 2 });
  assert.deepEqual(tree.map((t) => t.name), ['Root', 'Home', 'P']);
  assert.equal(tree[2].parentId, tree[1].id);
  assert.deepEqual(fields[tree[2].id].f, { title: 'T' });
});
