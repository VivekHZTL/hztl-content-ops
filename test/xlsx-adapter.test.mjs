import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook, sheetColumns, detectLayout } from '../plugin/engine/lib/ingest/xlsx.mjs';
import { proposeProfile, workbookToContent } from '../plugin/engine/lib/ingest/xlsx-adapter.mjs';
import { validateContent } from '../plugin/engine/lib/content/schema.mjs';
import { catalog } from './_catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const wb = readWorkbook(fs.readFileSync(path.join(here, 'fixtures/workbook.xlsx')));
const sheet = wb.sheets[0];
const layout = detectLayout(sheet);
const columns = sheetColumns(sheet, layout);

test('proposeProfile maps headers to components and fields from the catalog, with confidence and why', () => {
  const prof = proposeProfile(columns, catalog, { tab: 'Clinics', layout, parentPath: '/s/Home/locations' });
  assert.equal(prof.columns.A.target, 'key');
  assert.equal(prof.columns.B.target, 'component.hero.title');
  assert.equal(prof.columns.C.target, 'component.hero.tagline');
  assert.equal(prof.columns.D.target, 'component.hero.cta');
  assert.equal(prof.columns.E.target, 'component.accordion.title');
  assert.equal(prof.columns.F.target, 'child.accordionItem.1.heading');
  assert.equal(prof.columns.G.target, 'child.accordionItem.1.content');
  assert.equal(prof.columns.H.target, 'note');
  assert.ok(['exact', 'fuzzy'].includes(prof.columns.B.confidence));
  assert.ok(prof.columns.B.why);
});
test('workbookToContent yields one content per record, with children, flags and locators', () => {
  const prof = proposeProfile(columns, catalog, { tab: 'Clinics', layout, parentPath: '/s/Home/locations' });
  const { contents, inventory } = workbookToContent(wb, prof, { catalog, sourceFile: 'sources/workbook.xlsx', sha256: 'abc', pageType: 'generalLanding' });
  assert.equal(contents.length, 2);
  const [a, b] = contents;
  assert.equal(a.target.path, '/s/Home/locations/north-clinic');
  assert.equal(a.components[0].type, 'hero');
  assert.equal(a.components[0].fields.title, 'North Clinic');
  assert.deepEqual(a.components[0].fields.cta, { text: 'Book now', url: '' });
  assert.ok(a.flags.some((f) => f.kind === 'missing-url' && f.where === "'Clinics'!D3"));
  const acc = a.components.find((c) => c.type === 'accordion');
  // 'Panel 1 heading' is a numbered column: the two merged rows are one panel, values joined and flagged
  assert.equal(acc.children.length, 1, JSON.stringify(acc.children));
  assert.equal(acc.children[0].fields.heading, 'Parking\nHours');
  assert.ok(a.flags.some((f) => f.kind === 'confirm' && /joined/.test(f.text)));
  assert.equal(a.locators['components.0.fields.title'], "'Clinics'!B3");
  assert.ok(b.flags.some((f) => f.kind === 'do-not-author' && f.where === "'Clinics'!H5"));
  assert.ok(b.flags.some((f) => f.kind === 'missing-url'));
  assert.deepEqual(validateContent(a, catalog), []);
  assert.equal(inventory.records, 2);
  assert.equal(inventory.flags['do-not-author'], 1);
  assert.deepEqual(a.sources, [{ file: 'sources/workbook.xlsx', sha256: 'abc' }]);
});
