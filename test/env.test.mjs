import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnvFile, resolveEnv, describeEnv } from '../plugin/engine/lib/client/env.mjs';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-home-'));
const dir = path.join(home, '.content-ops', 'demo');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'dev.env'), 'export SITECORE_API_HOST="xmc-demo-dev.sitecorecloud.io/"\nSITECORE_CLIENT_ID=id1\n# comment\nSITECORE_CLIENT_SECRET=\'s3cret\'\n');
fs.writeFileSync(path.join(dir, 'prod.env'), 'SITECORE_API_HOST=https://xmc-demo-prod.sitecorecloud.io\nSITECORE_CLIENT_ID=id2\nSITECORE_CLIENT_SECRET=s2\n');
fs.writeFileSync(path.join(dir, 'half.env'), 'SITECORE_API_HOST=https://x.y\n');
test.after(() => fs.rmSync(home, { recursive: true, force: true }));

test('parseEnvFile handles export, quotes and comments', () => {
  const v = parseEnvFile(path.join(dir, 'dev.env'));
  assert.equal(v.SITECORE_API_HOST, 'xmc-demo-dev.sitecorecloud.io/');
  assert.equal(v.SITECORE_CLIENT_SECRET, 's3cret');
});
test('resolveEnv normalises the host into an https endpoint without a double slash', () => {
  const e = resolveEnv({ name: 'dev', project: 'demo', home });
  assert.equal(e.host, 'xmc-demo-dev.sitecorecloud.io');
  assert.equal(e.endpoint, 'https://xmc-demo-dev.sitecorecloud.io/sitecore/api/authoring/graphql/v1');
  assert.equal(e.isProd, false);
});
test('resolveEnv flags prod by host or name', () => {
  assert.equal(resolveEnv({ name: 'prod', project: 'demo', home }).isProd, true);
});
test('resolveEnv refuses a file inside a repo root', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-repo-'));
  const f = path.join(repo, 'dev.env'); fs.writeFileSync(f, 'SITECORE_API_HOST=https://a.b\nSITECORE_CLIENT_ID=1\nSITECORE_CLIENT_SECRET=2\n');
  assert.throws(() => resolveEnv({ name: 'dev', project: 'demo', file: f, repoRoots: [repo] }), (err) => err.code === 'inside-repo');
});
test('resolveEnv reports an incomplete file without the secret', () => {
  assert.throws(() => resolveEnv({ name: 'half', project: 'demo', home }), (err) => err.code === 'incomplete' && !/s3cret|s2/.test(err.message));
});
test('describeEnv never carries the secret', () => {
  const d = describeEnv(resolveEnv({ name: 'dev', project: 'demo', home }));
  assert.deepEqual(Object.keys(d).sort(), ['file', 'host', 'isProd', 'name']);
});
