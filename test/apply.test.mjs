import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeCm, itemsFromSnapshot } from '../plugin/engine/lib/cm/fake.mjs';
import { snapshotPage, fingerprint } from '../plugin/engine/lib/snapshot/page.mjs';
import { parseLayout, buildLayout, newEntry, placeholderFor, describe } from '../plugin/engine/lib/layout/layout.mjs';
import { applyPage } from '../plugin/engine/lib/apply/page.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const snap0 = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/page-snapshot.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-apply-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const xml = snap0.page.fields['__Final Renderings'].value;
const device = xml.match(/<d\s[^>]*id="([^"]+)"/)[1];
const ids = [...new Set([...xml.matchAll(/s:id="\{([^}]+)\}"/g)].map((m) => m[1].toUpperCase()))];
const site = { device, placeholders: { hero: '/h', main: '/m' }, components: Object.fromEntries(ids.map((id, i) => [`c${i}`, { name: `Component ${i}`, renderingId: id, ph: i === 0 ? 'hero' : 'main' }])) };
site.components.rte = { name: 'Rich Text', renderingId: 'DDDDDDDD-1111-1111-1111-111111111111', ph: 'main' };

async function makePlan(cm, { badLayout = false } = {}) {
  const snap = await snapshotPage(cm, snap0.page.id);
  const { entries } = parseLayout(xml, site);
  const added = newEntry({ key: 'rte', ds: 'local:/Data/RTE', ph: placeholderFor('rte', null, site), dynId: 99 }, site);
  const after = [...entries, added];
  return { key: 'k', itemId: snap0.page.id, title: 'P', status: 'ready', fingerprint: fingerprint(snap),
    ops: { creates: [{ ref: 'new:RTE', parentRef: snap.data.id, name: 'RTE', templateId: 'eeeeeeee111111111111111111111111' }],
           updates: [{ ref: 'new:RTE', field: 'text', from: '', std: true, to: '<p>Hello</p>' }, { ref: 'page', field: 'pageTitle', from: snap.page.fields.pageTitle?.value ?? '', std: false, to: 'New title' }],
           layout: { to: buildLayout(after, site) }, rename: null },
    layout: { after: badLayout ? ['Nope'] : describe(after, site) } };
}

test('applies creates, updates and layout, then verifies', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const plan = await makePlan(cm);
  const r = await applyPage({ cm, plan, runDir: tmp, applyId: 'a1', site, confirm: 'fake' });
  assert.equal(r.status, 'done', r.error);
  assert.ok(r.created['new:RTE']);
  assert.equal((await cm.getItem({ id: r.created['new:RTE'] })).fields.text.value, '<p>Hello</p>');
  assert.equal((await cm.getItem({ id: snap0.page.id })).fields.pageTitle.value, 'New title');
  assert.ok(fs.existsSync(path.join(tmp, 'journal')));
});
test('a stale page is skipped without writing', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const plan = await makePlan(cm);
  await cm.updateItem({ id: snap0.page.id, fields: [{ name: 'pageTitle', value: 'someone edited' }] });
  const before = cm.log.length;
  const r = await applyPage({ cm, plan, runDir: tmp, applyId: 'a2', site, confirm: 'fake' });
  assert.equal(r.status, 'stale');
  assert.equal(cm.log.length, before);
});
test('a verify mismatch rolls the page back', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const plan = await makePlan(cm, { badLayout: true });
  const before = (await cm.getItem({ id: snap0.page.id })).fields.pageTitle.value;
  const r = await applyPage({ cm, plan, runDir: tmp, applyId: 'a3', site, confirm: 'fake' });
  assert.equal(r.status, 'rolled-back');
  assert.match(r.verify[0], /Layout is/);
  assert.equal((await cm.getItem({ id: snap0.page.id })).fields.pageTitle.value, before);
  const data = (await cm.getItem({ id: snap0.page.id })).children.find((c) => c.name === 'Data');
  assert.ok(!(await cm.getItem({ id: data.id })).children.find((c) => c.name === 'RTE'));
});
test('a write failure rolls back and reports', async () => {
  let hits = 0; // fail the forward layout write only; the rollback's restore of the same field must succeed
  const cm = fakeCm({ items: itemsFromSnapshot(snap0), failOn: (op, arg) => op === 'update' && arg.fields.some((f) => f.name === '__Final Renderings') && hits++ === 0 });
  const plan = await makePlan(cm);
  const r = await applyPage({ cm, plan, runDir: tmp, applyId: 'a4', site, confirm: 'fake' });
  assert.equal(r.status, 'rolled-back');
  assert.match(r.error, /Injected failure/);
});
test('a plan that is not ready is skipped', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const r = await applyPage({ cm, plan: { ...(await makePlan(cm)), status: 'needs-review' }, runDir: tmp, applyId: 'a5', site, confirm: 'fake' });
  assert.equal(r.status, 'skipped');
});
