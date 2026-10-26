import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { intakeCommand } from '../plugin/engine/lib/cli/intake.mjs';
import { loadAdapters, checkAdapterSource } from '../plugin/engine/lib/knowledge/adapters.mjs';
import { ensureKnowledge } from '../plugin/engine/lib/knowledge/store.mjs';
import { planPage } from '../plugin/engine/lib/plan/page-plan.mjs';
import { FLAG_KINDS } from '../plugin/engine/lib/content/schema.mjs';
import { catalog } from './_catalog.mjs';

const H = '/sitecore/content/DemoSite/Demo/Home';
const GOOD = `export const name = 'pipe';
export const matches = (file) => file.endsWith('.pipe');
export async function read(file, { catalog }) {
  const fs = await import('node:fs');
  const lines = fs.readFileSync(file, 'utf8').trim().split('\\n');
  return { pages: lines.map((l) => { const [slug, title] = l.split('|'); return { pageId: slug, pageType: 'generalLanding', target: { path: '${H}/' + slug, mode: 'update' }, pageFields: {}, components: [{ type: 'hero', fields: { title }, children: [] }], flags: [], sources: [], locators: {} }; }) };
}`;
async function project(adapterSrc) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-ka-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), catalog);
  const k = ensureKnowledge(projectDir);
  if (adapterSrc) fs.writeFileSync(path.join(k, 'adapters', 'pipe.mjs'), adapterSrc);
  fs.writeFileSync(path.join(projectDir, 'sources', 'a.pipe'), 'north|North Clinic\nsouth|South Clinic\n');
  return projectDir;
}

test('checkAdapterSource allows node: imports and refuses bare or relative ones', () => {
  assert.deepEqual(checkAdapterSource("import fs from 'node:fs'; const z = await import('node:zlib');"), []);
  assert.ok(checkAdapterSource("import x from 'xlsx';").length);
  assert.ok(checkAdapterSource("const x = require('lodash');").length);
  assert.ok(checkAdapterSource("import y from '../../lib/secret.mjs';").length);
});
test('FLAG_KINDS has new-adapter and the planner refuses pages carrying it', () => {
  assert.ok(FLAG_KINDS.includes('new-adapter'));
  const snap = { page: { id: 'p', name: 'x', path: `${H}/x`, templateId: '1'.repeat(32), templateName: 'General Landing Page', fields: { '__Final Renderings': { value: '' } }, children: [{ id: 'd', name: 'Data' }] }, data: { id: 'd', name: 'Data', fields: {}, children: [] } };
  const plan = planPage({ content: { pageId: 'x', pageType: 'generalLanding', target: { path: `${H}/x` }, pageFields: {}, components: [], flags: [{ kind: 'new-adapter', where: 'sources/a.pipe', text: 'Read by project adapter pipe' }], sources: [] }, snap, catalog, rules: { dataFolder: 'Data', themes: { alternate: [], pinned: {} } } });
  assert.equal(plan.status, 'needs-review');
  assert.ok(plan.reasons.some((r) => /new-adapter/.test(r)));
});
test('intake runs a project adapter for an unknown extension and flags every page', async () => {
  const projectDir = await project(GOOD);
  const out = await intakeCommand(['--parent-path', H, '--page-type', 'generalLanding'], { projectDir, print: false });
  assert.equal(out.pages, 2, JSON.stringify(out.errors));
  assert.deepEqual(out.adapters, [{ file: 'sources/a.pipe', adapter: 'pipe' }]);
  const north = JSON.parse(fs.readFileSync(path.join(projectDir, 'work', 'north.json'), 'utf8'));
  assert.ok(north.flags.some((f) => f.kind === 'new-adapter'));
  assert.equal(north.sources[0].file, 'sources/a.pipe');
  assert.ok(out.questions.some((q) => q.owner === 'dev' && /adapter/.test(q.text)));
});
test('without an adapter the file is still an error; a throwing adapter names itself and other files proceed', async () => {
  const none = await project(null);
  const out = await intakeCommand(['--parent-path', H], { projectDir: none, print: false });
  assert.ok(out.errors.some((e) => /no adapter/.test(e)));
  const bad = await project(GOOD.replace('return { pages', "throw new Error('boom'); return { pages"));
  fs.writeFileSync(path.join(bad, 'sources', 'b.tsv'), 'a\tb\n1\t2\n');
  const out2 = await intakeCommand(['--parent-path', H], { projectDir: bad, print: false });
  assert.ok(out2.errors.some((e) => /adapter pipe.*boom/.test(e)), JSON.stringify(out2.errors));
  assert.equal(out2.lists.length, 1, 'the tsv still loaded');
});
test('an adapter with a forbidden import is refused with its file name and never runs', async () => {
  const projectDir = await project("import x from 'xlsx';\n" + GOOD);
  const { adapters, errors } = await loadAdapters(projectDir);
  assert.equal(adapters.length, 0);
  assert.match(errors[0], /pipe\.mjs/);
  const out = await intakeCommand(['--parent-path', H], { projectDir, print: false });
  assert.ok(out.errors.some((e) => /pipe\.mjs/.test(e)));
});
