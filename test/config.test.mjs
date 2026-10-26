import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProject, validateProject, DEFAULT_RULES, writeJson } from '../plugin/engine/lib/config/project.mjs';

const mk = (project, rules) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-cfg-')); fs.mkdirSync(path.join(d, '.content-ops')); if (project) writeJson(path.join(d, '.content-ops/project.json'), project); if (rules) writeJson(path.join(d, '.content-ops/rules.json'), rules); return d; };
const good = { name: 'demo', siteRoot: '/sitecore/content/Demo/Site', homePath: '/sitecore/content/Demo/Site/Home', environments: [{ name: 'dev', siteUrl: 'https://dev.example.org' }] };

test('loadProject merges default rules and defaults blueprintRoot', () => {
  const p = loadProject(mk(good));
  assert.equal(p.project.name, 'demo');
  assert.equal(p.project.blueprintRoot, '/sitecore/content/Demo/Site/Home/_blueprints');
  assert.deepEqual(p.rules.themes.alternate, DEFAULT_RULES.themes.alternate);
  assert.equal(p.catalog, null);
  assert.deepEqual(p.decisions, []);
});
test('rules.json overrides only the keys it sets', () => {
  const p = loadProject(mk(good, { themes: { alternate: ['A', 'B'] } }));
  assert.deepEqual(p.rules.themes.alternate, ['A', 'B']);
  assert.deepEqual(p.rules.themes.pinned, {});
  assert.equal(p.rules.dataFolder, 'Data');
});
test('an invalid project.json throws listing the missing keys', () => {
  assert.deepEqual(validateProject({ name: 'x' }).filter((e) => /environments/.test(e)).length, 1);
  assert.throws(() => loadProject(mk({ name: 'x' })), /environments/);
});
