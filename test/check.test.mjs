import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkCommand } from '../plugin/engine/lib/cli/check.mjs';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-check-'));
fs.mkdirSync(path.join(home, '.content-ops', 'demo'), { recursive: true });
fs.writeFileSync(path.join(home, '.content-ops', 'demo', 'dev.env'), 'SITECORE_API_HOST=https://h\nSITECORE_CLIENT_ID=i\nSITECORE_CLIENT_SECRET=s\n');
test.after(() => fs.rmSync(home, { recursive: true, force: true }));

test('check reports env and credentials without printing the secret', async () => {
  const out = await checkCommand(['--project', 'demo', '--env', 'dev', '--offline'], { home });
  assert.equal(out.env.host, 'h');
  assert.equal('role' in out, false);
  assert.equal(out.credentials, 'ok');
  assert.equal(out.connection, 'skipped');
  assert.ok(!JSON.stringify(out).includes('"s"'));
});
test('check reports a missing credentials file as missing, not as a crash', async () => {
  const out = await checkCommand(['--project', 'demo', '--env', 'prod', '--offline'], { home });
  assert.equal(out.credentials, 'missing');
  assert.equal(out.env.isProd, true);
});
test('check tests the connection with one read query', async () => {
  const fetchImpl = async (url) => ({ status: 200, json: async () => (/oauth/.test(url) ? { access_token: 't', expires_in: 60 } : { data: { item: { name: 'sitecore' } } }) });
  const out = await checkCommand(['--project', 'demo', '--env', 'dev'], { home, fetchImpl });
  assert.equal(out.connection, 'ok');
});
test('check in a project folder reads the home page and takes the project name from project.json', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-check-proj-'));
  fs.mkdirSync(path.join(projectDir, '.content-ops'));
  fs.writeFileSync(path.join(projectDir, '.content-ops', 'project.json'), JSON.stringify({ name: 'demo', siteRoot: '/s', homePath: '/s/Home', environments: [{ name: 'dev' }] }));
  let asked;
  const fetchImpl = async (url, init) => { if (/oauth/.test(url)) return { status: 200, json: async () => ({ access_token: 't', expires_in: 60 }) }; asked = JSON.parse(init.body).variables; return { status: 200, json: async () => ({ data: { item: { name: 'Home', path: '/s/Home' } } }) }; };
  const out = await checkCommand(['--env', 'dev'], { home, fetchImpl, projectDir });
  assert.equal(out.project, 'demo'); assert.equal(asked.p, '/s/Home');
  assert.deepEqual(out.home, { name: 'Home', path: '/s/Home' }); assert.equal(out.connection, 'ok');
});
