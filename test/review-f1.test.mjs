// Fixes from the F1 whole-branch review. Each test failed before its fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJson, loadProject } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { templateCommand } from '../plugin/engine/lib/cli/template.mjs';
import { intakeCommand } from '../plugin/engine/lib/cli/intake.mjs';
import { ensureKnowledge } from '../plugin/engine/lib/knowledge/store.mjs';
import { diffCatalog, verifyComponent } from '../plugin/engine/lib/catalog/diff.mjs';
import { planPage } from '../plugin/engine/lib/plan/page-plan.mjs';
import { catalog as base } from './_catalog.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));
const H = '/sitecore/content/DemoSite/Demo/Home';
const cat = clone(base); cat.pageTypes.generalLanding.layout = ['hero', 'accordion', 'richText'];
async function project(c = cat) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-rf1-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), c);
  return projectDir;
}
const snap = { page: { id: 'p', name: 'x', path: `${H}/x`, templateId: '1'.repeat(32), templateName: 'General Landing Page', fields: { '__Final Renderings': { value: '' } }, children: [{ id: 'd', name: 'Data' }] }, data: { id: 'd', name: 'Data', fields: {}, children: [] } };
const rules = { dataFolder: 'Data', themes: { alternate: [], pinned: {} }, placeholders: [], newTab: { external: true, internal: false, files: true } };

test('R1: template refuses to overwrite an existing file unless --force', async () => {
  const projectDir = await project();
  const out = await templateCommand(['--page-type', 'generalLanding'], { projectDir, print: false });
  fs.writeFileSync(out.file, 'client filled this');
  await assert.rejects(templateCommand(['--page-type', 'generalLanding'], { projectDir, print: false }), /exists.*--force|--force.*exists/);
  assert.equal(fs.readFileSync(out.file, 'utf8'), 'client filled this');
  await templateCommand(['--page-type', 'generalLanding', '--force'], { projectDir, print: false });
  assert.notEqual(fs.readFileSync(out.file, 'utf8'), 'client filled this');
});
test('R2: an adapter page with invalid shape is an error naming the adapter; other pages and files still load', async () => {
  const projectDir = await project();
  const k = ensureKnowledge(projectDir);
  fs.writeFileSync(path.join(k, 'adapters', 'bad.mjs'), `export const name = 'bad'; export const matches = (f) => f.endsWith('.bad');
export async function read() { return { pages: [ { pageId: 'ok', pageType: 'generalLanding', target: { path: '${H}/ok' }, pageFields: {}, components: [], flags: [], sources: [], locators: {} }, { pageType: 'generalLanding', target: { path: '${H}/x' }, components: 'nope' } ] }; }`);
  fs.writeFileSync(path.join(projectDir, 'sources', 'a.bad'), 'x');
  fs.writeFileSync(path.join(projectDir, 'sources', 'b.tsv'), 'a\tb\n1\t2\n');
  const out = await intakeCommand(['--parent-path', H], { projectDir, print: false });
  assert.equal(out.pages, 1, JSON.stringify(out));
  assert.ok(out.errors.some((e) => /adapter bad.*invalid/.test(e)), JSON.stringify(out.errors));
  assert.equal(out.lists.length, 1);
  assert.ok(!fs.existsSync(path.join(projectDir, 'work', 'undefined.json')));
});
test('R3: a changed field type is held as pending, never written with the stale type', () => {
  const c = clone(cat); c.components.hero.status = 'changed'; c.components.hero.fields[0].changedTo = 'General Link';
  const plan = planPage({ content: { pageId: 'x', pageType: 'generalLanding', target: { path: `${H}/x` }, pageFields: {}, components: [{ type: 'hero', fields: { title: 'Hello', tagline: 'Hi' }, children: [] }], flags: [], sources: [] }, snap, catalog: c, rules });
  assert.notEqual(plan.status, 'needs-review');
  const updates = plan.ops?.updates || [];
  assert.ok(!updates.some((u) => u.field === 'title'), JSON.stringify(updates));
  assert.ok(updates.some((u) => u.field === 'tagline'));
  assert.ok(plan.pending.some((p) => p.category === 'unverified-component' && /title/.test(p.text)));
});
test('R4: diffCatalog tracks added and removed fields; verify clears them', () => {
  const next = clone(base);
  next.components.hero.fields = next.components.hero.fields.filter((f) => f.name !== 'title').concat([{ name: 'eyebrow', type: 'Single-Line Text' }]);
  const { catalog, summary } = diffCatalog(base, next, { now: '2026-10-20T00:00:00.000Z' });
  const hero = catalog.components.hero;
  assert.equal(hero.status, 'changed');
  assert.ok(summary.changed.includes('hero.title') && summary.changed.includes('hero.eyebrow'));
  const title = hero.fields.find((f) => f.name === 'title'); const eyebrow = hero.fields.find((f) => f.name === 'eyebrow');
  assert.equal(title.status, 'missing'); assert.equal(title.missingSince, '2026-10-20T00:00:00.000Z');
  assert.equal(eyebrow.status, 'unverified');
  const v = verifyComponent(catalog, 'hero');
  assert.equal(v.action, 'verified');
  assert.ok(!v.catalog.components.hero.fields.some((f) => f.name === 'title'));
  assert.ok(v.catalog.components.hero.fields.every((f) => !f.status));
});
test('R4b: a missing field is held as pending by the planner, an unverified field is written', () => {
  const c = clone(cat); c.components.hero.status = 'changed'; c.components.hero.fields[0].status = 'missing'; c.components.hero.fields[0].missingSince = '2026-10-20'; c.components.hero.fields[1].status = 'unverified';
  const plan = planPage({ content: { pageId: 'x', pageType: 'generalLanding', target: { path: `${H}/x` }, pageFields: {}, components: [{ type: 'hero', fields: { title: 'Hello', tagline: 'Hi' }, children: [] }], flags: [], sources: [] }, snap, catalog: c, rules });
  const updates = plan.ops?.updates || [];
  assert.ok(!updates.some((u) => u.field === 'title')); assert.ok(updates.some((u) => u.field === 'tagline'));
  assert.ok(plan.pending.some((p) => /title.*missing/.test(p.text)));
});
test('R5: a csv template maps itself whatever the client names the file', async () => {
  const projectDir = await project();
  const out = await templateCommand(['--page-type', 'generalLanding', '--format', 'csv', '--out', 'sources/t.csv'], { projectDir, print: false });
  const lines = fs.readFileSync(out.file, 'utf8').split('\r\n');
  const headers = lines[1].split(',');
  fs.rmSync(out.file);
  fs.writeFileSync(path.join(projectDir, 'sources', 'Locations-OCT.CSV'), [lines[0], lines[1], headers.map((h) => (h === 'Slug' ? 'south' : h === 'title' ? 'Hello' : '')).join(',')].join('\r\n') + '\r\n');
  const intake = await intakeCommand(['--parent-path', H, '--page-type', 'generalLanding'], { projectDir, print: false });
  assert.equal(intake.pages, 1, JSON.stringify(intake.errors));
  assert.equal(intake.mappings[0].reused, true);
});
test('R6: a knowledge/rules.json entry without { value } is refused with the key named', async () => {
  const projectDir = await project();
  writeJson(path.join(projectDir, '.content-ops', 'knowledge', 'rules.json'), { placeholders: ['COPY TK'] });
  assert.throws(() => loadProject(projectDir), /placeholders.*value/);
});
