// `intake [--sources dir] [--parent-path p] [--page-type k] [--profile f] [--section-map f] [--sitemap f] [--env e] [--out work]`
// Registers every source file, runs the adapter for its type, applies overrides, resolves links when a
// sitemap and env are given, validates, writes work/<pageId>.json and work/inventory.json. On the first run
// for a workbook or deck it writes a proposed profile / section map and stops, so a person can confirm it.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, requireCatalog } from './common.mjs';
import { registerSource, listSources } from '../sources/manifest.mjs';
import { readWorkbook, sheetColumns, detectLayout } from '../ingest/xlsx.mjs';
import { proposeProfile, workbookToContent } from '../ingest/xlsx-adapter.mjs';
import { docxToText } from '../ingest/docx.mjs';
import { proposeSectionMap, deckToContent } from '../ingest/deck-adapter.mjs';
import { htmlToBlocks, proposePlacement } from '../ingest/html.mjs';
import { readTsv } from '../ingest/tsv.mjs';
import { csvToSheet } from '../ingest/csv.mjs';
import { CSV_TAB } from './template.mjs';
import { loadSitemap, resolveLinks } from '../ingest/sitemap.mjs';
import { loadOverrides, applyOverrides } from '../decisions/register.mjs';
import { loadLedger, annotateImages } from '../media/ledger.mjs';
import { validateContent } from '../content/schema.mjs';
import { writeJson } from '../config/project.mjs';
import { sheetFingerprint, deckFingerprint, saveMapping, findMapping } from '../knowledge/mappings.mjs';
import { loadAdapters } from '../knowledge/adapters.mjs';

const OWNER = { 'missing-url': 'client', 'missing-image': 'client', 'pid-fix': 'client', 'suspect-link': 'client', 'char-limit': 'client', 'video-url': 'client', 'do-not-author': 'client', unmapped: 'dev', 'over-variant': 'dev', 'link-pending': 'dev', 'new-adapter': 'dev', confirm: 'us', 'dev-note': 'us', placeholder: 'us', hold: 'us', sensitive: 'us', other: 'us' };
const readJson = (f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '-');

export async function intakeCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const { catalog } = requireCatalog(ctx.cfg);
  const srcDir = path.resolve(ctx.projectDir, flags.sources && flags.sources !== true ? flags.sources : 'sources');
  const outDir = path.resolve(ctx.projectDir, flags.out && flags.out !== true ? flags.out : 'work');
  fs.mkdirSync(outDir, { recursive: true });
  const parentPath = flags['parent-path'] && flags['parent-path'] !== true ? flags['parent-path'] : ctx.cfg.project.homePath;
  const pageType = flags['page-type'] && flags['page-type'] !== true ? flags['page-type'] : null;
  const profile = flags.profile && flags.profile !== true ? readJson(flags.profile) : null;
  const sectionMap = flags['section-map'] && flags['section-map'] !== true ? readJson(flags['section-map']) : null;
  const sitemap = flags.sitemap && flags.sitemap !== true ? loadSitemap(path.resolve(flags.sitemap)) : null;
  const cm = flags.env && flags.env !== true ? ctx.cmFactory(flags.env) : null;
  const overrides = loadOverrides(ctx.projectDir);
  const ledger = loadLedger(ctx.projectDir);
  const registered = new Map(listSources(ctx.projectDir).map((s) => [s.file, s]));
  const files = fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter((f) => !f.startsWith('.') && !f.startsWith('~$')).sort() : [];
  const out = { sources: [], pages: 0, written: [], proposed: [], legacy: [], lists: [], byComponent: {}, flags: {}, questions: [], errors: [], mappings: [], adapters: [] };
  const contents = [];
  const loaded = await loadAdapters(ctx.projectDir);
  out.errors.push(...loaded.errors);
  const proposedProfiles = {}; const mergedMap = { sources: [], aliases: {}, fields: {}, childFields: {}, unmatched: [] };
  for (const f of files) {
    const abs = path.join(srcDir, f);
    const rel = path.relative(ctx.projectDir, abs).split(path.sep).join('/');
    const entry = registerSource({ projectDir: ctx.projectDir, file: abs, note: registered.get(rel)?.note || 'registered by intake', by: registered.get(rel)?.by || '' }); // re-hash: the file may have changed since registration
    out.sources.push(rel);
    const ext = path.extname(f).toLowerCase();
    try {
      if (ext === '.xlsx' || ext === '.csv') {
        const wb = ext === '.csv' ? { sheets: [csvToSheet(fs.readFileSync(abs, 'utf8'), { name: CSV_TAB })] } : readWorkbook(fs.readFileSync(abs));
        const sheet = wb.sheets[0];
        const fp = sheetFingerprint(sheet);
        let prof = profile ? (profile.sheet ? profile : profile[rel]) : null;
        if (profile && !prof) { out.errors.push(`${rel}: --profile has no entry for this file`); continue; }
        if (prof) { saveMapping(ctx.projectDir, { ...fp, sourceFile: rel, profile: prof }); out.mappings.push({ file: rel, fingerprint: fp.fingerprint, reused: false, saved: true }); }
        else {
          const known = findMapping(ctx.projectDir, fp.fingerprint);
          if (known) { prof = known.profile; out.mappings.push({ file: rel, fingerprint: fp.fingerprint, reused: true, confirmedAt: known.confirmedAt, from: known.sourceFile, provenance: known.provenance }); }
          else { const prop = proposeProfile(sheetColumns(sheet, fp.layout), catalog, { tab: sheet.name, layout: fp.layout, parentPath, pageType: pageType ? catalog.pageTypes[pageType] : null }); proposedProfiles[rel] = prop; out.mappings.push({ file: rel, fingerprint: fp.fingerprint, reused: false }); continue; }
        }
        const { contents: cs, inventory } = workbookToContent(wb, prof, { catalog, sourceFile: rel, sha256: entry.sha256, pageType });
        for (const [k, v] of Object.entries(inventory.byComponent)) out.byComponent[k] = (out.byComponent[k] || 0) + v;
        contents.push(...cs);
      } else if (ext === '.docx') {
        const text = docxToText(fs.readFileSync(abs));
        fs.writeFileSync(path.join(outDir, `${safe(path.basename(f, ext))}.txt`), text);
        const dfp = deckFingerprint(text);
        let map = sectionMap;
        if (!dfp.headers.length) { out.errors.push(`${rel}: no component headings found (lines like "Component: Hero"); this file is not a copy deck the tool can place, so its shape is not remembered`); continue; }
        if (map) { saveMapping(ctx.projectDir, { ...dfp, sourceFile: rel, profile: map }); out.mappings.push({ file: rel, kind: 'deck', fingerprint: dfp.fingerprint, reused: false, saved: true }); }
        else { const known = findMapping(ctx.projectDir, dfp.fingerprint); if (known) { map = known.profile; out.mappings.push({ file: rel, kind: 'deck', fingerprint: dfp.fingerprint, reused: true, confirmedAt: known.confirmedAt, from: known.sourceFile, provenance: known.provenance }); } else out.mappings.push({ file: rel, kind: 'deck', fingerprint: dfp.fingerprint, reused: false }); }
        if (!map) { const prop = proposeSectionMap(text, catalog); mergedMap.sources.push(rel); Object.assign(mergedMap.aliases, prop.aliases); for (const [k, v] of Object.entries(prop.fields)) mergedMap.fields[k] = { ...(mergedMap.fields[k] || {}), ...v }; for (const [k, v] of Object.entries(prop.childFields)) mergedMap.childFields[k] = { ...(mergedMap.childFields[k] || {}), ...v }; for (const u of prop.unmatched) if (!mergedMap.unmatched.includes(u)) mergedMap.unmatched.push(u); continue; }
        const slug = safe(path.basename(f, ext)).toLowerCase();
        contents.push(deckToContent(text, map, { catalog, pageType, targetPath: `${parentPath.replace(/\/$/, '')}/${slug}`, sourceFile: rel, sha256: entry.sha256 }));
      } else if (ext === '.html' || ext === '.htm') {
        const page = htmlToBlocks(fs.readFileSync(abs, 'utf8'));
        const rec = { file: rel, title: page.title, h1: page.h1, blocks: page.blocks.length, placement: sitemap ? proposePlacement({ title: page.title, h1: page.h1, url: '' }, [...sitemap.byPid.values()]) : [] };
        writeJson(path.join(outDir, 'legacy', `${safe(path.basename(f, ext))}.json`), { ...page, placement: rec.placement });
        out.legacy.push(rec);
        if (rec.placement.length) out.questions.push({ owner: 'us', text: `Confirm placement of legacy page "${page.title || f}": best guess ${rec.placement[0].pid} ${rec.placement[0].name} (${rec.placement[0].why})`, locator: rel });
      } else if (ext === '.tsv') {
        const rows = readTsv(fs.readFileSync(abs, 'utf8'));
        writeJson(path.join(outDir, 'lists', `${safe(path.basename(f, ext))}.json`), rows);
        out.lists.push({ file: rel, rows: rows.length });
      } else {
        const ad = loaded.adapters.find((a) => { try { return a.matches(abs) || a.matches(rel); } catch { return false; } });
        if (!ad) { out.errors.push(`${rel}: no adapter for ${ext || 'this file'}`); continue; }
        let res;
        try { res = await ad.read(abs, { catalog, rules: ctx.cfg.rules }); } catch (e) { out.errors.push(`${rel}: adapter ${ad.name} failed: ${e.message}`); continue; }
        out.adapters.push({ file: rel, adapter: ad.name });
        for (const p of res?.pages || []) {
          const shape = p && typeof p === 'object' && Array.isArray(p.components ?? []) && Array.isArray(p.flags ?? []) ? validateContent({ ...p, flags: p.flags || [], components: p.components || [], sources: [] }) : ['page is not an object with array components'];
          if (shape.length) { out.errors.push(`${rel}: adapter ${ad.name} produced invalid content for page ${p?.pageId ?? '(no pageId)'}: ${shape.join('; ')}`); continue; }
          p.flags = [...(p.flags || []), { kind: 'new-adapter', where: rel, text: `Read by project adapter ${ad.name}; a developer reviews ${path.relative(ctx.projectDir, ad.file)} before these pages are written` }];
          p.sources = [{ file: rel, sha256: entry.sha256 }];
          p.locators ||= {}; p.pageFields ||= {}; p.components ||= [];
          contents.push(p);
        }
      }
    } catch (e) { out.errors.push(`${rel}: ${e.message}`); }
  }
  if (Object.keys(proposedProfiles).length) { const pf = path.join(outDir, 'profile.proposed.json'); writeJson(pf, proposedProfiles); out.proposed.push(`${path.relative(ctx.projectDir, pf)} (profiles keyed by source file for ${Object.keys(proposedProfiles).join(', ')}; confirm, then rerun with --profile)`); }
  if (mergedMap.sources.length) { const sf = path.join(outDir, 'section-map.proposed.json'); writeJson(sf, mergedMap); out.proposed.push(`${path.relative(ctx.projectDir, sf)} (merged from ${mergedMap.sources.length} deck(s); confirm, then rerun with --section-map)`); }
  const seenIds = new Map();
  for (let c of contents) {
    const base = String(c.pageId); const n = (seenIds.get(base) || 0) + 1; seenIds.set(base, n);
    if (n > 1) { out.errors.push(`${c.sources?.[0]?.file}: duplicate pageId "${base}"; written as ${base}-${n}`); c.pageId = `${base}-${n}`; c.flags.push({ kind: 'confirm', where: c.sources?.[0]?.file || '', text: `Duplicate page id ${base}; this file was renamed ${base}-${n}` }); }
    c = applyOverrides(c, overrides);
    for (const u of c.unmatchedOverrides || []) out.errors.push(`${c.pageId}: override locator ${u} matched nothing`);
    if (sitemap && cm) c = await resolveLinks(c, { sitemap, cm, homePath: ctx.cfg.project.homePath, ownHosts: ctx.cfg.project.ownHosts || [] });
    if (flags.env && flags.env !== true) c = annotateImages(c, ledger, flags.env);
    const errors = validateContent(c, catalog);
    if (errors.length) c.flags.push({ kind: 'other', where: c.pageId, text: `Validation: ${errors.join('; ')}` });
    for (const fl of c.flags) { out.flags[fl.kind] = (out.flags[fl.kind] || 0) + 1; out.questions.push({ owner: OWNER[fl.kind] || 'us', page: c.pageId, text: `${c.pageId}: ${fl.text}`, locator: fl.where }); }
    for (const comp of c.components) if (comp.type !== 'other') out.byComponent[comp.type] = (out.byComponent[comp.type] || 0) + (c.sources?.[0]?.file?.endsWith('.xlsx') ? 0 : 1);
    const file = path.join(outDir, `${safe(c.pageId)}.json`);
    writeJson(file, c); out.written.push(path.relative(ctx.projectDir, file)); out.pages++;
  }
  out.questions.sort((a, b) => ['client', 'dev', 'us'].indexOf(a.owner) - ['client', 'dev', 'us'].indexOf(b.owner));
  writeJson(path.join(outDir, 'inventory.json'), { generatedAt: new Date().toISOString(), ...out });
  return emit(ctx, out);
}
