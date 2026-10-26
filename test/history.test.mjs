import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { historyCommand } from '../plugin/engine/lib/cli/history.mjs';

test('history lists written pages from journals, newest last, filtered by env and page', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-hist-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/s', homePath: '/s/Home', environments: [{ name: 'dev' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  const j = (run, applyId, key, status, at, env = 'dev') => writeJson(path.join(projectDir, 'runs', run, 'journal', `${applyId}_${key}.json`), { key, itemId: 'i', env, applyId, status, finishedAt: at, steps: [] });
  j('r1_dev_plan', 'a1', 'p1', 'done', '2026-10-19T10:00:00Z'); j('r2_dev_plan', 'a2', 'p1', 'rolled-back', '2026-10-19T11:00:00Z'); j('r2_dev_plan', 'a2', 'p2', 'done', '2026-10-19T11:01:00Z'); j('r3_qa_plan', 'a3', 'p1', 'done', '2026-10-19T12:00:00Z', 'qa');
  const all = await historyCommand(['--env', 'dev'], { projectDir, print: false });
  assert.deepEqual(all.entries.map((e) => `${e.key}:${e.status}`), ['p1:done', 'p1:rolled-back', 'p2:done']);
  const one = await historyCommand(['--env', 'dev', '--page', 'p2'], { projectDir, print: false });
  assert.equal(one.entries.length, 1);
});
