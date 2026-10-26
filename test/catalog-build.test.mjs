import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { buildCatalog, templateFields } from '../plugin/engine/lib/catalog/build.mjs';
import { validateCatalog } from '../plugin/engine/lib/catalog/schema.mjs';

// Synthetic CM: one blueprint page with hero + accordion + accordion item, rendering items, templates. No real IDs.
const H = (c) => c.repeat(32);
const item = (id, name, path, templateName, parentId, fields = {}, templateId = H('f')) => ({ id, name, path, templateId, templateName, parentId, version: 1, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, std: false }])) });
const DEV = '{DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD}';
const layout = `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="${DEV}">` +
  `<r uid="{11111111-1111-1111-1111-111111111111}" p:before="*" s:ds="local:/Data/Hero" s:id="{${H('a').toUpperCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')}}" s:par="FieldNames&amp;DynamicPlaceholderId=1" s:ph="/hm/custom-hero-x-0" />` +
  `<r uid="{22222222-2222-2222-2222-222222222222}" p:after="r[@uid='{11111111-1111-1111-1111-111111111111}']" s:ds="local:/Data/Accordion" s:id="{${H('b').toUpperCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')}}" s:par="selectTheme=ThemesWhite&amp;Styles&amp;DynamicPlaceholderId=3" s:ph="/hm/custom-main-x-0" />` +
  `<r uid="{33333333-3333-3333-3333-333333333333}" p:after="r[@uid='{22222222-2222-2222-2222-222222222222}']" s:ds="local:/Data/Accordion/Item 1" s:id="{${H('c').toUpperCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')}}" s:par="DynamicPlaceholderId=4" s:ph="/hm/custom-main-x-0/accordion-3" />` +
  `</d></r>`;
const items = {};
const add = (it) => { items[it.id] = it; };
add(item('root', 'Home', '/s/Home', 'Folder', ''));
add(item('bp', '_blueprints', '/s/Home/_blueprints', 'Folder', 'root'));
add(item('pg', 'General Landing Page', '/s/Home/_blueprints/General Landing Page', 'General Landing Page', 'bp', { '__Final Renderings': layout, '__Renderings': `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="${DEV}" l="{L}"/></r>` }, H('1')));
add(item('pgdata', 'Data', '/s/Home/_blueprints/General Landing Page/Data', 'Folder', 'pg'));
// rendering items
add(item(H('a'), 'Hero General Landing', '/sitecore/layout/Renderings/Hero', 'Json Rendering', 'rend', { 'Datasource Template': '/sitecore/templates/Project/Hero' }));
add(item(H('b'), 'Accordion', '/sitecore/layout/Renderings/Accordion', 'Json Rendering', 'rend', { 'Datasource Template': `{${H('e').toUpperCase()}}` }));
add(item(H('c'), 'Accordion Item', '/sitecore/layout/Renderings/Accordion Item', 'Json Rendering', 'rend', { 'Datasource Template': '/sitecore/templates/Project/Accordion Item' }));
// templates
add(item(H('1'), 'General Landing Page', '/sitecore/templates/Project/Pages/General Landing Page', 'Template', 'tpls', { '__Base template': '' }));
add(item('sec1', 'Content', '/sitecore/templates/Project/Pages/General Landing Page/Content', 'Template section', H('1')));
add(item('f1', 'pageTitle', '/sitecore/templates/Project/Pages/General Landing Page/Content/pageTitle', 'Template field', 'sec1', { Type: 'Single-Line Text' }));
add(item(H('d'), 'Hero', '/sitecore/templates/Project/Hero', 'Template', 'tpls'));
add(item('sec2', 'Content', '/sitecore/templates/Project/Hero/Content', 'Template section', H('d')));
add(item('f2', 'title', '/sitecore/templates/Project/Hero/Content/title', 'Template field', 'sec2', { Type: 'Single-Line Text' }));
add(item(H('e'), 'Accordion', '/sitecore/templates/Project/Accordion', 'Template', 'tpls', { '__Base template': `{${H('9').toUpperCase()}}` }));
add(item('sec3', 'Content', '/sitecore/templates/Project/Accordion/Content', 'Template section', H('e')));
add(item('f3', 'title', '/sitecore/templates/Project/Accordion/Content/title', 'Template field', 'sec3', { Type: 'Single-Line Text' }));
add(item('f4', 'description', '/sitecore/templates/Project/Accordion/Content/description', 'Template field', 'sec3', { Type: 'Rich Text' }));
add(item(H('9'), 'Eyebrow Base', '/sitecore/templates/Project/Eyebrow Base', 'Template', 'tpls'));
add(item('sec4', 'Content', '/sitecore/templates/Project/Eyebrow Base/Content', 'Template section', H('9')));
add(item('f5', 'eyebrow', '/sitecore/templates/Project/Eyebrow Base/Content/eyebrow', 'Template field', 'sec4', { Type: 'Single-Line Text' }));
add(item(H('7'), 'Accordion Item', '/sitecore/templates/Project/Accordion Item', 'Template', 'tpls'));
add(item('sec5', 'Content', '/sitecore/templates/Project/Accordion Item/Content', 'Template section', H('7')));
add(item('f6', 'heading', '/sitecore/templates/Project/Accordion Item/Content/heading', 'Template field', 'sec5', { Type: 'Single-Line Text' }));

test('templateFields walks sections and base templates', async () => {
  const cm = fakeCm({ items });
  const f = await templateFields(cm, H('e'));
  assert.deepEqual(f.map((x) => x.name).sort(), ['description', 'eyebrow', 'title']);
});
test('buildCatalog reads blueprint pages into page types, components, placeholders and parents', async () => {
  const cm = fakeCm({ items });
  const cat = await buildCatalog({ cm, blueprintRoot: '/s/Home/_blueprints', language: 'en' });
  assert.equal(cat.device, DEV);
  assert.ok(cat.placeholders.hero.endsWith('custom-hero-x-0'));
  assert.ok(cat.placeholders.main.endsWith('custom-main-x-0'));
  assert.deepEqual(cat.pageTypes.generalLandingPage.layout, ['heroGeneralLanding', 'accordion', 'accordionItem']);
  assert.deepEqual(cat.pageTypes.generalLandingPage.fields.map((f) => f.name), ['pageTitle']);
  assert.equal(cat.components.heroGeneralLanding.ph, 'hero');
  assert.equal(cat.components.accordion.ph, 'main');
  assert.equal(cat.components.accordion.themed, true);
  assert.equal(cat.components.accordion.childPh, 'accordion');
  assert.deepEqual(cat.components.accordion.children, ['accordionItem']);
  assert.equal(cat.components.accordionItem.ph, 'accordion');
  assert.equal(cat.components.accordionItem.parent, 'accordion');
  assert.ok(cat.components.accordion.fields.some((f) => f.name === 'eyebrow'));
  assert.equal(cat.components.accordion.dsTemplateId, H('e'));
  assert.ok(!/DynamicPlaceholderId/.test(cat.components.accordion.params));
  assert.deepEqual(validateCatalog(cat), []);
});
