// RFC 4180 csv ↔ the sheet shape readWorkbook returns, so a csv template feeds the same intake path.
import { numToCol } from './xlsx.mjs';

export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function csvToSheet(text, { name = 'Sheet1' } = {}) {
  const rows = {}; let maxRow = 0, maxCol = 0;
  parseCsv(text).forEach((r, ri) => r.forEach((v, ci) => { if (v === '') return; (rows[ri + 1] ??= {})[numToCol(ci + 1)] = v; maxRow = Math.max(maxRow, ri + 1); maxCol = Math.max(maxCol, ci + 1); }));
  return { name, rows, merges: [], links: {}, maxRow, maxCol };
}

const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
