import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { opCommand } from '../plugin/engine/lib/cli/op.mjs';
import { applyCommand } from '../plugin/engine/lib/cli/apply.mjs';
import { verifyCommand } from '../plugin/engine/lib/cli/verify.mjs';
import { undoCommand } from '../plugin/engine/lib/cli/undo.mjs';
import { publishCommand } from '../plugin/engine/lib/cli/publish.mjs';
import { showCommand } from '../plugin/engine/lib/cli/show.mjs';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { catalogToSite } from '../plugin/engine/lib/catalog/schema.mjs';
import { buildLayout, newEntry, parseLayout, placeholderFor } from '../plugin/engine/lib/layout/layout.mjs';
import { catalog } from './_catalog.mjs';

const T = '1'.repeat(32);
const site = catalogToSite(catalog);
const layoutOf = (list) => buildLayout(list.map(([key, ds], i) => newEntry({ key, ds, ph: placeholderFor(key, null, site), dynId: i + 1 }, site)), site);
const items = () => Object.fromEntries([
  { id: 'r0', name: 'Demo', path: '/sitecore/content/D/Demo', parentId: null, templateId: T, templateName: 'Site', fields: {} },
  { id: 'd0', name: 'Data', path: '/sitecore/content/D/Demo/Data', parentId: 'r0', templateId: T, templateName: 'Folder', fields: {} },
  { id: 'dp', name: 'Departments', path: '/sitecore/content/D/Demo/Data/Departments', parentId: 'd0', templateId: T, templateName: 'Folder', fields: {} },
  { id: 'c1', name: 'Cardiology', path: '/sitecore/content/D/Demo/Data/Departments/Cardiology', parentId: 'dp', templateId: T, templateName: 'Department', fields: { Phone: { value: '612-555-0100', std: false } } },
  { id: 'c2', name: 'Oncology', path: '/sitecore/content/D/Demo/Data/Departments/Oncology', parentId: 'dp', templateId: T, templateName: 'Department', fields: { Phone: { value: '+1 612-555-0200', std: false } } },
  { id: 'c3', name: 'Notes', path: '/sitecore/content/D/Demo/Data/Departments/Notes', parentId: 'dp', templateId: T, templateName: 'Folder', fields: { Phone: { value: '1', std: false } } },
  { id: 'sh', name: 'Shared', path: '/sitecore/content/D/Demo/Data/Shared', parentId: 'd0', templateId: T, templateName: 'Folder', fields: {} },
  { id: 'h0', name: 'Home', path: '/sitecore/content/D/Demo/Home', parentId: 'r0', templateId: T, templateName: 'Home', fields: {} },
  { id: 'pa', name: 'a', path: '/sitecore/content/D/Demo/Home/a', parentId: 'h0', templateId: T, templateName: 'Article', fields: { '__Final Renderings': { value: layoutOf([['hero', 'local:/Data/Hero'], ['richText', 'local:/Data/Text']]), std: false } } },
  { id: 'pb', name: 'b', path: '/sitecore/content/D/Demo/Home/b', parentId: 'h0', templateId: T, templateName: 'Article', fields: { '__Final Renderings': { value: layoutOf([['hero', 'local:/Data/Hero']]), std: false } } },
].map((x) => [x.id, x]));

async function project() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-ops-'));
  execFileSync('git', ['init', '-q'], { cwd: projectDir });
  writeJson(path.join(projectDir, 'answers.json'), { name: 'demo', siteRoot: '/sitecore/content/D/Demo', homePath: '/sitecore/content/D/Demo/Home', environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), catalog);
  const cm = fakeCm({ items: items() });
  const calls = [];
  cm.client = { env: 'fake', isProd: false, writable: true, async query() { return { publishingStatus: { isDone: true, isFailed: false, state: 'Complete', processed: 1 } }; }, async mutate(q, v) { calls.push(v); return { publishItem: { operationId: 'op1' } }; } };
  return { projectDir, cm, calls, deps: { projectDir, print: false, cmFactory: () => cm } };
}

test('op list shows the built-in operations; op new scaffolds a project operation that plans to nothing', async () => {
  const { deps, projectDir } = await project();
  const names = (await opCommand(['list'], deps)).operations.map((o) => o.name);
  assert.ok(names.includes('set-field') && names.includes('attach-shared'), names.join(','));
  const made = await opCommand(['new', 'my-fix', '--description', 'Fix a thing', '--when', 'When the thing breaks'], deps);
  assert.deepEqual(made.files, ['operation.json', 'build.mjs', 'README.md']);
  assert.ok(fs.existsSync(path.join(projectDir, '.content-ops', 'operations', 'my-fix', 'build.mjs')));
  await assert.rejects(opCommand(['new', 'my-fix', '--description', 'x'], deps), /already exists/);
  const planned = await opCommand(['plan', 'my-fix', '--env', 'fake'], deps);
  assert.deepEqual(planned.counts, {});
  assert.equal((await opCommand(['list'], deps)).operations.find((o) => o.name === 'my-fix').source, 'project');
});

test('an operation that tries to write is stopped; only change sets come back', async () => {
  const { deps, projectDir } = await project();
  const dir = path.join(projectDir, '.content-ops', 'operations', 'sneaky'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'build.mjs'), "export default async function build({ cm }) { await cm.updateItem({ id: 'c1', fields: [] }); return { changeSets: [] }; }\n");
  await assert.rejects(opCommand(['plan', 'sneaky', '--env', 'fake'], deps), /Operations never write/);
  fs.writeFileSync(path.join(dir, 'build.mjs'), "export default async function build() { return { changeSets: [{ key: 'a', ops: [] }, { key: 'a', ops: [] }] }; }\n");
  await assert.rejects(opCommand(['plan', 'sneaky', '--env', 'fake'], deps), /duplicate change set key/);
});

test('set-field on records under Data, outside Home: plan, apply, verify, publish from the site root, undo', async () => {
  const { deps, cm, calls } = await project();
  const args = JSON.stringify({ root: '/sitecore/content/D/Demo/Data/Departments', template: 'Department', field: 'Phone', replace: { pattern: '^(?!\\+1)', with: '+1 ' } });
  const p = await opCommand(['plan', 'set-field', '--env', 'fake', '--args', args], deps);
  assert.deepEqual(p.counts, { ready: 1 });
  assert.match(p.notes.join(' '), /1 already right/);
  const shown = await showCommand(['--run', p.runId], deps);
  assert.match(shown.pages[0].changes[0], /Phone on \/sitecore\/content\/D\/Demo\/Data\/Departments\/Cardiology: "612-555-0100" → "\+1 612-555-0100"/);
  const a = await applyCommand(['--run', p.runId, '--confirm', 'fake'], deps);
  assert.deepEqual(a.counts, { done: 1 });
  assert.equal((await cm.getItem({ id: 'c1' })).fields.Phone.value, '+1 612-555-0100');
  assert.equal((await verifyCommand(['--run', p.runId], deps)).upToDate, 1);
  const dry = await publishCommand(['--run', p.runId, '--confirm', 'fake', '--dry'], deps);
  assert.deepEqual(dry.roots.map((r) => r.path), ['/sitecore/content/D/Demo/Data/Departments/Cardiology']);
  await publishCommand(['--run', p.runId, '--confirm', 'fake'], deps);
  assert.ok(calls.length >= 1);
  const u = await undoCommand(['--run', p.runId, '--apply', a.applyId, '--page', '/sitecore/content/D/Demo/Data/Departments/Cardiology', '--confirm', 'fake'], deps);
  assert.equal(u.restored, true);
  assert.equal((await cm.getItem({ id: 'c1' })).fields.Phone.value, '612-555-0100');
  const again = await opCommand(['plan', 'set-field', '--env', 'fake', '--args', args], deps);
  assert.deepEqual(again.counts, { ready: 1 });
});

test('attach-shared creates the shared item first, then repoints local copies and inserts where missing', async () => {
  const { deps, cm } = await project();
  const args = JSON.stringify({ pages: ['/sitecore/content/D/Demo/Home/a', '/sitecore/content/D/Demo/Home/b'], component: 'richText', after: 'hero', shared: { parent: '/sitecore/content/D/Demo/Data/Shared', name: 'Glance', templateId: T, fields: { text: '<p>At a glance</p>' } } });
  const first = await opCommand(['plan', 'attach-shared', '--env', 'fake', '--args', args], deps);
  assert.deepEqual(first.counts, { ready: 1 }); assert.match(first.notes.join(' '), /only creates it/);
  assert.deepEqual((await applyCommand(['--run', first.runId, '--confirm', 'fake'], deps)).counts, { done: 1 });
  const glance = await cm.getItem({ path: '/sitecore/content/D/Demo/Data/Shared/Glance' });
  assert.equal(glance.fields.text.value, '<p>At a glance</p>');
  const second = await opCommand(['plan', 'attach-shared', '--env', 'fake', '--args', args], deps);
  assert.deepEqual(second.counts, { ready: 2 });
  assert.deepEqual((await applyCommand(['--run', second.runId, '--confirm', 'fake'], deps)).counts, { done: 2 });
  for (const id of ['pa', 'pb']) {
    const { entries } = parseLayout((await cm.getItem({ id })).fields['__Final Renderings'].value, site);
    assert.deepEqual(entries.map((e) => e.key), ['hero', 'richText'], id);
    assert.equal(entries[1].ds.replace(/[{}-]/g, '').toLowerCase(), glance.id.toLowerCase(), id);
  }
  assert.equal((await verifyCommand(['--run', second.runId], deps)).upToDate, 2);
  assert.deepEqual((await opCommand(['plan', 'attach-shared', '--env', 'fake', '--args', args], deps)).counts, {});
});

test('walking a root reads at most `limit` items from Sitecore', async () => {
  const { deps, cm } = await project();
  let reads = 0; const get = cm.getItem; cm.getItem = async (q) => { reads++; return get(q); };
  const p = await opCommand(['plan', 'set-field', '--env', 'fake', '--args', JSON.stringify({ root: '/sitecore/content/D/Demo', limit: 3, field: 'Phone', value: 'x' })], deps);
  assert.match(p.notes.join(' '), /Stopped after 3 items/);
  assert.ok(reads <= 3 + 10, `read ${reads} items for limit 3`); // + planner reads of the matched items
});

test('reports for change-set runs show every step, field before/after, component order, and the saved re-check', async () => {
  const { deps, projectDir } = await project();
  const { reportCommand } = await import('../plugin/engine/lib/cli/report.mjs');
  const args = JSON.stringify({ root: '/sitecore/content/D/Demo/Data/Departments', template: 'Department', field: 'Phone', replace: { pattern: '^(?!\\+1)', with: '+1 ' } });
  const p = await opCommand(['plan', 'set-field', '--env', 'fake', '--args', args], deps);
  const a = await applyCommand(['--run', p.runId, '--confirm', 'fake'], deps);
  await verifyCommand(['--run', p.runId], deps);
  const r = await reportCommand(['--run', p.runId], deps);
  const dry = fs.readFileSync(path.join(projectDir, r.files[0]), 'utf8');
  const run = fs.readFileSync(path.join(projectDir, r.files[1]), 'utf8');
  for (const html of [dry, run]) { assert.match(html, /Phone on \/sitecore\/content\/D\/Demo\/Data\/Departments\/Cardiology/); assert.match(html, /612-555-0100/); assert.match(html, /"kind":"items"/); }
  assert.match(run, /"recheck":\{[^}]*"upToDate":1/);
  assert.ok(fs.existsSync(path.join(projectDir, 'runs', p.runId, `verify-${a.applyId}.json`)));
  // attach-shared records component order before and after
  const args2 = JSON.stringify({ pages: ['/sitecore/content/D/Demo/Home/b'], component: 'richText', after: 'hero', shared: { path: '/sitecore/content/D/Demo/Data/Shared' } });
  const p2 = await opCommand(['plan', 'attach-shared', '--env', 'fake', '--args', args2], deps);
  const r2 = await reportCommand(['--run', p2.runId], deps);
  const dry2 = fs.readFileSync(path.join(projectDir, r2.files[0]), 'utf8');
  assert.match(dry2, /"before":\["Hero"\],"after":\["Hero","Rich Text"\]/);
});
