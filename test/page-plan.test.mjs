import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeCm, itemsFromSnapshot } from '../plugin/engine/lib/cm/fake.mjs';
import { snapshotPage } from '../plugin/engine/lib/snapshot/page.mjs';
import { planPage } from '../plugin/engine/lib/plan/page-plan.mjs';
import { DEFAULT_RULES } from '../plugin/engine/lib/config/project.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const snap0 = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/page-snapshot.json'), 'utf8'));
const xml = snap0.page.fields['__Final Renderings'].value;
const device = xml.match(/<d\s[^>]*id="([^"]+)"/)[1];
const rid = (ds) => xml.match(new RegExp(`s:ds="${ds.replace(/[/ ]/g, (c) => c)}"[^>]*s:id="\\{([^}]+)\\}"`))[1].replace(/-/g, '').toLowerCase();
const heroRid = xml.match(/s:id="\{([^}]+)\}"/)[1].replace(/-/g, '').toLowerCase();
const mainPh = xml.match(/s:ph="([^"]*main-content[^"]*)"/)[1];
const heroPh = xml.match(/s:ph="([^"]*hero[^"]*)"/)[1];
const ids = [...new Set([...xml.matchAll(/s:id="\{([^}]+)\}"/g)].map((m) => m[1].replace(/-/g, '').toLowerCase()))];
const catalog = { v: 1, device, placeholders: { hero: heroPh, main: mainPh }, pageTypes: {}, components: {} };
for (const id of ids) catalog.components[`c_${id.slice(0, 6)}`] = { name: `Component ${id.slice(0, 6)}`, renderingId: id, ph: 'main', themed: false, params: '', fields: [], children: [], parent: null, childPh: null };
catalog.components[`c_${heroRid.slice(0, 6)}`].ph = 'hero';
catalog.components.fsbs = { name: 'Feature Side by Side', renderingId: rid('local:/Data/Feature Side by Side'), ph: 'main', themed: true, params: 'selectTheme&Styles', fields: [{ name: 'eyebrow', type: 'Single-Line Text' }, { name: 'heading', type: 'Single-Line Text' }, { name: 'description', type: 'Rich Text' }, { name: 'imageDAM', type: 'Image' }], children: [], parent: null, childPh: null, dsTemplateId: 'f'.repeat(32) };
delete catalog.components[`c_${rid('local:/Data/Feature Side by Side').slice(0, 6)}`];
catalog.components.articles = { name: 'Related Articles', renderingId: rid('local:/Data/Related Articles'), ph: 'main', themed: false, params: '', fields: [{ name: 'ctaLabel', type: 'Single-Line Text' }], children: [], parent: null, childPh: null, dsTemplateId: 'e'.repeat(32) };
delete catalog.components[`c_${rid('local:/Data/Related Articles').slice(0, 6)}`];
catalog.components.accordion = { name: 'Accordion', renderingId: '1'.repeat(32), ph: 'main', themed: true, params: 'selectTheme', fields: [{ name: 'title', type: 'Single-Line Text' }], children: ['accordionItem'], parent: null, childPh: 'accordion', dsTemplateId: 'a'.repeat(32) };
catalog.components.accordionItem = { name: 'Accordion Item', renderingId: '2'.repeat(32), ph: 'accordion', themed: false, params: '', fields: [{ name: 'heading', type: 'Single-Line Text' }], children: [], parent: 'accordion', childPh: null, dsTemplateId: 'b'.repeat(32) };
const rules = DEFAULT_RULES;
const snap = async () => snapshotPage(fakeCm({ items: itemsFromSnapshot(snap0) }), snap0.page.id);
const content = (components, flags = []) => ({ pageId: '1.1', pageType: 'x', target: { path: snap0.page.path, mode: 'update' }, components, flags, sources: [{ file: 'sources/d.txt', sha256: 'abc' }] });

test('(a) binds to the existing component and plans one field update, no creates, no layout op', async () => {
  const plan = planPage({ content: content([{ type: 'fsbs', fields: { heading: 'New heading' } }]), snap: await snap(), catalog, rules, key: 'k' });
  assert.equal(plan.status, 'ready', plan.reasons.join('; '));
  assert.equal(plan.ops.creates.length, 0);
  assert.equal(plan.ops.updates.length, 1);
  assert.equal(plan.ops.updates[0].field, 'heading');
  assert.match(plan.ops.updates[0].ref, /^[0-9a-f]{32}$/);
  assert.equal(plan.ops.layout, null);
  assert.deepEqual(plan.sources, [{ file: 'sources/d.txt', sha256: 'abc' }]);
});
test('(b) whitespace-only difference is up-to-date; a link difference is an update', async () => {
  const s = await snap();
  const cur = s.data.children.find((c) => c.name === 'Feature Side by Side').fields.imageDAM.value;
  const same = planPage({ content: content([{ type: 'fsbs', fields: { imageDAM: cur + '  ' } }]), snap: s, catalog, rules, key: 'k' });
  assert.equal(same.status, 'up-to-date');
  const diff = planPage({ content: content([{ type: 'fsbs', fields: { description: '<p>See <a href="/care">care</a></p>' } }]), snap: s, catalog, rules, key: 'k' });
  assert.equal(diff.status, 'ready');
});
test('(c) a new component with a child creates both items and a layout op with themes', async () => {
  const plan = planPage({ content: content([{ type: 'accordion', fields: { title: 'T' }, children: [{ type: 'accordionItem', fields: { heading: 'H' } }] }]), snap: await snap(), catalog, rules, key: 'k' });
  assert.equal(plan.status, 'ready', plan.reasons.join('; '));
  assert.deepEqual(plan.ops.creates.map((c) => c.name), ['Accordion', 'Accordion Item 1']);
  assert.equal(plan.ops.creates[1].parentRef, 'new:Accordion');
  assert.ok(plan.ops.layout);
  assert.ok(plan.layout.after.includes('Accordion') && plan.layout.after.includes('Accordion Item'));
  assert.ok(plan.layout.themesAfter.some((t) => t === 'White' || t === 'Light'));
  assert.ok(plan.ops.updates.some((u) => u.ref === 'new:Accordion' && u.field === 'title'));
  assert.ok(plan.ops.updates.some((u) => u.ref === 'new:Accordion Item 1' && u.field === 'heading'));
});
test('(d) two components of one type: first binds, second creates with a numbered name', async () => {
  const plan = planPage({ content: content([{ type: 'fsbs', fields: { heading: 'A' } }, { type: 'fsbs', fields: { heading: 'B' } }]), snap: await snap(), catalog, rules, key: 'k' });
  assert.deepEqual(plan.ops.creates.map((c) => c.name), ['Feature Side by Side 2']);
});
test('(e) a local: datasource that is missing on the page is treated as a create and flagged', async () => {
  const s = await snap();
  s.data.children = s.data.children.filter((c) => c.name !== 'Related Articles');
  const plan = planPage({ content: content([{ type: 'articles', fields: { ctaLabel: 'More' } }]), snap: s, catalog, rules, key: 'k' });
  assert.equal(plan.status, 'ready', plan.reasons.join('; '));
  assert.ok(plan.ops.creates.some((c) => /Related Articles/.test(c.name)));
  assert.ok(plan.pending.some((p) => p.category === 'review' && /missing/i.test(p.text)));
});
test('(f) unknown type and unknown field are needs-review', async () => {
  const s = await snap();
  assert.equal(planPage({ content: content([{ type: 'nope', fields: {} }]), snap: s, catalog, rules, key: 'k' }).status, 'needs-review');
  const p2 = planPage({ content: content([{ type: 'fsbs', fields: { bogus: 'x' } }]), snap: s, catalog, rules, key: 'k' });
  assert.equal(p2.status, 'needs-review');
  assert.ok(p2.reasons.some((r) => /bogus/.test(r)));
});
test('(g) a placeholder value is pending and not written', async () => {
  const plan = planPage({ content: content([{ type: 'fsbs', fields: { heading: 'Call [TBD]', eyebrow: 'Fine' } }]), snap: await snap(), catalog, rules, key: 'k' });
  assert.equal(plan.status, 'ready');
  assert.ok(plan.pending.some((p) => p.category === 'placeholder'));
  assert.ok(!plan.ops.updates.some((u) => u.field === 'heading'));
  assert.ok(plan.ops.updates.some((u) => u.field === 'eyebrow'));
});
test('(h) a do-not-author flag is needs-review', async () => {
  const plan = planPage({ content: content([{ type: 'fsbs', fields: { heading: 'x' } }], [{ kind: 'do-not-author', where: 'row 5', text: 'DO NOT AUTHOR' }]), snap: await snap(), catalog, rules, key: 'k' });
  assert.equal(plan.status, 'needs-review');
});
