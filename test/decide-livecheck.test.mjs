import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { decideCommand } from '../plugin/engine/lib/cli/decide.mjs';
import { liveCheckCommand } from '../plugin/engine/lib/cli/live-check.mjs';

const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-dl-'));
test.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));
test('decide appends to the register and lists it', async () => {
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/s', homePath: '/s/Home', environments: [{ name: 'fake', siteUrl: 'https://site.example.org' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  const d = await decideCommand(['--scope', 'themes', '--decision', 'alternate', '--reason', 'design', '--who', 'ann'], { projectDir, print: false });
  assert.equal(d.id, 'D-1');
  const list = await decideCommand(['list'], { projectDir, print: false });
  assert.equal(list.decisions.length, 1);
  await assert.rejects(decideCommand(['--scope', 'x'], { projectDir, print: false }), /usage/);
});
test('live-check fetches each path on the env site url, sequentially, and reports status, cache headers and expected text', async () => {
  const seen = [];
  const fetchImpl = async (url) => { seen.push(url); const ok = /\/good$/.test(url); return { status: ok ? 200 : 404, headers: new Map([['x-vercel-cache', ok ? 'MISS' : 'HIT'], ['age', ok ? '0' : '900']]), text: async () => (ok ? '<html><h1>Good page</h1></html>' : 'not found') }; };
  const out = await liveCheckCommand(['--env', 'fake', '--paths', '/good,/bad', '--expect', 'Good page'], { projectDir, fetchImpl, sleep: async () => {}, print: false });
  assert.deepEqual(seen, ['https://site.example.org/good', 'https://site.example.org/bad']);
  assert.equal(out.pages[0].status, 200); assert.equal(out.pages[0].h1, 'Good page'); assert.equal(out.pages[0].expected, true);
  assert.equal(out.pages[1].status, 404); assert.equal(out.pages[1].cache, 'HIT'); assert.match(out.pages[1].note, /cached 404/i);
  assert.equal(out.ok, 1);
});
