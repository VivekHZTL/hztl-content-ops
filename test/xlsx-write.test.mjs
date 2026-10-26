import test from 'node:test';
import assert from 'node:assert/strict';
import { writeWorkbook } from '../plugin/engine/lib/ingest/xlsx-write.mjs';
import { readWorkbook, unzip } from '../plugin/engine/lib/ingest/xlsx.mjs';
import { csvToSheet, toCsv } from '../plugin/engine/lib/ingest/csv.mjs';

test('writeWorkbook round-trips through readWorkbook with two tabs, blanks, numbers and special chars', () => {
  const buf = writeWorkbook({ sheets: [
    { name: 'Location', rows: [['Page', null, 'Hero'], ['Slug', 'Page Title', 'Title'], ['north', 'North & <Clinic>', 'Hi "there"'], [null, 42, '']] },
    { name: 'README', rows: [['How to fill this sheet']] },
  ] });
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'zip local header');
  const wb = readWorkbook(buf);
  assert.deepEqual(wb.sheets.map((s) => s.name), ['Location', 'README']);
  const s = wb.sheets[0];
  assert.equal(s.rows[1].A, 'Page'); assert.equal(s.rows[2].A, 'Slug'); assert.equal(s.rows[3].B, 'North & <Clinic>'); assert.equal(s.rows[3].C, 'Hi "there"');
  assert.equal(s.rows[4].B, '42'); assert.equal(s.rows[4].A, undefined); assert.equal(s.rows[1].B, undefined);
  assert.equal(s.maxRow, 4); assert.equal(s.maxCol, 3);
  const z = unzip(buf);
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/styles.xml']) assert.ok(z[f], f);
  assert.match(z['xl/worksheets/sheet1.xml'](), /<cols>/, 'column widths present');
});
test('CRC32 and sizes are right so strict readers accept the zip', () => {
  const buf = writeWorkbook({ sheets: [{ name: 'S', rows: [['a']] }] });
  const local = buf.readUInt32LE(14);
  let eocd = -1; for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  const cd = buf.readUInt32LE(eocd + 16);
  assert.equal(buf.readUInt32LE(cd + 16), local); assert.notEqual(local, 0);
});
test('csvToSheet parses quotes, embedded commas and newlines; toCsv inverts it', () => {
  const text = 'Slug,Title,Body\r\nnorth,"North, Clinic","Line 1\nLine 2"\r\nsouth,"He said ""hi""",\r\n';
  const s = csvToSheet(text, { name: 'Location' });
  assert.equal(s.name, 'Location'); assert.equal(s.maxRow, 3); assert.equal(s.maxCol, 3);
  assert.equal(s.rows[2].B, 'North, Clinic'); assert.equal(s.rows[2].C, 'Line 1\nLine 2'); assert.equal(s.rows[3].B, 'He said "hi"'); assert.equal(s.rows[3].C, undefined);
  assert.deepEqual(s.merges, []); assert.deepEqual(s.links, {});
  const back = csvToSheet(toCsv([['Slug', 'Title'], ['a,b', 'c"d']]));
  assert.equal(back.rows[2].A, 'a,b'); assert.equal(back.rows[2].B, 'c"d');
});
