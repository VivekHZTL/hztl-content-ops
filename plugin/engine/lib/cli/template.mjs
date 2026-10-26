// `template --page-type <key> [--components a,b] [--children n] [--format xlsx|csv] [--out file]`
// Writes the client intake sheet from the catalog and registers its shape so a filled copy maps itself.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need, requireCatalog } from './common.mjs';
import { buildTemplate } from '../template/intake-sheet.mjs';
import { writeWorkbook } from '../ingest/xlsx-write.mjs';
import { toCsv, csvToSheet } from '../ingest/csv.mjs';
import { readWorkbook, sheetColumns, colToNum } from '../ingest/xlsx.mjs';
import { proposeProfile } from '../ingest/xlsx-adapter.mjs';
import { sheetFingerprint, saveMapping } from '../knowledge/mappings.mjs';

export const CSV_TAB = 'csv'; // a csv has no tab; a constant keeps the fingerprint independent of the file name
const USAGE = 'content-ops template --page-type <key> [--components a,b] [--children n] [--format xlsx|csv] [--out file]';
export async function templateCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const { catalog } = requireCatalog(ctx.cfg);
  const pageType = need(flags, 'page-type', USAGE);
  const format = flags.format && flags.format !== true ? String(flags.format) : 'xlsx';
  if (!['xlsx', 'csv'].includes(format)) throw new Error('--format must be xlsx or csv');
  const t = buildTemplate(catalog, pageType, { components: flags.components && flags.components !== true ? String(flags.components).split(',').map((s) => s.trim()).filter(Boolean) : null, children: flags.children && flags.children !== true ? +flags.children : 3 });
  const out = path.resolve(ctx.projectDir, flags.out && flags.out !== true ? flags.out : path.join('sources', `template-${pageType}.${format}`));
  if (fs.existsSync(out) && !flags.force) throw new Error(`${out} exists; it may be a filled copy. Add --out <other file> or --force to replace it`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (format === 'xlsx') fs.writeFileSync(out, writeWorkbook({ sheets: [{ name: t.tab, rows: t.rows, widths: t.widths }, { name: 'README', rows: t.readme, widths: [120] }] }));
  else fs.writeFileSync(out, toCsv(t.rows));
  // read the file back exactly as intake will, so the registered fingerprint is the one a filled copy produces
  const sheet = format === 'xlsx' ? readWorkbook(fs.readFileSync(out)).sheets[0] : csvToSheet(fs.readFileSync(out, 'utf8'), { name: CSV_TAB });
  const fp = sheetFingerprint(sheet);
  const profile = proposeProfile(sheetColumns(sheet, fp.layout), catalog, { tab: sheet.name, layout: fp.layout, parentPath: ctx.cfg.project.homePath, pageType: catalog.pageTypes[pageType] });
  const other = Object.entries(profile.columns).filter(([, c]) => c.confidence !== 'exact').map(([col, c]) => `${col} "${t.headers[colToNum(col) - 1] ?? ''}": ${c.why}`);
  if (other.length) { fs.rmSync(out, { force: true }); throw new Error(`The template would not map back cleanly; fix the catalog field names first:\n- ${other.join('\n- ')}`); }
  saveMapping(ctx.projectDir, { ...fp, sourceFile: path.relative(ctx.projectDir, out).split(path.sep).join('/'), profile, provenance: 'template' });
  return emit(ctx, { file: out, tab: t.tab, columns: t.headers.length, skipped: t.skipped, fingerprint: fp.fingerprint, mappedExact: Object.keys(profile.columns).length - other.length, mappedOther: other.length, next: `Hand ${path.basename(out)} to the client. A filled copy dropped in sources/ maps itself; changed headers ask for confirmation.` });
}
