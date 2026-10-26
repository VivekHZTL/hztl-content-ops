// Tests added from the phase-B review. Each pins one finding.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeCm, itemsFromSnapshot } from '../plugin/engine/lib/cm/fake.mjs';
import { snapshotPage } from '../plugin/engine/lib/snapshot/page.mjs';
import { planPage } from '../plugin/engine/lib/plan/page-plan.mjs';
import { applyPage } from '../plugin/engine/lib/apply/page.mjs';
import { catalogToSite, validateCatalog } from '../plugin/engine/lib/catalog/schema.mjs';
import { buildCatalog } from '../plugin/engine/lib/catalog/build.mjs';
import { assertRunFresh } from '../plugin/engine/lib/plan/run.mjs';
import { DEFAULT_RULES, writeJson } from '../plugin/engine/lib/config/project.mjs';
import { planCommand } from '../plugin/engine/lib/cli/plan.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const snap0 = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/page-snapshot.json'), 'utf8'));
const xml = snap0.page.fields['__Final Renderings'].value;
const device = xml.match(/<d\s[^>]*id="([^"]+)"/)[1];
const rid = (ds) => xml.match(new RegExp(`s:ds="${ds}"[^>]*s:id="\\{([^}]+)\\}"`))[1].replace(/-/g, '').toLowerCase();
const heroRid = xml.match(/s:id="\{([^}]+)\}"/)[1].replace(/-/g, '').toLowerCase();
const ids = [...new Set([...xml.matchAll(/s:id="\{([^}]+)\}"/g)].map((m) => m[1].replace(/-/g, '').toLowerCase()))];
const sharedRid = xml.match(/s:ds="\{[^"]+\}"[^>]*s:id="\{([^}]+)\}"/)[1].replace(/-/g, '').toLowerCase();
const catalog = { v: 1, device, placeholders: { hero: xml.match(/s:ph="([^"]*hero[^"]*)"/)[1], main: xml.match(/s:ph="([^"]*main-content[^"]*)"/)[1] }, pageTypes: { singleLocationPageTemplate: { name: 'Single Location Page Template', templateId: snap0.page.templateId, fields: [{ name: 'pageTitle', type: 'Single-Line Text' }] }, other: { name: 'Other', templateId: '9'.repeat(32), fields: [] } }, components: {} };
for (const id of ids) catalog.components[`c_${id.slice(0, 6)}`] = { name: `Component ${id.slice(0, 6)}`, renderingId: id, ph: id === heroRid ? 'hero' : 'main', themed: false, params: '', fields: [{ name: 'title', type: 'Single-Line Text' }], children: [], parent: null, childPh: null, dsTemplateId: 'c'.repeat(32) };
const fsbsKey = `c_${rid('local:/Data/Feature Side by Side').slice(0, 6)}`;
catalog.components[fsbsKey] = { ...catalog.components[fsbsKey], name: 'Feature Side by Side', themed: true, params: 'selectTheme', fields: [{ name: 'heading', type: 'Single-Line Text' }, { name: 'description', type: 'Rich Text' }] };
const sharedKey = `c_${sharedRid.slice(0, 6)}`;
const articlesKey = `c_${rid('local:/Data/Related Articles').slice(0, 6)}`;
catalog.components.accordion = { name: 'Accordion', renderingId: '1'.repeat(32), ph: 'main', themed: true, params: 'selectTheme', fields: [{ name: 'title', type: 'Single-Line Text' }], children: ['accordionItem'], parent: null, childPh: 'accordion', dsTemplateId: 'a'.repeat(32) };
catalog.components.accordionItem = { name: 'Accordion Item', renderingId: '2'.repeat(32), ph: 'accordion', themed: false, params: '', fields: [{ name: 'heading', type: 'Single-Line Text' }], children: [], parent: 'accordion', childPh: null, dsTemplateId: 'b'.repeat(32) };
const site = catalogToSite(catalog);
const rules = DEFAULT_RULES;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-rb-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const content = (components, extra = {}) => ({ pageId: '1.1', pageType: 'singleLocationPageTemplate', target: { path: snap0.page.path, mode: 'update' }, components, flags: [], sources: [], ...extra });
const cycle = async (cm, c, applyId) => { const plan = planPage({ content: c, snap: await snapshotPage(cm, snap0.page.id), catalog, rules, key: 'k' }); if (plan.status === 'ready') { const r = await applyPage({ cm, plan, runDir: tmp, applyId, site, confirm: 'fake' }); assert.equal(r.status, 'done', r.error + ' ' + JSON.stringify(r.verify)); } return plan; };

test('C1: a missing local datasource is repaired in place and the page is idempotent', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const data = (await cm.getItem({ id: snap0.page.id })).children.find((c) => c.name === 'Data');
  const ra = (await cm.getItem({ id: data.id })).children.find((c) => c.name === 'Related Articles');
  await cm.deleteItem({ id: ra.id });
  const c = content([{ type: articlesKey, fields: { title: 'More' } }]);
  const p1 = await cycle(cm, c, 'c1a');
  assert.equal(p1.ops.creates.length, 1);
  assert.equal(p1.layout.after.length, xml.match(/<r /g).length - 1, 'no extra rendering: the broken entry is reused');
  const p2 = await cycle(cm, c, 'c1b');
  assert.equal(p2.status, 'up-to-date', JSON.stringify(p2.ops));
});
test('C1: a shared datasource is never edited and makes the page needs-review', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const p = planPage({ content: content([{ type: sharedKey, fields: { title: 'x' } }]), snap: await snapshotPage(cm, snap0.page.id), catalog, rules, key: 'k' });
  assert.equal(p.status, 'needs-review');
  assert.ok(p.reasons.some((r) => /shared/i.test(r)));
});
test('I1: new children go after bound children and are numbered after them', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  await cycle(cm, content([{ type: 'accordion', fields: { title: 'T' }, children: [{ type: 'accordionItem', fields: { heading: 'H1' } }] }]), 'i1a');
  const p = await cycle(cm, content([{ type: 'accordion', fields: { title: 'T' }, children: [{ type: 'accordionItem', fields: { heading: 'H1' } }, { type: 'accordionItem', fields: { heading: 'H2' } }] }]), 'i1b');
  assert.deepEqual(p.ops.creates.map((c) => c.name), ['Accordion Item 2']);
  const names = p.layout.after;
  const acc = names.indexOf('Accordion');
  assert.deepEqual(names.slice(acc, acc + 3), ['Accordion', 'Accordion Item', 'Accordion Item']);
  const p3 = await cycle(cm, content([{ type: 'accordion', fields: { title: 'T' }, children: [{ type: 'accordionItem', fields: { heading: 'H1' } }, { type: 'accordionItem', fields: { heading: 'H2' } }] }]), 'i1c');
  assert.equal(p3.status, 'up-to-date');
});
test('I2: a new first component lands before the bound ones, after the hero', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const p = planPage({ content: content([{ type: 'accordion', fields: { title: 'T' } }, { type: fsbsKey, fields: { heading: 'B' } }]), snap: await snapshotPage(cm, snap0.page.id), catalog, rules, key: 'k' });
  const a = p.layout.after.indexOf('Accordion'), f = p.layout.after.indexOf('Feature Side by Side');
  assert.ok(a > 0 && a < f, p.layout.after.join(','));
});
test('I3: a child-only type at top level, or a child under the wrong parent, is needs-review', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const s = await snapshotPage(cm, snap0.page.id);
  assert.equal(planPage({ content: content([{ type: 'accordionItem', fields: {} }]), snap: s, catalog, rules, key: 'k' }).status, 'needs-review');
  assert.equal(planPage({ content: content([{ type: fsbsKey, fields: {}, children: [{ type: 'accordionItem', fields: {} }] }]), snap: s, catalog, rules, key: 'k' }).status, 'needs-review');
});
test('I4: pageFields are planned against the page item; seo without a mapping is pending', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const p = planPage({ content: content([], { pageFields: { pageTitle: 'New title' }, seo: { title: 'x' } }), snap: await snapshotPage(cm, snap0.page.id), catalog, rules, key: 'k' });
  assert.equal(p.status, 'ready');
  assert.ok(p.ops.updates.some((u) => u.ref === 'page' && u.field === 'pageTitle' && u.to === 'New title'));
  assert.ok(p.pending.some((x) => /seo/i.test(x.text)));
});
test('I5: an unregistered source refuses apply', () => {
  const run = { createdAt: new Date().toISOString(), sources: [{ file: 'sources/x.txt', sha256: null }] };
  assert.throws(() => assertRunFresh(run, { maxAgeHours: 12, sources: [] }), /not registered/);
});
test('I6/I7: catalog builder links a parent that comes after its child and flags mixed placement', async () => {
  const H = (c) => c.repeat(32);
  const g = (h) => `{${h.toUpperCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')}}`;
  const item = (id, name, p, templateName, parentId, fields = {}, templateId = H('f')) => ({ id, name, path: p, templateId, templateName, parentId, version: 1, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, std: false }])) });
  const lay = `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="{DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD}">` +
    `<r uid="{3}" s:ds="local:/Data/Accordion/Item 1" s:id="${g(H('c'))}" s:par="DynamicPlaceholderId=4" s:ph="/hm/main-x-0/accordion-3" />` +
    `<r uid="{2}" s:ds="local:/Data/Accordion" s:id="${g(H('b'))}" s:par="DynamicPlaceholderId=3" s:ph="/hm/main-x-0" />` +
    `<r uid="{4}" s:ds="local:/Data/Item top" s:id="${g(H('c'))}" s:par="DynamicPlaceholderId=5" s:ph="/hm/main-x-0" />` +
    `</d></r>`;
  const items = {};
  for (const it of [item('root', '_bp', '/s/_bp', 'Folder', ''), item('pg', 'P', '/s/_bp/P', 'P Page', 'root', { '__Final Renderings': lay }, H('1')),
    item(H('b'), 'Accordion', '/r/Accordion', 'Json Rendering', 'r'), item(H('c'), 'Accordion Item', '/r/Accordion Item', 'Json Rendering', 'r'), item(H('1'), 'P Page', '/t/P Page', 'Template', 't')]) items[it.id] = it;
  const cat = await buildCatalog({ cm: fakeCm({ items }), blueprintRoot: '/s/_bp' });
  assert.equal(cat.components.accordionItem.parent, 'accordion');
  assert.deepEqual(cat.components.accordion.children, ['accordionItem']);
  assert.ok((cat.warnings || []).some((w) => /accordionItem/.test(w) && /both/i.test(w)));
  assert.ok(validateCatalog(cat).some((e) => /accordionItem/.test(e)));
});
test('I8: page type mismatch, unsupported mode, and duplicate pageIds are refused', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const s = await snapshotPage(cm, snap0.page.id);
  assert.equal(planPage({ content: content([], { pageType: 'other' }), snap: s, catalog, rules, key: 'k' }).status, 'needs-review');
  assert.equal(planPage({ content: content([], { target: { path: snap0.page.path, mode: 'create' } }), snap: s, catalog, rules, key: 'k' }).status, 'needs-review');
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-dup-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: '/sitecore/content/DemoSite/Demo/Home', environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), catalog);
  writeJson(path.join(projectDir, 'work', 'a.json'), content([]));
  writeJson(path.join(projectDir, 'work', 'b.json'), content([]));
  const out = await planCommand(['--env', 'fake', '--content', path.join(projectDir, 'work')], { projectDir, cmFactory: () => cm, print: false });
  assert.equal(out.counts['needs-review'], 2);
});
test('I9 / Review Focus 4: same text with different markup or href is an update; whitespace is not', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const data = (await cm.getItem({ id: snap0.page.id })).children.find((c) => c.name === 'Data');
  const fsbs = (await cm.getItem({ id: data.id })).children.find((c) => c.name === 'Feature Side by Side');
  await cm.updateItem({ id: fsbs.id, fields: [{ name: 'description', value: '<p>See <a href="/care">care</a></p>' }] });
  const s = await snapshotPage(cm, snap0.page.id);
  const plan = (d) => planPage({ content: content([{ type: fsbsKey, fields: { description: d } }]), snap: s, catalog, rules, key: 'k' });
  assert.equal(plan('<p>See  <a href="/care">care</a></p>\n').status, 'up-to-date');
  assert.equal(plan('<p>See <a href="/other">care</a></p>').status, 'ready');
  assert.equal(plan('<p>See <a href="/care"><strong>care</strong></a></p>').status, 'ready');
});
