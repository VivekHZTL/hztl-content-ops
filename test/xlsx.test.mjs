import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook, sheetRecords, sheetColumns, detectLayout } from '../plugin/engine/lib/ingest/xlsx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const wb = readWorkbook(fs.readFileSync(path.join(here, 'fixtures/workbook.xlsx')));
test('readWorkbook reads the tab, cells and merges', () => {
  assert.equal(wb.sheets[0].name, 'Clinics');
  assert.equal(wb.sheets[0].rows[3].B, 'North Clinic');
  assert.ok(wb.sheets[0].merges.some((m) => m.c1 === 'A' && m.r1 === 3 && m.r2 === 4));
});
test('detectLayout finds header, group and key column; sheetRecords spans merged keys', () => {
  const lay = detectLayout(wb.sheets[0]);
  assert.deepEqual(lay, { headerRow: 2, groupRows: [1], firstDataRow: 3, keyColumn: 'A' });
  const recs = sheetRecords(wb.sheets[0], { keyColumn: 'A', firstDataRow: 3 });
  assert.equal(recs.length, 2);
  assert.deepEqual(recs[0].cols.G, ['Free parking.', 'Mon-Fri 8-5']);
  assert.equal(recs[1].key, 'south-clinic');
  const cols = sheetColumns(wb.sheets[0], { headerRow: 2, groupRows: [1] });
  assert.equal(cols.F.group, 'COMPONENT: Accordion');
  assert.equal(cols.C.header, 'Tagline');
});
