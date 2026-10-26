// Tests added from the phase-D review.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { snapshotCommand } from '../plugin/engine/lib/cli/snapshot.mjs';
import { fakeCm, itemsFromSnapshot } from '../plugin/engine/lib/cm/fake.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugin = path.join(root, 'plugin');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-hook2-'));
fs.mkdirSync(path.join(home, '.content-ops', 'demo'), { recursive: true });
const run = (script, input, _unused, extraEnv = {}) => {
  return spawnSync(path.join(plugin, 'scripts', script), [], { input, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: home, CONTENT_OPS_HOME: path.join(home, '.content-ops'), ...extraEnv } });
};
const cmd = (c) => JSON.stringify({ tool_name: 'Bash', tool_input: { command: c } });

test('C1: hooks work with no node on PATH', () => {
  const r = run('safety-guard.sh', cmd('dotnet sitecore ser push'));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const w = run('write-confirm.sh', cmd('node bin/content-ops.mjs apply --run r --confirm dev'));
  assert.equal(w.status, 0);
  assert.equal(JSON.parse(w.stdout).hookSpecificOutput.permissionDecision, 'ask');
});
test('I4: --prod passes the guard; the engine and write-confirm handle production', () => {
  assert.equal(run('safety-guard.sh', cmd('node bin/content-ops.mjs apply --run r --confirm prod --prod')).status, 0);
});
test('I6: write-confirm catches writes through $CONTENT_OPS_BIN and skips publish --dry', () => {
  const r = run('write-confirm.sh', cmd('node "$CONTENT_OPS_BIN" publish --run r --confirm production --prod'), 'dev');
  const j = JSON.parse(r.stdout); assert.equal(j.hookSpecificOutput.permissionDecision, 'ask'); assert.match(j.hookSpecificOutput.permissionDecisionReason, /production/);
  const d = run('write-confirm.sh', cmd('node bin/content-ops.mjs publish --run r --confirm dev --dry'), 'dev');
  assert.equal(d.stdout.trim(), '');
});
test('I9: snapshot command writes a read-only page snapshot for review', async () => {
  const snap0 = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/page-snapshot.json'), 'utf8'));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-snap-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: '/sitecore/content/DemoSite/Demo/Home', environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  const xml = snap0.page.fields['__Final Renderings'].value; const device = xml.match(/<d\s[^>]*id="([^"]+)"/)[1];
  const ids = [...new Set([...xml.matchAll(/s:id="\{([^}]+)\}"/g)].map((m) => m[1].replace(/-/g, '').toLowerCase()))];
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), { v: 1, device, placeholders: { hero: '/h', main: '/m' }, pageTypes: {}, components: Object.fromEntries(ids.map((id, i) => [`c${i}`, { name: `Component ${i}`, renderingId: id, ph: i ? 'main' : 'hero', fields: [], children: [], parent: null, childPh: null }])) });
  const cm = fakeCm({ items: itemsFromSnapshot(snap0), env: 'fake' });
  const out = await snapshotCommand(['--env', 'fake', '--path', snap0.page.path], { projectDir, cmFactory: () => cm, print: false });
  assert.ok(fs.existsSync(path.join(projectDir, out.file)));
  assert.equal(out.page.name, snap0.page.name);
  assert.ok(out.dataItems > 0);
  assert.ok(Array.isArray(out.components) && out.components.length > 0);
});
test('E: write-confirm asks on delete apply and delete undo, not on delete plan', () => {
  const a = run('write-confirm.sh', cmd('node bin/content-ops.mjs delete apply --plan p.json --confirm dev'), 'dev');
  assert.equal(JSON.parse(a.stdout).hookSpecificOutput.permissionDecision, 'ask');
  assert.match(JSON.parse(a.stdout).hookSpecificOutput.permissionDecisionReason, /delete apply/);
  const p = run('write-confirm.sh', cmd('node bin/content-ops.mjs delete plan --scan s.json --paths /x'), 'dev');
  assert.equal(p.stdout.trim(), '');
});
test('write-confirm catches writes through the bundled engine path, quoted, with spaces', () => {
  for (const c of ['node "/Users/First Last/.claude/plugins/cache/h/sitecore-content-ops/0.1.2/engine/bin/content-ops.mjs" apply --run r --confirm dev',
    "node '/Users/a/.claude/plugins/cache/h/s/0.1.2/engine/bin/content-ops.mjs' delete apply --plan p --confirm dev",
    'node "/Users/a/plugin/engine/bin/content-ops.mjs" setup --from-env-local /x/.env.local --env dev']) {
    const r = run('write-confirm.sh', cmd(c), 'dev');
    assert.equal(JSON.parse(r.stdout || '{}').hookSpecificOutput?.permissionDecision, 'ask', c);
  }
  assert.equal(run('write-confirm.sh', cmd('node "/Users/a/engine/bin/content-ops.mjs" plan --env dev --content work/'), 'dev').stdout.trim(), '');
});
