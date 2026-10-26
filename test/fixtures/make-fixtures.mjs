// Builds test/fixtures/workbook.xlsx and deck.docx with a dependency-free zip writer (stored entries).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(entries) {
  const locals = [], centrals = []; let off = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text, 'utf8'); const n = Buffer.from(name); const crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, data); centrals.push(ch, n); off += lh.length + n.length + data.length;
  }
  const cd = Buffer.concat(centrals); const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(centrals.length / 2, 8); eocd.writeUInt16LE(centrals.length / 2, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
const c = (ref, t) => `<c r="${ref}" t="inlineStr"><is><t>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></is></c>`;
export function workbook() {
  const rows = [
    `<row r="1">${c('B1', 'COMPONENT: Hero')}${c('E1', 'COMPONENT: Accordion')}</row>`,
    `<row r="2">${c('A2', 'Slug')}${c('B2', 'Title')}${c('C2', 'Tagline')}${c('D2', 'CTA text')}${c('E2', 'Accordion title')}${c('F2', 'Panel 1 heading')}${c('G2', 'Panel 1 copy')}${c('H2', 'Notes')}</row>`,
    `<row r="3">${c('A3', 'north-clinic')}${c('B3', 'North Clinic')}${c('C3', 'Care close to home')}${c('D3', 'Book now')}${c('E3', 'Know before you go')}${c('F3', 'Parking')}${c('G3', 'Free parking.')}</row>`,
    `<row r="4">${c('F4', 'Hours')}${c('G4', 'Mon-Fri 8-5')}</row>`,
    `<row r="5">${c('A5', 'south-clinic')}${c('B5', 'South Clinic')}${c('D5', 'See location search')}${c('H5', 'DO NOT AUTHOR - closing')}</row>`,
  ].join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData><mergeCells count="3"><mergeCell ref="A3:A4"/><mergeCell ref="B1:D1"/><mergeCell ref="E1:G1"/></mergeCells></worksheet>`;
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Clinics" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
  });
}
export function workbook2() {
  const rows = [
    `<row r="1">${c('B1', 'COMPONENT: Hero')}${c('E1', 'COMPONENT: Accordion')}</row>`,
    `<row r="2">${c('A2', 'Slug')}${c('B2', 'Title')}${c('C2', 'CTA text')}${c('D2', 'CTA URL')}${c('E2', 'Panel 1 heading')}${c('F2', 'Panel 1 copy')}${c('G2', 'Panel 2 heading')}${c('H2', 'Panel 2 copy')}</row>`,
    `<row r="3">${c('A3', 'east-clinic')}${c('B3', 'East Clinic')}${c('C3', 'Book now')}${c('D3', 'https://example.org/book')}${c('E3', 'Parking')}${c('F3', 'Free parking.')}${c('G3', 'Hours')}${c('H3', 'Mon-Fri')}</row>`,
    `<row r="4">${c('F4', 'Second paragraph.')}</row>`,
    `<row r="5">${c('F5', 'Third paragraph.')}</row>`,
    `<row r="6">${c('A6', 'west-clinic')}${c('B6', 'West Clinic')}${c('C6', 'Call us')}${c('D6', 'see location search')}</row>`,
  ].join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData><mergeCells count="3"><mergeCell ref="A3:A5"/><mergeCell ref="B1:D1"/><mergeCell ref="E1:H1"/></mergeCells></worksheet>`;
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Clinics" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
  });
}
const p = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const tr = (a, b) => `<w:tr><w:tc>${p(a)}</w:tc><w:tc>${p(b)}</w:tc></w:tr>`;
export function deck() {
  const body = p('Copy Deck: North Clinic') + p('Page ID: 12.3') +
    `<w:tbl>${tr('Component', 'Accodion')}${tr('Title', 'Why choose us')}${tr('Panel 1 heading', 'Parking')}${tr('Panel 1 copy', 'Free parking.')}${tr('Panel 2 heading', 'Hours')}${tr('Panel 2 copy', 'Mon-Fri')}</w:tbl>` +
    p('Component: Mystery Block') + p('Some copy nobody mapped') +
    `<w:p><w:r><w:t>Read more at </w:t></w:r><w:hyperlink r:id="rId9"><w:r><w:t>our site</w:t></w:r></w:hyperlink><w:r><w:t> (Page ID: 45.10)</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>First bullet</w:t></w:r></w:p>`;
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`,
    'word/_rels/document.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="hyperlink" Target="https://example.org/x?a=1&amp;b=2" TargetMode="External"/></Relationships>',
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { fs.writeFileSync(path.join(here, 'workbook.xlsx'), workbook()); fs.writeFileSync(path.join(here, 'workbook2.xlsx'), workbook2()); fs.writeFileSync(path.join(here, 'deck.docx'), deck()); console.log('fixtures written'); }
