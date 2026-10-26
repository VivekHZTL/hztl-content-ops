import test from 'node:test';
import assert from 'node:assert/strict';
import { componentKey, validateCatalog, catalogToSite } from '../plugin/engine/lib/catalog/schema.mjs';

test('componentKey camel-cases names', () => {
  assert.equal(componentKey('Accordion Item'), 'accordionItem');
  assert.equal(componentKey('Feature Side by Side'), 'featureSideBySide');
  assert.equal(componentKey('RTE'), 'rte');
  assert.equal(componentKey('In-Page Banner'), 'inPageBanner');
});
const cat = { v: 1, device: '{D}', placeholders: { hero: '/h', main: '/m' }, pageTypes: {}, components: {
  accordion: { name: 'Accordion', renderingId: 'a'.repeat(32), ph: 'main', childPh: 'accordion', themed: true, params: 'x', fields: [], children: ['accordionItem'], parent: null, codePath: null, extra: 1 },
  accordionItem: { name: 'Accordion Item', renderingId: 'b'.repeat(32), ph: 'accordion', parent: 'accordion', fields: [], children: [] } } };
test('validateCatalog passes a good catalog and flags an orphan child placeholder', () => {
  assert.deepEqual(validateCatalog(cat), []);
  const bad = structuredClone(cat); bad.components.accordionItem.ph = 'nothing';
  assert.ok(validateCatalog(bad).some((e) => /nothing/.test(e)));
  const bad2 = structuredClone(cat); delete bad2.placeholders.main;
  assert.ok(validateCatalog(bad2).some((e) => /main/.test(e)));
});
test('catalogToSite keeps only what the layout toolkit needs', () => {
  const site = catalogToSite(cat);
  assert.deepEqual(Object.keys(site).sort(), ['components', 'device', 'placeholders']);
  assert.deepEqual(Object.keys(site.components.accordion).sort(), ['name', 'params', 'ph', 'renderingId']);
  assert.equal(site.components.accordionItem.ph, 'accordion');
});
