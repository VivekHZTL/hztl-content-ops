// Tests added from the phase-A review. Each pins one finding.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeCm, itemsFromSnapshot } from '../plugin/engine/lib/cm/fake.mjs';
import { journalWriter, rollbackJournal } from '../plugin/engine/lib/apply/journal.mjs';
import { rollbackPage } from '../plugin/engine/lib/apply/undo.mjs';
import { applyPage } from '../plugin/engine/lib/apply/page.mjs';
import { applyMany } from '../plugin/engine/lib/apply/many.mjs';
import { publishItems } from '../plugin/engine/lib/publish/publish.mjs';
import { resolveEnv } from '../plugin/engine/lib/client/env.mjs';
import { snapshotPage, fingerprint } from '../plugin/engine/lib/snapshot/page.mjs';
import { parseLayout, buildLayout, describe } from '../plugin/engine/lib/layout/layout.mjs';
import { exactValue } from '../plugin/engine/lib/verify/values.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const snap0 = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/page-snapshot.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-fix-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const items = { p: { id: 'p', name: 'Page', path: '/p', templateId: 't', templateName: 'T', parentId: '', version: 1, fields: { title: { value: 'old', std: false }, rte: { value: '<p>a</p>', std: false } } } };
const xml = snap0.page.fields['__Final Renderings'].value;
const device = xml.match(/<d\s[^>]*id="([^"]+)"/)[1];
const ids = [...new Set([...xml.matchAll(/s:id="\{([^}]+)\}"/g)].map((m) => m[1].toUpperCase()))];
const site = { device, placeholders: { hero: '/h', main: '/m' }, components: Object.fromEntries(ids.map((id, i) => [`c${i}`, { name: `Component ${i}`, renderingId: id, ph: i === 0 ? 'hero' : 'main' }])) };

// Finding 2: strict undo must not treat a formatting-only edit as "unchanged".
test('exactValue sees a formatting-only rich text edit; strict undo keeps it', async () => {
  assert.ok(!exactValue('<p>a</p>', '<p><strong>a</strong></p>'));
  assert.ok(exactValue('<p>a</p>\n', ' <p>a</p>'));
  assert.ok(exactValue('{AB}|{CD}', '{ab}|{cd}'));
  const cm = fakeCm({ items });
  const jw = journalWriter(path.join(tmp, 'f2.json'), { key: 'k', env: 'fake' });
  await jw.step({ op: 'update', id: 'p', fields: [{ name: 'rte', from: '<p>a</p>', std: false, to: '<p>b</p>' }] }, () => cm.updateItem({ id: 'p', fields: [{ name: 'rte', value: '<p>b</p>' }] }));
  await cm.updateItem({ id: 'p', fields: [{ name: 'rte', value: '<p><strong>b</strong></p>' }] });
  const problems = await rollbackJournal(cm, jw.j, { strict: true });
  assert.equal((await cm.getItem({ id: 'p' })).fields.rte.value, '<p><strong>b</strong></p>');
  assert.equal(problems.length, 1);
});

// Finding 1: strict undo must not delete a created item when a field it is wired from was left alone.
test('strict undo keeps created items when any field was left alone, and says so', async () => {
  const cm = fakeCm({ items });
  const jw = journalWriter(path.join(tmp, 'f1.json'), { key: 'k', env: 'fake' });
  const rec = { op: 'create', parentId: 'p', name: 'DS', preexisting: [] };
  await jw.step(rec, async () => { rec.id = await cm.createItem({ parentId: 'p', name: 'DS', templateId: 't' }); });
  await jw.step({ op: 'update', id: 'p', fields: [{ name: 'title', from: 'old', std: false, to: 'new' }] }, () => cm.updateItem({ id: 'p', fields: [{ name: 'title', value: 'new' }] }));
  await cm.updateItem({ id: 'p', fields: [{ name: 'title', value: 'author edit' }] });
  const problems = await rollbackJournal(cm, jw.j, { strict: true });
  assert.ok((await cm.getItem({ id: rec.id })), 'created item must still exist');
  assert.ok(problems.some((p) => /kept/i.test(p)));
});

// Finding 4: journal saves are atomic and a corrupt journal does not break undo of another page.
test('a truncated journal file is skipped by rollbackPage, not fatal', async () => {
  const cm = fakeCm({ items });
  fs.mkdirSync(path.join(tmp, 'journal'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'journal', 'z1_bad.json'), '{"key": "bad", "steps": [');
  const jw = journalWriter(path.join(tmp, 'journal', 'z1_k.json'), { key: 'k', itemId: 'p', env: 'fake', applyId: 'z1', status: 'done' });
  await jw.step({ op: 'update', id: 'p', fields: [{ name: 'title', from: 'old', std: false, to: 'new' }] }, () => cm.updateItem({ id: 'p', fields: [{ name: 'title', value: 'new' }] }));
  jw.finish('done');
  assert.ok(!fs.existsSync(path.join(tmp, 'journal', 'z1_k.json.tmp')));
  const problems = await rollbackPage({ cm, runDir: tmp, applyId: 'z1', key: 'k' });
  assert.deepEqual(problems, []);
});

// Finding 11: undo refuses the wrong environment and a journal that is not "done".
test('rollbackPage refuses a journal from another env or one that already rolled back', async () => {
  const cm = fakeCm({ items, env: 'fake' });
  fs.mkdirSync(path.join(tmp, 'journal'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'journal', 'z2_k.json'), JSON.stringify({ key: 'k', env: 'prod', applyId: 'z2', status: 'done', steps: [] }));
  await assert.rejects(rollbackPage({ cm, runDir: tmp, applyId: 'z2', key: 'k' }), /environment/);
  fs.writeFileSync(path.join(tmp, 'journal', 'z3_k.json'), JSON.stringify({ key: 'k', env: 'fake', applyId: 'z3', status: 'rolled-back', steps: [] }));
  await assert.rejects(rollbackPage({ cm, runDir: tmp, applyId: 'z3', key: 'k' }), /rolled-back/);
});

// Finding 3 and 9: apply refuses an unsafe layout, needs confirm, needs prod on prod.
function readyPlan(snap) {
  const { entries } = parseLayout(xml, site);
  return { key: 'k', itemId: snap0.page.id, title: 'P', status: 'ready', fingerprint: fingerprint(snap),
    ops: { creates: [], updates: [{ ref: 'page', field: 'pageTitle', from: snap.page.fields.pageTitle?.value ?? '', std: false, to: 'X' }], layout: { to: buildLayout(entries, site) }, rename: null },
    layout: { after: describe(entries, site) } };
}
test('applyPage refuses a two-device layout as skipped with the guard reason', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  await cm.updateItem({ id: snap0.page.id, fields: [{ name: '__Final Renderings', value: xml.replace('</r>', '') + `<d id="{00000000-0000-0000-0000-000000000002}"></d></r>` }] });
  const plan = readyPlan(await snapshotPage(cm, snap0.page.id));
  const r = await applyPage({ cm, plan, runDir: tmp, applyId: 'g1', site, confirm: 'fake' });
  assert.equal(r.status, 'skipped');
  assert.match(r.error, /devices/);
});
test('applyPage refuses without a matching confirm and refuses prod without prod:true', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const plan = readyPlan(await snapshotPage(cm, snap0.page.id));
  await assert.rejects(applyPage({ cm, plan, runDir: tmp, applyId: 'g2', site }), /confirm/);
  await assert.rejects(applyPage({ cm, plan, runDir: tmp, applyId: 'g2', site, confirm: 'other' }), /confirm/);
  const prodCm = Object.assign(fakeCm({ items: itemsFromSnapshot(snap0), env: 'production' }), { isProd: true });
  await assert.rejects(applyPage({ cm: prodCm, plan, runDir: tmp, applyId: 'g3', site, confirm: 'production' }), /--prod/);
  const ro = Object.assign(fakeCm({ items: itemsFromSnapshot(snap0) }), { writable: false });
  await assert.rejects(applyPage({ cm: ro, plan, runDir: tmp, applyId: 'g4', site, confirm: 'fake' }), /read-only/);
});

// Finding 7: applyMany passes dataFolder, autoRollback, confirm and prod through.
test('applyMany passes options through to applyFn', async () => {
  let seen = null;
  await applyMany({ cm: { env: 'fake', isProd: false, writable: true }, plans: [{ key: 'k' }], runDir: tmp, applyId: 'm1', site, confirm: 'fake', dataFolder: 'Content', autoRollback: false, applyFn: async (a) => { seen = a; return { key: 'k', status: 'done' }; } });
  assert.equal(seen.dataFolder, 'Content');
  assert.equal(seen.autoRollback, false);
  assert.equal(seen.confirm, 'fake');
});

// Findings 5, 6, 9: publish requires scope and confirm, and a timed-out operation is a failure.
test('publishItems requires a scope function and confirm, and fails when polling runs out', async () => {
  const client = { env: 'dev', isProd: false, writable: true, async mutate() { return { publishItem: { operationId: 'op' } }; }, async query() { return { publishingStatus: { isDone: false, isFailed: false, state: 'Running' } }; } };
  const items = [{ id: 'a'.repeat(32), path: '/x' }];
  await assert.rejects(publishItems({ client, items, confirm: 'dev', sleep: async () => {} }), /scope/);
  await assert.rejects(publishItems({ client, items, scope: () => true, sleep: async () => {} }), /confirm/);
  await assert.rejects(publishItems({ client, items, scope: () => true, confirm: 'dev', maxPolls: 2, sleep: async () => {} }), /did not finish/);
});

// Finding 8: a credentials file inside any git repo is refused even when no repoRoots are passed.
test('resolveEnv refuses a credentials file inside a git working tree by default', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-git-'));
  fs.mkdirSync(path.join(repo, '.git'));
  fs.mkdirSync(path.join(repo, 'deep'));
  const f = path.join(repo, 'deep', 'dev.env');
  fs.writeFileSync(f, 'SITECORE_API_HOST=https://a.b\nSITECORE_CLIENT_ID=1\nSITECORE_CLIENT_SECRET=2\n');
  assert.throws(() => resolveEnv({ name: 'dev', project: 'demo', file: f }), (e) => e.code === 'inside-repo');
});
