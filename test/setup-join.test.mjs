import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { checkCommand } from '../plugin/engine/lib/cli/check.mjs';

const H = '/sitecore/content/DemoSite/Demo/Home';
async function joinedRepo({ gitignore = 'sources/\nwork/\nruns/\n' } = {}) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-join-'));
  execFileSync('git', ['init', '-q'], { cwd: projectDir });
  writeJson(path.join(projectDir, 'answers.json'), { name: 'demo', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'dev', siteUrl: 'https://dev.example' }, { name: 'qa' }, { name: 'prod' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), { generatedAt: '2026-10-21T00:00:00Z', pageTypes: { a: {}, b: {} }, components: { x: {}, y: {}, z: {} } });
  if (gitignore !== null) fs.writeFileSync(path.join(projectDir, '.gitignore'), gitignore);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-join-home-'));
  return { projectDir, home };
}

test('join writes empty placeholders for non-prod envs only, mode 600, and check reads them as incomplete', async () => {
  const { projectDir, home } = await joinedRepo();
  const out = await setupCommand(['join'], { projectDir, home, print: false, env: {} });
  const dir = path.join(home, '.content-ops', 'demo');
  assert.equal(out.project, 'demo'); assert.equal(out.credentialsDir, dir);
  const by = Object.fromEntries(out.environments.map((e) => [e.name, e]));
  assert.equal(by.dev.status, 'placeholder-created'); assert.equal(by.qa.status, 'placeholder-created');
  assert.equal(by.prod.status, 'skipped-production'); assert.ok(!fs.existsSync(path.join(dir, 'prod.env')));
  const text = fs.readFileSync(path.join(dir, 'dev.env'), 'utf8');
  assert.match(text, /^SITECORE_API_HOST=$/m); assert.match(text, /^SITECORE_CLIENT_SECRET=$/m); assert.match(text, /Never paste/); assert.match(text, /^SITECORE_EDGE_CONTEXT_ID=$/m);
  assert.equal(fs.statSync(path.join(dir, 'dev.env')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  assert.equal((await checkCommand(['--project', 'demo', '--env', 'dev', '--offline'], { home })).credentials, 'incomplete');
  assert.deepEqual(out.catalog, { pageTypes: 2, components: 3, generatedAt: '2026-10-21T00:00:00Z' });
  assert.equal('role' in out, false); assert.ok(out.engine.path.endsWith('engine/bin/content-ops.mjs') && fs.existsSync(out.engine.path)); assert.equal(out.engine.nodeOk, true);
  assert.ok(out.next.some((l) => l.includes('dev.env')));
});

test('join never overwrites a filled file, reports it ok, and is safe to run twice', async () => {
  const { projectDir, home } = await joinedRepo();
  const dir = path.join(home, '.content-ops', 'demo'); fs.mkdirSync(dir, { recursive: true });
  const filled = 'SITECORE_API_HOST=https://xmc.example\nSITECORE_CLIENT_ID=id\nSITECORE_CLIENT_SECRET=s3cret\n';
  fs.writeFileSync(path.join(dir, 'dev.env'), filled, { mode: 0o600 });
  const a = await setupCommand(['join'], { projectDir, home, print: false, env: {} });
  const b = await setupCommand(['join'], { projectDir, home, print: false, env: {} });
  assert.equal(fs.readFileSync(path.join(dir, 'dev.env'), 'utf8'), filled);
  assert.equal(a.environments.find((e) => e.name === 'dev').status, 'ok');
  assert.equal(b.environments.find((e) => e.name === 'qa').status, 'empty');
  assert.ok(!JSON.stringify(a).includes('s3cret'));
});

test('join --prod adds the production placeholder; gitignore gaps are reported', async () => {
  const { projectDir, home } = await joinedRepo({ gitignore: '.content-ops/sources/\n' });
  const out = await setupCommand(['join', '--prod'], { projectDir, home, print: false, env: { CONTENT_OPS_BIN: '/nope/content-ops.mjs' } });
  assert.equal(out.environments.find((e) => e.name === 'prod').status, 'placeholder-created');
  assert.ok(!out.next.some((l) => /CONTENT_OPS_BIN/.test(l)));
  assert.deepEqual(out.gitignore.missing, ['sources/', 'work/', 'runs/']);
  assert.ok(out.next.some((l) => /\.gitignore/.test(l)));
});

test('join refuses a folder that was never set up; --answers refuses to overwrite an existing project.json', async () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-join-bare-'));
  await assert.rejects(setupCommand(['join'], { projectDir: bare, home: bare, print: false, env: {} }), /not set up|set up content ops here/);
  const { projectDir } = await joinedRepo();
  await assert.rejects(setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false }), /already set up.*--force|--force/);
  await setupCommand(['--answers', path.join(projectDir, 'answers.json'), '--force'], { projectDir, print: false });
});
