import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diffCatalog, verifyComponent } from '../plugin/engine/lib/catalog/diff.mjs';
import { catalogCommand } from '../plugin/engine/lib/cli/catalog.mjs';
import { planPage } from '../plugin/engine/lib/plan/page-plan.mjs';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { catalog as base } from './_catalog.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));
const H = '/sitecore/content/DemoSite/Demo/Home';
const snap = { page: { id: 'p', name: 'x', path: `${H}/x`, templateId: '1'.repeat(32), templateName: 'General Landing Page', fields: { '__Final Renderings': { value: '' } }, children: [{ id: 'd', name: 'Data' }] }, data: { id: 'd', name: 'Data', fields: {}, children: [] } };
const rules = { dataFolder: 'Data', themes: { alternate: [], pinned: {} } };

test('diffCatalog marks added unverified, removed missing with a date, changed types kept old', () => {
  const next = clone(base);
  delete next.components.richText;
  next.components.quote = { ...clone(base.components.richText), name: 'Quote', renderingId: '7'.repeat(32) };
  next.components.hero.fields[0].type = 'Rich Text';
  const { catalog, summary } = diffCatalog(base, next, { now: '2026-10-19T00:00:00.000Z' });
  assert.deepEqual(summary.added, ['quote']); assert.deepEqual(summary.missing, ['richText']); assert.deepEqual(summary.changed, ['hero.title']);
  assert.equal(catalog.components.quote.status, 'unverified');
  assert.equal(catalog.components.richText.status, 'missing'); assert.equal(catalog.components.richText.missingSince, '2026-10-19T00:00:00.000Z');
  assert.equal(catalog.components.hero.status, 'changed');
  assert.equal(catalog.components.hero.fields[0].type, 'Single-Line Text'); assert.equal(catalog.components.hero.fields[0].changedTo, 'Rich Text');
  assert.equal(catalog.components.accordion.status, 'ok');
});
test('diffCatalog with no old catalog returns the new one with every component ok', () => {
  const { catalog, summary } = diffCatalog(null, clone(base));
  assert.equal(summary.unchanged, Object.keys(base.components).length);
  assert.ok(Object.values(catalog.components).every((c) => c.status === 'ok'));
});
test('verifyComponent flips unverified to ok, deletes missing everywhere, accepts changed types', () => {
  const next = clone(base); delete next.components.richText; next.components.hero.fields[0].type = 'Rich Text';
  let { catalog } = diffCatalog(base, next);
  catalog.pageTypes.generalLanding.layout = ['hero', 'richText'];
  ({ catalog } = verifyComponent(catalog, 'richText'));
  assert.ok(!catalog.components.richText); assert.deepEqual(catalog.pageTypes.generalLanding.layout, ['hero']);
  let r = verifyComponent(catalog, 'hero'); assert.equal(r.action, 'verified'); assert.equal(r.catalog.components.hero.fields[0].type, 'Rich Text'); assert.equal(r.catalog.components.hero.status, 'ok');
  assert.equal(verifyComponent(r.catalog, 'accordion').action, 'noop');
});
test('planner: unverified component is a pending note; missing component refuses', () => {
  const cat = clone(base); cat.components.richText.status = 'unverified'; cat.components.accordion.status = 'missing'; cat.components.accordion.missingSince = '2026-10-19';
  const a = planPage({ content: { pageId: 'x', pageType: 'generalLanding', target: { path: `${H}/x` }, pageFields: {}, components: [{ type: 'richText', fields: { text: 'hi' }, children: [] }], flags: [], sources: [] }, snap, catalog: cat, rules });
  assert.notEqual(a.status, 'needs-review'); assert.ok(a.pending.some((p) => p.category === 'unverified-component'), JSON.stringify(a.pending));
  const b = planPage({ content: { pageId: 'x', pageType: 'generalLanding', target: { path: `${H}/x` }, pageFields: {}, components: [{ type: 'accordion', fields: { title: 'hi' }, children: [] }], flags: [], sources: [] }, snap, catalog: cat, rules });
  assert.equal(b.status, 'needs-review'); assert.ok(b.reasons.some((r) => /accordion.*missing.*2026-10-19/.test(r)), JSON.stringify(b.reasons));
});
test('catalog refresh with no catalog behaves like build; show prints status; verify writes', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-cd-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  const built = clone(base);
  const deps = { projectDir, print: false, cmFactory: () => ({}), buildCatalogImpl: async () => clone(built) };
  const r1 = await catalogCommand(['refresh', '--env', 'fake'], deps);
  assert.equal(r1.summary.unchanged, 4);
  built.components.quote = { ...clone(base.components.richText), name: 'Quote', renderingId: '7'.repeat(32) };
  const r2 = await catalogCommand(['refresh', '--env', 'fake'], deps);
  assert.deepEqual(r2.summary.added, ['quote']);
  const shown = await catalogCommand(['show'], deps);
  assert.equal(shown.components.find((c) => c.key === 'quote').status, 'unverified');
  const v = await catalogCommand(['verify', 'quote'], deps);
  assert.equal(v.action, 'verified');
  assert.equal(JSON.parse(fs.readFileSync(path.join(projectDir, '.content-ops', 'catalog.json'), 'utf8')).components.quote.status, 'ok');
});
