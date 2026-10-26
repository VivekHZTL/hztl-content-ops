import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTemplate } from '../plugin/engine/lib/template/intake-sheet.mjs';
import { templateCommand } from '../plugin/engine/lib/cli/template.mjs';
import { intakeCommand } from '../plugin/engine/lib/cli/intake.mjs';
import { readWorkbook, detectLayout, sheetColumns, numToCol } from '../plugin/engine/lib/ingest/xlsx.mjs';
import { writeWorkbook } from '../plugin/engine/lib/ingest/xlsx-write.mjs';
import { proposeProfile } from '../plugin/engine/lib/ingest/xlsx-adapter.mjs';
import { listMappings } from '../plugin/engine/lib/knowledge/mappings.mjs';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { catalog as base } from './_catalog.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));
const H = '/sitecore/content/DemoSite/Demo/Home';
const cat = clone(base); cat.pageTypes.generalLanding.layout = ['hero', 'accordion', 'richText'];
async function project(c = cat) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-tpl-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), c);
  return projectDir;
}
const toSheet = (t) => ({ name: t.tab, rows: Object.fromEntries(t.rows.map((r, i) => [i + 1, Object.fromEntries(r.map((v, j) => [numToCol(j + 1), v]).filter(([, v]) => v !== null && v !== ''))])), merges: [], links: {}, maxRow: 3, maxCol: t.rows[1].length });

test('buildTemplate lays out Page, components in layout order, link URL pairs and numbered children', () => {
  const t = buildTemplate(cat, 'generalLanding', { children: 2 });
  assert.equal(t.tab, 'General Landing Page');
  assert.deepEqual(t.rows[0].slice(0, 3), ['Page', null, 'Hero']);
  assert.deepEqual(t.rows[1].slice(0, 6), ['Slug', 'pageTitle', 'title', 'tagline', 'cta', 'cta URL']);
  assert.ok(t.rows[1].includes('Item 1 heading') && t.rows[1].includes('Item 2 content'));
  assert.equal(t.rows[2][0], null, 'example row has no key so it is not a record');
  assert.equal(t.rows[2][1], '[Single-Line Text]'); assert.equal(t.rows[2][5], '[General Link: url]');
  assert.equal(t.rows[0][t.rows[1].lastIndexOf('title')], 'Accordion', 'the accordion title column starts the Accordion group');
  assert.equal(t.rows[0][t.rows[1].indexOf('Item 1 heading')], null, 'children sit inside the parent group, no new group header');
  assert.ok(t.readme.length > 3);
});
test('a component with no fields is skipped with a note; unknown page type throws', () => {
  const c = clone(cat); c.components.spacer = { name: 'Spacer', renderingId: '5'.repeat(32), ph: 'main', themed: false, params: '', fields: [], children: [], parent: null, childPh: null, dsTemplateId: null }; c.pageTypes.generalLanding.layout.push('spacer');
  const t = buildTemplate(c, 'generalLanding');
  assert.deepEqual(t.skipped, [{ key: 'spacer', why: 'no fields; it is placed by the planner without a datasource' }]);
  assert.throws(() => buildTemplate(cat, 'nope'), /page type/);
});
test('the generated sheet maps back exact on every column through proposeProfile', () => {
  const t = buildTemplate(cat, 'generalLanding');
  const sheet = toSheet(t);
  const layout = detectLayout(sheet);
  assert.equal(layout.headerRow, 2); assert.equal(layout.keyColumn, 'A');
  const prof = proposeProfile(sheetColumns(sheet, layout), cat, { tab: t.tab, layout, parentPath: H, pageType: cat.pageTypes.generalLanding });
  const cols = Object.values(prof.columns);
  assert.ok(cols.every((c) => c.confidence === 'exact'), JSON.stringify(Object.entries(prof.columns).filter(([, c]) => c.confidence !== 'exact')));
  assert.equal(prof.columns.B.target, 'page.pageTitle');
  assert.equal(prof.columns.F.target, 'pair'); assert.equal(prof.columns.E.pair, 'F');
  assert.equal(prof.columns.G.target, 'component.accordion.title');
  assert.equal(prof.columns.H.target, 'child.accordionItem.1.heading');
});
test('template command writes xlsx, registers a template mapping, and intake reads a filled copy with no confirmation', async () => {
  const projectDir = await project();
  const out = await templateCommand(['--page-type', 'generalLanding'], { projectDir, print: false });
  assert.equal(out.mappedOther, 0); assert.ok(out.file.endsWith('template-generalLanding.xlsx'));
  const maps = listMappings(projectDir); assert.equal(maps.length, 1); assert.equal(maps[0].provenance, 'template');
  const wb = readWorkbook(fs.readFileSync(out.file));
  const hdr = wb.sheets[0];
  const n = hdr.maxCol;
  const groups = Array.from({ length: n }, (_, i) => hdr.rows[1]?.[numToCol(i + 1)] ?? null);
  const headers = Array.from({ length: n }, (_, i) => hdr.rows[2]?.[numToCol(i + 1)] ?? null);
  const row = headers.map((h) => (h === 'Slug' ? 'north' : h === 'pageTitle' ? 'North' : h === 'title' ? 'Welcome' : h === 'cta' ? 'Call' : h === 'cta URL' ? 'tel:+15555550100' : ''));
  fs.rmSync(out.file);
  fs.writeFileSync(path.join(projectDir, 'sources', 'client.xlsx'), writeWorkbook({ sheets: [{ name: hdr.name, rows: [groups, headers, row] }] }));
  const intake = await intakeCommand(['--parent-path', H, '--page-type', 'generalLanding'], { projectDir, print: false });
  assert.equal(intake.pages, 1, JSON.stringify(intake));
  assert.equal(intake.mappings[0].reused, true); assert.equal(intake.mappings[0].provenance, 'template');
  const north = JSON.parse(fs.readFileSync(path.join(projectDir, 'work', 'north.json'), 'utf8'));
  assert.equal(north.pageFields.pageTitle, 'North'); assert.deepEqual(north.components[0].fields.cta, { text: 'Call', url: 'tel:+15555550100' });
});
test('template --format csv writes csv; intake reads .csv through the same path', async () => {
  const projectDir = await project();
  const out = await templateCommand(['--page-type', 'generalLanding', '--format', 'csv', '--out', 'sources/t.csv'], { projectDir, print: false });
  assert.ok(out.file.endsWith('t.csv'));
  const text = fs.readFileSync(out.file, 'utf8').split('\r\n');
  const headers = text[1].split(',');
  const row = headers.map((h) => (h === 'Slug' ? 'south' : h === 'title' ? 'Hello' : ''));
  fs.writeFileSync(out.file, [text[0], text[1], row.join(',')].join('\r\n') + '\r\n');
  const intake = await intakeCommand(['--parent-path', H, '--page-type', 'generalLanding'], { projectDir, print: false });
  assert.equal(intake.pages, 1, JSON.stringify(intake.errors));
  assert.equal(intake.mappings[0].reused, true);
});
test('template refuses a components list that is not on the page type', async () => {
  const projectDir = await project();
  await assert.rejects(templateCommand(['--page-type', 'generalLanding', '--components', 'hero,nope'], { projectDir, print: false }), /nope/);
});
