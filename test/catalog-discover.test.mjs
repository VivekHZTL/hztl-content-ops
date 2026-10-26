// Blueprints are optional: without a blueprint folder, catalog build discovers one representative page per
// template from the site itself (the page using the most distinct components) and builds from those.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { buildCatalog } from '../plugin/engine/lib/catalog/build.mjs';
import { pickRepresentativePages } from '../plugin/engine/lib/catalog/discover.mjs';
import { catalogCommand } from '../plugin/engine/lib/cli/catalog.mjs';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';

const H = (c) => c.repeat(32);
const G = (c) => `{${H(c).toUpperCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')}}`;
const DEV = '{DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD}';
const r = (uid, ds, id, par, ph) => `<r uid="{${uid}}" s:ds="${ds}" s:id="${id}" s:par="${par}" s:ph="${ph}" />`;
const wrap = (inner) => `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="${DEV}">${inner}</d></r>`;
const one = wrap(r('11111111-1111-1111-1111-111111111111', 'local:/Data/Hero', G('a'), 'DynamicPlaceholderId=1', '/hm/hero-0'));
const three = wrap(r('11111111-1111-1111-1111-111111111111', 'local:/Data/Hero', G('a'), 'DynamicPlaceholderId=1', '/hm/hero-0') + r('22222222-2222-2222-2222-222222222222', 'local:/Data/Accordion', G('b'), 'DynamicPlaceholderId=2', '/hm/main-0') + r('33333333-3333-3333-3333-333333333333', 'local:/Data/RT', G('c'), 'DynamicPlaceholderId=3', '/hm/main-0'));
const item = (id, name, p, templateName, parentId, fields = {}, templateId = H('f')) => ({ id, name, path: p, templateId, templateName, parentId, version: 1, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, std: false }])) });
const items = {};
const add = (it) => { items[it.id] = it; };
add(item('home', 'Home', '/s/Home', 'Folder', ''));
add(item('p1', 'Thin', '/s/Home/thin', 'General Landing Page', 'home', { '__Final Renderings': one }, H('1')));
add(item('p2', 'Rich', '/s/Home/rich', 'General Landing Page', 'home', { '__Final Renderings': three }, H('1')));
add(item('d2', 'Data', '/s/Home/rich/Data', 'Folder', 'p2'));
add(item('np', 'Settings', '/s/Home/settings', 'Settings', 'home', { title: 'x' }, H('2')));
for (const [c, n] of [['a', 'Hero'], ['b', 'Accordion'], ['c', 'Rich Text']]) add(item(H(c), n, `/sitecore/layout/Renderings/${n}`, 'Json Rendering', 'rend', { 'Datasource Template': `/sitecore/templates/Project/${n}` }));
for (const [c, n] of [['1', 'General Landing Page'], ['d', 'Hero'], ['e', 'Accordion'], ['g', 'Rich Text']]) { add(item(H(c), n, `/sitecore/templates/Project/${n}`, 'Template', 'tpls')); add(item(`sec${c}`, 'Content', `/sitecore/templates/Project/${n}/Content`, 'Template section', H(c))); add(item(`f${c}`, 'title', `/sitecore/templates/Project/${n}/Content/title`, 'Template field', `sec${c}`, { Type: 'Single-Line Text' })); }
const scan = { tree: Object.values(items).filter((i) => i.path.startsWith('/s/Home')).map((i) => ({ id: i.id, name: i.name, path: i.path, parentId: i.parentId, templateId: i.templateId, templateName: i.templateName })), fields: Object.fromEntries(Object.values(items).map((i) => [i.id, { version: 1, f: Object.fromEntries(Object.entries(i.fields).map(([k, v]) => [k, v.value])) }])) };

test('pickRepresentativePages: one page per template that has a layout, the one with the most distinct components', () => {
  const picks = pickRepresentativePages(scan);
  assert.deepEqual(picks, [{ templateName: 'General Landing Page', templateId: H('1'), pageId: 'p2', path: '/s/Home/rich', components: 3, pages: 2 }]);
});
test('buildCatalog accepts pageIds instead of a blueprint root', async () => {
  const cm = fakeCm({ items });
  const cat = await buildCatalog({ cm, pageIds: ['p2'], placeholderHints: { hero: /hero/i } });
  assert.deepEqual(Object.keys(cat.pageTypes), ['generalLandingPage']);
  assert.deepEqual(Object.keys(cat.components).sort(), ['accordion', 'hero', 'richText']);
});
test('catalog build without a blueprint folder discovers pages and says so', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-disc-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/s', homePath: '/s/Home', environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  const cm = fakeCm({ items });
  const out = await catalogCommand(['build', '--env', 'fake'], { projectDir, print: false, cmFactory: () => cm, scanImpl: async () => scan });
  assert.deepEqual(out.pageTypes, ['generalLandingPage']);
  assert.equal(out.components, 3);
  assert.equal(out.discovered.length, 1); assert.equal(out.discovered[0].path, '/s/Home/rich');
  assert.match(out.note, /no blueprint folder/i);
  const cat = JSON.parse(fs.readFileSync(path.join(projectDir, '.content-ops', 'catalog.json'), 'utf8'));
  assert.equal(cat.source, 'discovered');
});
