import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJson, loadProject, DEFAULT_RULES } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { rulesCommand } from '../plugin/engine/lib/cli/rules.mjs';
import { setRule, loadRuleOverrides } from '../plugin/engine/lib/knowledge/rules.mjs';

const H = '/sitecore/content/DemoSite/Demo/Home';
async function project() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-kr-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  return projectDir;
}
test('legacy rules.json still applies and reads as project provenance', async () => {
  const projectDir = await project();
  writeJson(path.join(projectDir, '.content-ops', 'rules.json'), { placeholders: ['COPY TK'] });
  const cfg = loadProject(projectDir);
  assert.deepEqual(cfg.rules.placeholders, ['COPY TK']);
  assert.equal(cfg.ruleSources.placeholders.provenance, 'project'); assert.equal(cfg.ruleSources.placeholders.since, null);
  assert.equal(cfg.ruleSources.dataFolder.provenance, 'default');
});
test('setRule writes knowledge/rules.json with provenance; merged loses to project; dotted keys work', async () => {
  const projectDir = await project();
  fs.rmSync(path.join(projectDir, '.content-ops', 'rules.json'), { force: true });
  setRule(projectDir, 'themes.alternate', ['ThemesWhite', 'ThemesSand'], { provenance: 'merged', from: 'other-project' });
  setRule(projectDir, 'planMaxAgeHours', 24, { why: 'long review cycles' });
  let cfg = loadProject(projectDir);
  assert.deepEqual(cfg.rules.themes.alternate, ['ThemesWhite', 'ThemesSand']); assert.deepEqual(cfg.rules.themes.pinned, {});
  assert.equal(cfg.ruleSources['themes.alternate'].provenance, 'merged'); assert.equal(cfg.ruleSources['themes.alternate'].from, 'other-project');
  assert.equal(cfg.rules.planMaxAgeHours, 24); assert.equal(cfg.ruleSources.planMaxAgeHours.why, 'long review cycles');
  setRule(projectDir, 'themes.alternate', ['ThemesWhite'], { why: 'client only has white' });
  cfg = loadProject(projectDir);
  assert.deepEqual(cfg.rules.themes.alternate, ['ThemesWhite']); assert.equal(cfg.ruleSources['themes.alternate'].provenance, 'project');
  assert.equal(loadRuleOverrides(projectDir).sources['themes.alternate'].why, 'client only has white');
});
test('rules list prints every effective rule with provenance; rules set validates JSON and needs --why', async () => {
  const projectDir = await project();
  const out = await rulesCommand(['list'], { projectDir, print: false });
  const ph = out.rules.find((r) => r.key === 'placeholders');
  assert.deepEqual(ph.value, DEFAULT_RULES.placeholders); assert.equal(ph.provenance, 'default');
  await assert.rejects(rulesCommand(['set', 'placeholders', '["a"]'], { projectDir, print: false }), /--why/);
  await assert.rejects(rulesCommand(['set', 'placeholders', 'not json', '--why', 'x'], { projectDir, print: false }), /JSON/);
  const set = await rulesCommand(['set', 'placeholders', '["COPY TK"]', '--why', 'client wording'], { projectDir, print: false });
  assert.equal(set.provenance, 'project');
  const again = await rulesCommand(['list'], { projectDir, print: false });
  assert.deepEqual(again.rules.find((r) => r.key === 'placeholders').value, ['COPY TK']);
  assert.match(again.rules.find((r) => r.key === 'placeholders').why, /client wording/);
});
