import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { intakeCommand } from '../plugin/engine/lib/cli/intake.mjs';
import { mappingsCommand } from '../plugin/engine/lib/cli/mappings.mjs';
import { readWorkbook } from '../plugin/engine/lib/ingest/xlsx.mjs';
import { sheetFingerprint, saveMapping, findMapping, listMappings, forgetMapping } from '../plugin/engine/lib/knowledge/mappings.mjs';
import { catalog } from './_catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const H = '/sitecore/content/DemoSite/Demo/Home';
async function project() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-km-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), catalog);
  fs.copyFileSync(path.join(here, 'fixtures/workbook.xlsx'), path.join(projectDir, 'sources', 'workbook.xlsx'));
  return projectDir;
}

test('sheetFingerprint reads the header row the layout detector picks', () => {
  const wb = readWorkbook(fs.readFileSync(path.join(here, 'fixtures/workbook.xlsx')));
  const fp = sheetFingerprint(wb.sheets[0]);
  assert.match(fp.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(fp.headers.length > 2);
  assert.equal(fp.tab, wb.sheets[0].name);
});
test('save, find, list, forget', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-km2-'));
  const file = saveMapping(p, { fingerprint: 'f'.repeat(64), headers: ['a', 'b'], tab: 'T', sourceFile: 'sources/x.xlsx', profile: { sheet: {}, columns: {} } });
  assert.ok(fs.existsSync(file));
  const rec = findMapping(p, 'f'.repeat(64));
  assert.equal(rec.provenance, 'project'); assert.equal(rec.sourceFile, 'sources/x.xlsx'); assert.ok(rec.confirmedAt);
  assert.equal(listMappings(p).length, 1);
  assert.equal(forgetMapping(p, 'f'.repeat(64)), true);
  assert.equal(findMapping(p, 'f'.repeat(64)), null);
  assert.equal(forgetMapping(p, 'f'.repeat(64)), false);
});
test('intake saves a confirmed profile and reuses it next time without --profile', async () => {
  const projectDir = await project();
  const first = await intakeCommand(['--parent-path', `${H}/locations`, '--page-type', 'generalLanding'], { projectDir, print: false });
  assert.ok(first.proposed.some((p) => /profile/.test(p)));
  assert.equal(first.mappings[0].reused, false);
  const second = await intakeCommand(['--parent-path', `${H}/locations`, '--page-type', 'generalLanding', '--profile', path.join(projectDir, 'work', 'profile.proposed.json')], { projectDir, print: false });
  assert.ok(second.pages > 0);
  assert.equal(listMappings(projectDir).length, 1);
  const third = await intakeCommand(['--parent-path', `${H}/locations`, '--page-type', 'generalLanding'], { projectDir, print: false });
  assert.equal(third.pages, second.pages, 'reused mapping produced the same pages');
  assert.equal(third.proposed.length, 0);
  assert.equal(third.mappings[0].reused, true);
  assert.ok(third.mappings[0].confirmedAt);
  const list = await mappingsCommand(['list'], { projectDir, print: false });
  assert.equal(list.mappings.length, 1); assert.equal(list.mappings[0].columns > 0, true);
  const gone = await mappingsCommand(['forget', list.mappings[0].fingerprint], { projectDir, print: false });
  assert.equal(gone.forgotten, true);
  const fourth = await intakeCommand(['--parent-path', `${H}/locations`, '--page-type', 'generalLanding'], { projectDir, print: false });
  assert.ok(fourth.proposed.length > 0, 'forgotten mapping proposes again');
});
