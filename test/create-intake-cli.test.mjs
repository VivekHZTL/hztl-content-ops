import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { createCommand } from '../plugin/engine/lib/cli/create.mjs';
import { intakeCommand } from '../plugin/engine/lib/cli/intake.mjs';
import { catalog } from './_catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const H = '/sitecore/content/DemoSite/Demo/Home';
async function project() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-ci-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), catalog);
  return projectDir;
}
test('create makes shells for no-match pages whose content says mode create, journals them', async () => {
  const projectDir = await project();
  const items = { ['h'.repeat(32)]: { id: 'h'.repeat(32), name: 'Home', path: H, templateId: 't', templateName: 'T', parentId: '', version: 1, fields: {} }, ['l'.repeat(32)]: { id: 'l'.repeat(32), name: 'locations', path: `${H}/locations`, templateId: 't', templateName: 'T', parentId: 'h'.repeat(32), version: 1, fields: {} } };
  const cm = fakeCm({ items, env: 'fake' });
  const runDir = path.join(projectDir, 'runs', 'r1_fake_plan'); fs.mkdirSync(runDir, { recursive: true });
  writeJson(path.join(runDir, 'plan.json'), { runId: 'r1_fake_plan', env: 'fake', createdAt: new Date().toISOString(), sources: [], pages: [
    { key: 'north', status: 'no-match', content: { pageId: 'north', pageType: 'generalLanding', target: { path: `${H}/locations/north-clinic`, mode: 'create' }, pageFields: { pageTitle: 'North' }, components: [] } },
    { key: 'skip', status: 'no-match', content: { pageId: 'skip', pageType: 'generalLanding', target: { path: `${H}/locations/skip`, mode: 'update' }, components: [] } },
  ] });
  await assert.rejects(createCommand(['--run', 'r1_fake_plan'], { projectDir, cmFactory: () => cm, print: false }), /confirm/);
  const out = await createCommand(['--run', 'r1_fake_plan', '--confirm', 'fake'], { projectDir, cmFactory: () => cm, print: false });
  assert.equal(out.created.length, 1); assert.equal(out.skipped.length, 1);
  assert.ok(await cm.getItem({ path: `${H}/locations/north-clinic` }));
  assert.ok(fs.readdirSync(path.join(runDir, 'journal')).some((f) => /^create-/.test(f)));
});
test('intake proposes mappings on the first run, then writes content and an inventory with owner questions', async () => {
  const projectDir = await project();
  fs.copyFileSync(path.join(here, 'fixtures/workbook.xlsx'), path.join(projectDir, 'sources', 'workbook.xlsx'));
  fs.copyFileSync(path.join(here, 'fixtures/deck.docx'), path.join(projectDir, 'sources', 'deck.docx'));
  const first = await intakeCommand(['--parent-path', `${H}/locations`, '--page-type', 'generalLanding'], { projectDir, print: false });
  assert.ok(first.proposed.some((p) => /profile/.test(p)) && first.proposed.some((p) => /section-map/.test(p)));
  assert.ok(fs.existsSync(path.join(projectDir, 'work', 'profile.proposed.json')));
  assert.equal(first.pages, 0);
  const second = await intakeCommand(['--parent-path', `${H}/locations`, '--page-type', 'generalLanding', '--profile', path.join(projectDir, 'work', 'profile.proposed.json'), '--section-map', path.join(projectDir, 'work', 'section-map.proposed.json')], { projectDir, print: false });
  assert.equal(second.pages, 3, JSON.stringify(second));
  const inv = JSON.parse(fs.readFileSync(path.join(projectDir, 'work', 'inventory.json'), 'utf8'));
  assert.ok(inv.questions.some((q) => q.owner === 'client' && /URL|url/.test(q.text)));
  assert.ok(inv.questions.some((q) => q.owner === 'dev' && /Mystery/.test(q.text)));
  assert.ok(fs.existsSync(path.join(projectDir, 'work', 'north-clinic.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(projectDir, '.content-ops', 'sources.json'), 'utf8')).sources.length, 2);
});
