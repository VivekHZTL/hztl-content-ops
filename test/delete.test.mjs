import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { planDelete, applyDelete, undoDelete } from '../plugin/engine/lib/apply/delete.mjs';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { scanCommand } from '../plugin/engine/lib/cli/scan.mjs';
import { refsCommand } from '../plugin/engine/lib/cli/refs.mjs';

const H = '/s/Home';
const T = 't'.repeat(32), T2 = 'u'.repeat(32), A = 'a'.repeat(32), B = 'b'.repeat(32), HOME = 'h'.repeat(32), ROOT = 'r'.repeat(32);
const items = () => ({
  [ROOT]: { id: ROOT, name: 's', path: '/s', templateId: 'x', templateName: 'Folder', parentId: '', version: 1, fields: {} },
  [HOME]: { id: HOME, name: 'Home', path: H, templateId: 'x', templateName: 'Folder', parentId: ROOT, version: 1, fields: {} },
  [T]: { id: T, name: 'old-page', path: `${H}/old-page`, templateId: 'x', templateName: 'Page', parentId: HOME, version: 1, fields: { '__Updated': { value: '1', std: false } } },
  [T2]: { id: T2, name: 'Data', path: `${H}/old-page/Data`, templateId: 'x', templateName: 'Folder', parentId: T, version: 1, fields: { ref: { value: `{${T.toUpperCase()}}`, std: false } } },
  [A]: { id: A, name: 'linked', path: `${H}/linked`, templateId: 'x', templateName: 'Page', parentId: HOME, version: 1, fields: {} },
  [B]: { id: B, name: 'referrer', path: `${H}/referrer`, templateId: 'x', templateName: 'Page', parentId: HOME, version: 1, fields: { link: { value: `<link id="{${A.toUpperCase()}}" />`, std: false } } },
});
const scanOf = (cm) => ({ env: 'fake', root: '/s', tree: Object.values(cm.db).map((x) => ({ id: x.id, name: x.name, path: x.path, parentId: x.parentId, templateId: x.templateId, templateName: x.templateName })), fields: Object.fromEntries(Object.values(cm.db).map((x) => [x.id, { version: 1, f: Object.fromEntries(Object.entries(x.fields).filter(([, v]) => !v.std && v.value).map(([k, v]) => [k, v.value])) }])) });

test('planDelete blocks externally referenced items, allows internal refs, refuses Home and outside paths', () => {
  const cm = fakeCm({ items: items() });
  const plan = planDelete({ scan: scanOf(cm), targets: [`${H}/old-page`, `${H}/linked`], homePath: H });
  assert.deepEqual(plan.deletable.map((d) => d.path), [`${H}/old-page`]);
  assert.equal(plan.deletable[0].subtree, 2);
  assert.equal(plan.blocked[0].path, `${H}/linked`); assert.equal(plan.blocked[0].externalRefs[0].from, `${H}/referrer`);
  assert.throws(() => planDelete({ scan: scanOf(cm), targets: [H], homePath: H }), /Home/);
  assert.throws(() => planDelete({ scan: scanOf(cm), targets: ['/s'], homePath: H }), /outside/);
});
test('applyDelete moves to the recycle bin with a journal, skips drifted items, and undo restores', async () => {
  const cm = fakeCm({ items: items(), env: 'fake' });
  const plan = planDelete({ scan: scanOf(cm), targets: [`${H}/old-page`], homePath: H });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-del-'));
  const jf = path.join(tmp, 'journal.json');
  await assert.rejects(applyDelete({ cm, plan, journalFile: jf }), /confirm/);
  const r = await applyDelete({ cm, plan, journalFile: jf, confirm: 'fake' });
  assert.equal(r.deleted.length, 1); assert.equal(await cm.getItem({ id: T }), null); assert.equal(await cm.getItem({ id: T2 }), null);
  const u = await undoDelete({ cm, journal: JSON.parse(fs.readFileSync(jf, 'utf8')), confirm: 'fake' });
  assert.equal(u.restored.length, 1); assert.ok(await cm.getItem({ id: T }));
  // drift: a child added after the plan → skipped
  const plan2 = planDelete({ scan: scanOf(cm), targets: [`${H}/old-page`], homePath: H });
  await cm.createItem({ parentId: T, name: 'new-child', templateId: 'x' });
  const r2 = await applyDelete({ cm, plan: plan2, journalFile: path.join(tmp, 'j2.json'), confirm: 'fake' });
  assert.equal(r2.skipped.length, 1); assert.match(r2.skipped[0].why, /changed/);
});
test('scan and refs commands write a scan file and report references by target', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-sc-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/s', homePath: H, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  const cm = fakeCm({ items: items(), env: 'fake' });
  const client = { async query(q, vars) {
    if (/path:\$p/.test(q)) { const it = Object.values(cm.db).find((x) => x.path === vars.p); return { item: it && { itemId: it.id, name: it.name, path: it.path, hasChildren: Object.values(cm.db).some((c) => c.parentId === it.id), template: { templateId: it.templateId, name: it.templateName } } }; }
    if (/children\(/.test(q)) return { item: { children: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: Object.values(cm.db).filter((c) => c.parentId === vars.id).map((c) => ({ itemId: c.id, name: c.name, path: c.path, hasChildren: Object.values(cm.db).some((x) => x.parentId === c.id), template: { templateId: c.templateId, name: c.templateName } })) } } };
    const out = {}; [...q.matchAll(/(i\d+): item\(where:\{itemId:"([^"]+)"/g)].forEach((m) => { const it = cm.db[m[2]]; out[m[1]] = { version: 1, fields: { nodes: Object.entries(it?.fields || {}).map(([k, v]) => ({ name: k, value: v.value, containsStandardValue: v.std })) } }; }); return out;
  } };
  const s = await scanCommand(['--env', 'fake', '--root', '/s'], { projectDir, cmFactory: () => ({ env: 'fake', client, ...cm }), print: false });
  assert.equal(s.items, 6); assert.ok(fs.existsSync(path.join(projectDir, s.file)));
  const r = await refsCommand(['--scan', s.file, '--targets', `${H}/linked`], { projectDir, print: false });
  assert.equal(r.targets[0].external.length, 1); assert.equal(r.targets[0].external[0].from, `${H}/referrer`);
});
