import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { planChangeSet } from '../plugin/engine/lib/items/plan.mjs';
import { applyChangeSet, verifyChangeSet } from '../plugin/engine/lib/items/apply.mjs';
import { rollbackPage } from '../plugin/engine/lib/apply/undo.mjs';

const T = '1'.repeat(32);
const tree = () => Object.fromEntries(Object.values({
  root: { id: 'r0', name: 'Site', path: '/s', parentId: null, templateId: T, templateName: 'Site', fields: {} },
  data: { id: 'd0', name: 'Data', path: '/s/Data', parentId: 'r0', templateId: T, templateName: 'Folder', fields: {} },
  dep: { id: 'dep1', name: 'Cardiology', path: '/s/Data/Cardiology', parentId: 'd0', templateId: T, templateName: 'Department', fields: { Phone: { value: '612-555-0100', std: false }, Note: { value: '', std: true } } },
  home: { id: 'h0', name: 'Home', path: '/s/Home', parentId: 'r0', templateId: T, templateName: 'Home', fields: {} },
  page: { id: 'p1', name: 'heart', path: '/s/Home/heart', parentId: 'h0', templateId: T, templateName: 'Page', fields: { Title: { value: 'Heart', std: false } } },
  pdata: { id: 'pd', name: 'Data', path: '/s/Home/heart/Data', parentId: 'p1', templateId: T, templateName: 'Folder', fields: {} },
  park: { id: 'pk', name: 'Parked', path: '/s/Home/Parked', parentId: 'h0', templateId: T, templateName: 'Folder', fields: {} },
  old: { id: 'o1', name: 'old-copy', path: '/s/Home/old-copy', parentId: 'h0', templateId: T, templateName: 'Page', fields: {} },
  other: { id: 'x9', name: 'Elsewhere', path: '/other/x', parentId: null, templateId: T, templateName: 'X', fields: {} },
}).map((x) => [x.id, x]));
const opts = { siteRoot: '/s' };
const set = (ops, extra = {}) => ({ key: 'k1', title: 'Test', itemId: 'p1', ops, ...extra });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cops-items-'));

test('plan records the before-state the engine reads itself, and drops no-op steps', async () => {
  const cm = fakeCm({ items: tree() });
  const p = await planChangeSet(cm, set([
    { op: 'update', id: 'dep1', fields: [{ name: 'Phone', to: '+1 612-555-0100' }, { name: 'Note', to: '' }] },
    { op: 'rename', id: 'pd', to: 'Data-old' },
    { op: 'move', id: 'o1', toParent: 'pk' },
    { op: 'create', ref: 'new:shared', parent: 'd0', name: 'At a Glance', templateId: T, fields: [{ name: 'Heading', to: 'At a glance' }] },
    { op: 'update', ref: 'new:shared', fields: [{ name: 'Body', to: '<p>Hi</p>' }] },
  ]), opts);
  assert.equal(p.status, 'ready', p.reasons?.join('; '));
  const up = p.ops.find((o) => o.op === 'update' && o.id === 'dep1');
  assert.deepEqual(up.fields, [{ name: 'Phone', to: '+1 612-555-0100', from: '612-555-0100', std: false }]);
  assert.equal(p.ops.find((o) => o.op === 'rename').from, 'Data');
  assert.equal(p.ops.find((o) => o.op === 'move').fromParent, 'h0');
  assert.ok(p.fingerprint);
});

test('plan marks up-to-date when nothing would change, and needs-review for bad or out-of-site steps', async () => {
  const cm = fakeCm({ items: tree() });
  assert.equal((await planChangeSet(cm, set([{ op: 'update', id: 'dep1', fields: [{ name: 'Phone', to: '612-555-0100' }] }, { op: 'rename', id: 'pd', to: 'Data' }]), opts)).status, 'up-to-date');
  for (const [ops, re] of [
    [[{ op: 'update', id: 'x9', fields: [{ name: 'A', to: 'b' }] }], /outside the site root/],
    [[{ op: 'update', id: 'nope', fields: [{ name: 'A', to: 'b' }] }], /not found/],
    [[{ op: 'explode', id: 'p1' }], /Unknown op/],
    [[{ op: 'create', ref: 'new:a', parent: 'd0', name: 'Cardiology', templateId: T }], /already exists/],
    [[{ op: 'move', id: 'h0', toParent: 'p1' }], /inside itself/],
    [[{ op: 'delete', id: 'r0' }], /site root/],
    [[{ op: 'update', ref: 'new:zz', fields: [{ name: 'A', to: 'b' }] }], /new:zz/],
    [[{ op: 'update', id: 'dep1', fields: [{ name: 'Fax', to: '1' }] }], /Fax not a field on \/s\/Data\/Cardiology/],
  ]) {
    const p = await planChangeSet(cm, set(ops), opts);
    assert.equal(p.status, 'needs-review'); assert.match(p.reasons.join('; '), re);
  }
  const held = await planChangeSet(cm, set([{ op: 'rename', id: 'pd', to: 'Data-old' }], { reasons: ['Layout has personalization rules'] }), opts);
  assert.equal(held.status, 'needs-review'); assert.match(held.reasons[0], /personalization/);
});

test('apply runs every op with a journal, reads back, and verify agrees', async () => {
  const cm = fakeCm({ items: tree() });
  const p = await planChangeSet(cm, set([
    { op: 'rename', id: 'pd', to: 'Data-old' },
    { op: 'create', ref: 'new:data', parent: 'p1', name: 'Data', templateId: T },
    { op: 'copy', ref: 'new:card', id: 'dep1', toParent: 'new:data', name: 'Card', deep: true },
    { op: 'update', ref: 'new:card', fields: [{ name: 'Phone', to: '+1 000' }] },
    { op: 'update', id: 'p1', fields: [{ name: 'Title', to: '{{new:card}}' }] },
    { op: 'move', id: 'o1', toParent: 'pk' },
    { op: 'delete', id: 'o1' },
  ]), opts);
  assert.equal(p.status, 'ready', p.reasons?.join('; '));
  const dir = tmp();
  const r = await applyChangeSet({ cm, plan: p, runDir: dir, applyId: 'a1', confirm: 'fake' });
  assert.equal(r.status, 'done', r.error + ' ' + (r.verify || []).join('; '));
  assert.equal((await cm.getItem({ id: 'pd' })).name, 'Data-old');
  const card = r.created['new:card'];
  assert.equal((await cm.getItem({ id: card })).fields.Phone.value, '+1 000');
  assert.match((await cm.getItem({ id: 'p1' })).fields.Title.value, /^\{[0-9A-F-]+\}$/);
  assert.equal(await cm.getItem({ id: 'o1' }), null);
  assert.deepEqual(await verifyChangeSet(cm, p, { page: 'p1', ...r.created }), []);
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'journal', r.journal), 'utf8'));
  assert.deepEqual(j.steps.map((s) => s.op), ['rename', 'create', 'copy', 'update', 'update', 'move', 'delete']);
  assert.equal(j.kind, 'items');
});

test('apply refuses a stale change set, and rolls everything back on a failure mid-way', async () => {
  const cm = fakeCm({ items: tree() });
  const p = await planChangeSet(cm, set([{ op: 'update', id: 'dep1', fields: [{ name: 'Phone', to: '+1' }] }]), opts);
  await cm.updateItem({ id: 'dep1', fields: [{ name: 'Phone', value: 'edited by a person' }] });
  assert.equal((await applyChangeSet({ cm, plan: p, runDir: tmp(), applyId: 'a1', confirm: 'fake' })).status, 'stale');

  let n = 0;
  const cm2 = fakeCm({ items: tree(), failOn: (op) => op === 'update' && ++n === 2 });
  const before = structuredClone(cm2.db);
  const p2 = await planChangeSet(cm2, set([
    { op: 'move', id: 'o1', toParent: 'pk' }, { op: 'rename', id: 'pd', to: 'Data-old' },
    { op: 'create', ref: 'new:a', parent: 'd0', name: 'Shared', templateId: T },
    { op: 'update', id: 'dep1', fields: [{ name: 'Phone', to: '+1' }] }, { op: 'delete', id: 'pk' },
    { op: 'update', id: 'p1', fields: [{ name: 'Title', to: 'x' }] },
  ]), opts);
  const r = await applyChangeSet({ cm: cm2, plan: p2, runDir: tmp(), applyId: 'a1', confirm: 'fake' });
  assert.equal(r.status, 'rolled-back', JSON.stringify(r));
  for (const id of Object.keys(before)) { const now = await cm2.getItem({ id }); assert.equal(now?.path, before[id].path, id); assert.deepEqual(now?.fields, before[id].fields, id); }
  assert.equal(Object.keys(cm2.db).length, Object.keys(before).length);
});

test('manual undo restores a done change set and leaves fields edited since alone', async () => {
  const cm = fakeCm({ items: tree() });
  const p = await planChangeSet(cm, set([{ op: 'update', id: 'dep1', fields: [{ name: 'Phone', to: '+1' }] }, { op: 'update', id: 'p1', fields: [{ name: 'Title', to: 'New' }] }, { op: 'move', id: 'o1', toParent: 'pk' }]), opts);
  const dir = tmp();
  assert.equal((await applyChangeSet({ cm, plan: p, runDir: dir, applyId: 'a1', confirm: 'fake' })).status, 'done');
  await cm.updateItem({ id: 'p1', fields: [{ name: 'Title', value: 'Edited later' }] });
  const problems = await rollbackPage({ cm, runDir: dir, applyId: 'a1', key: 'k1' });
  assert.equal((await cm.getItem({ id: 'dep1' })).fields.Phone.value, '612-555-0100');
  assert.equal((await cm.getItem({ id: 'p1' })).fields.Title.value, 'Edited later');
  assert.equal((await cm.getItem({ id: 'o1' })).parentId, 'h0');
  assert.equal(problems.length, 1); assert.match(problems[0], /Title/);
});

test('the write gate still applies: no confirm, wrong env, or read-only client is refused', async () => {
  const cm = fakeCm({ items: tree() });
  const p = await planChangeSet(cm, set([{ op: 'rename', id: 'pd', to: 'Data-old' }]), opts);
  await assert.rejects(applyChangeSet({ cm, plan: p, runDir: tmp(), applyId: 'a1' }), /--confirm/);
  await assert.rejects(applyChangeSet({ cm: { ...cm, writable: false }, plan: p, runDir: tmp(), applyId: 'a1', confirm: 'fake' }), /read-only/);
});

test('undo can be run again: steps already undone are skipped, not reported', async () => {
  const cm = fakeCm({ items: tree() });
  const p = await planChangeSet(cm, set([{ op: 'update', id: 'dep1', fields: [{ name: 'Phone', to: '+1' }] }, { op: 'copy', ref: 'new:c', id: 'dep1', toParent: 'd0', name: 'Copy' }, { op: 'delete', id: 'o1' }]), opts);
  const dir = tmp();
  assert.equal((await applyChangeSet({ cm, plan: p, runDir: dir, applyId: 'a1', confirm: 'fake' })).status, 'done');
  assert.deepEqual(await rollbackPage({ cm, runDir: dir, applyId: 'a1', key: 'k1' }), []);
  assert.deepEqual(await rollbackPage({ cm, runDir: dir, applyId: 'a1', key: 'k1' }), []);
  assert.equal((await cm.getItem({ id: 'dep1' })).fields.Phone.value, '612-555-0100');
  assert.ok(await cm.getItem({ id: 'o1' }));
});

test('plans carry readable paths, and show describes steps by path', async () => {
  const { describeOp } = await import('../plugin/engine/lib/plan/run.mjs');
  const cm = fakeCm({ items: tree() });
  const p = await planChangeSet(cm, set([
    { op: 'create', ref: 'new:x', parent: 'd0', name: 'New' },
  ].map((o) => ({ ...o, templateId: T })).concat([
    { op: 'update', ref: 'new:x', fields: [{ name: 'A', to: 'b' }] },
    { op: 'rename', id: 'pd', to: 'Data-old' }, { op: 'move', id: 'o1', toParent: 'pk' },
    { op: 'copy', ref: 'new:c', id: 'dep1', toParent: 'new:x', name: 'C' },
  ])), opts);
  const lines = p.ops.map(describeOp);
  assert.deepEqual(lines, [
    'create "New" under /s/Data',
    'A on /s/Data/New: "" → "b"',
    'rename /s/Home/heart/Data: "Data" → "Data-old"',
    'move /s/Home/old-copy from /s/Home to /s/Home/Parked',
    'copy /s/Data/Cardiology as "C" under /s/Data/New (with children)',
  ]);
});
