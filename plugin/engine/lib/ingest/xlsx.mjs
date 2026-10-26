// Minimal, dependency-free .xlsx reader: enough to read sheet tabs, cell values,
// merged ranges and hyperlinks. Does not evaluate formulas (uses cached values).
import zlib from 'node:zlib';

function unzip(buf) {
  // Locate End Of Central Directory record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip/xlsx file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(local + 26), lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    files[name] = () => (method === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const texts = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => dec(t[1])).join('');

export const colToNum = (c) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const numToCol = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/** Returns { sheets: [{ name, cells: {A1: value}, rows: {rowNum: {col: value}}, merges: [{c1,r1,c2,r2}], links: {A1: url}, maxRow, maxCol }] } */
export function readWorkbook(buf) {
  const z = unzip(buf);
  const shared = z['xl/sharedStrings.xml'] ? [...z['xl/sharedStrings.xml']().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1])) : [];
  const wb = z['xl/workbook.xml']();
  const rels = z['xl/_rels/workbook.xml.rels']();
  const relTarget = Object.fromEntries([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = relTarget[m[2]].replace(/^\/?(xl\/)?/, 'xl/');
    const xml = z[target]();
    const rows = {}; let maxRow = 0, maxCol = 0;
    for (const c of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, rowS, attrs, inner = ''] = c;
      const v = inner.match(/<v>([\s\S]*?)<\/v>/); const is = inner.match(/<is>([\s\S]*?)<\/is>/);
      let val = null;
      if (/t="s"/.test(attrs) && v) val = shared[+v[1]];
      else if (is) val = texts(is[1]);
      else if (v) val = dec(v[1]);
      if (val === null || val === '') continue;
      const row = +rowS;
      (rows[row] ??= {})[col] = val;
      maxRow = Math.max(maxRow, row); maxCol = Math.max(maxCol, colToNum(col));
    }
    const merges = [...xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)].map((x) => ({ c1: x[1], r1: +x[2], c2: x[3], r2: +x[4] }));
    const sheetRelsPath = target.replace(/worksheets\/(sheet[^/]+)$/, 'worksheets/_rels/$1.rels');
    const links = {};
    if (z[sheetRelsPath]) {
      const sr = Object.fromEntries([...z[sheetRelsPath]().matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((x) => [x[1], dec(x[2])]));
      for (const h of xml.matchAll(/<hyperlink [^>]*ref="([A-Z]+\d+)"[^>]*r:id="([^"]+)"/g)) links[h[1]] = sr[h[2]];
    }
    sheets.push({ name: dec(m[1]), rows, merges, links, maxRow, maxCol });
  }
  return { sheets };
}

/**
 * Split a sheet into records. A record is the row span of the merged cell in `keyColumn`
 * (or a single row if not merged) starting at `firstDataRow`, where the key cell has a value.
 * Each record: { rows: 'a-b', key, cols: { COL: [values in row order] } }
 */
export function sheetRecords(sheet, { keyColumn, firstDataRow }) {
  const spans = new Map();
  for (const m of sheet.merges) if (m.c1 === keyColumn && m.r1 >= firstDataRow) spans.set(m.r1, m.r2);
  const out = [];
  for (let r = firstDataRow; r <= sheet.maxRow; r++) {
    const key = sheet.rows[r]?.[keyColumn];
    if (!key) continue;
    const end = spans.get(r) ?? r;
    // A record ends where the next keyed row starts, even if not merged.
    let stop = end;
    for (let k = r + 1; k <= end; k++) if (sheet.rows[k]?.[keyColumn]) { stop = k - 1; break; }
    const cols = {};
    for (let k = r; k <= stop; k++) for (const [c, v] of Object.entries(sheet.rows[k] || {})) (cols[c] ??= []).push(String(v));
    out.push({ rows: `${r}-${stop}`, key: String(key).trim(), cols });
    r = stop;
  }
  return out;
}

/** Column headers: { COL: { group, header } } where group is the nearest component title to the left in groupRow. */
export function sheetColumns(sheet, { headerRow, groupRows = [] }) {
  const cols = {}; let lastGroup = '';
  for (let n = 1; n <= sheet.maxCol; n++) {
    const c = numToCol(n);
    const g = groupRows.map((r) => sheet.rows[r]?.[c]).find(Boolean);
    if (g) lastGroup = String(g).trim();
    const header = sheet.rows[headerRow]?.[c];
    if (header || g) cols[c] = { group: lastGroup, header: String(header ?? '').trim() };
  }
  return cols;
}

/** Guess header row (most text cells in rows 1–10), group rows (rows above it with any cell), first data row, key column. */
export function detectLayout(sheet, { keyHeaderPattern = /slug|page\s*id|^key$|^url$|^id$/i } = {}) {
  let headerRow = 1, best = -1;
  for (let r = 1; r <= Math.min(10, sheet.maxRow); r++) {
    const n = Object.values(sheet.rows[r] || {}).filter((v) => typeof v === 'string' && v.trim()).length;
    if (n > best) { best = n; headerRow = r; }
  }
  const groupRows = []; for (let r = 1; r < headerRow; r++) if (Object.keys(sheet.rows[r] || {}).length) groupRows.push(r);
  const headers = sheet.rows[headerRow] || {};
  const keyColumn = Object.keys(headers).sort((a, b) => colToNum(a) - colToNum(b)).find((c) => keyHeaderPattern.test(String(headers[c]))) || Object.keys(headers).sort((a, b) => colToNum(a) - colToNum(b))[0] || 'A';
  return { headerRow, groupRows, firstDataRow: headerRow + 1, keyColumn };
}

export { unzip };
