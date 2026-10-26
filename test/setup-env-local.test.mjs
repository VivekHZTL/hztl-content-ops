import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeJson, loadProject } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand, QUESTIONS } from '../plugin/engine/lib/cli/setup.mjs';

const H = '/sitecore/content/DemoSite/Demo/Home';
const SECRET = 'sup3r-s3cret-value-zz';
async function project({ contacts } = {}) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-sel-'));
  execFileSync('git', ['init', '-q'], { cwd: projectDir });
  writeJson(path.join(projectDir, 'answers.json'), { name: 'demo', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'dev' }, { name: 'prod' }], ...(contacts ? { contacts } : {}) });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-sel-home-'));
  fs.writeFileSync(path.join(projectDir, '.env.local'), `# head app\r\nexport SITECORE_API_HOST="https://xmc-demo.example"\r\nSITECORE_CLIENT_ID=abcdef123456\r\nSITECORE_CLIENT_SECRET='${SECRET}'\r\nSITECORE_EDGE_CONTEXT_ID=ctx\r\nNEXT_PUBLIC_X=1\r\n`);
  return { projectDir, home };
}
const capture = async (fn) => { const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' ')); try { return [await fn(), logs.join('\n')]; } finally { console.log = orig; } };

test('copies the three keys to ~/.content-ops/<project>/<env>.env with mode 600 and never prints the secret', async () => {
  const { projectDir, home } = await project();
  const [out, printed] = await capture(() => setupCommand(['--from-env-local', path.join(projectDir, '.env.local'), '--env', 'dev'], { projectDir, home, print: true }));
  const target = path.join(home, '.content-ops', 'demo', 'dev.env');
  assert.equal(out.wrote, target); assert.equal(out.host, 'xmc-demo.example'); assert.equal(out.clientIdPrefix, 'abcd…'); assert.equal(out.isProd, false);
  assert.ok(!JSON.stringify(out).includes(SECRET) && !printed.includes(SECRET) && !printed.includes('abcdef123456'));
  const text = fs.readFileSync(target, 'utf8');
  assert.match(text, /^SITECORE_API_HOST=https:\/\/xmc-demo\.example$/m); assert.match(text, new RegExp(`^SITECORE_CLIENT_SECRET=${SECRET}$`, 'm')); assert.doesNotMatch(text, /EDGE_CONTEXT|NEXT_PUBLIC/);
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
});
test('refuses existing without --force, unknown env, prod without --prod, a path outside a git tree, and a file missing a key', async () => {
  const { projectDir, home } = await project();
  const src = path.join(projectDir, '.env.local');
  await setupCommand(['--from-env-local', src, '--env', 'dev'], { projectDir, home, print: false });
  await assert.rejects(setupCommand(['--from-env-local', src, '--env', 'dev'], { projectDir, home, print: false }), /--force/);
  await assert.rejects(setupCommand(['--from-env-local', src, '--env', 'qa'], { projectDir, home, print: false }), /qa.*not.*project\.json|project\.json.*qa/);
  await assert.rejects(setupCommand(['--from-env-local', src, '--env', 'prod'], { projectDir, home, print: false }), /--prod/);
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cops-sel-out-')), 'x.env'); fs.copyFileSync(src, outside);
  await assert.rejects(setupCommand(['--from-env-local', outside, '--env', 'dev', '--force'], { projectDir, home, print: false }), /git working tree/);
  fs.writeFileSync(src, 'SITECORE_API_HOST=h\n');
  await assert.rejects(setupCommand(['--from-env-local', src, '--env', 'dev', '--force'], { projectDir, home, print: false }), /SITECORE_CLIENT_ID/);
});
test('contacts are a setup question and land in project.json; invalid contacts are rejected', async () => {
  assert.ok(QUESTIONS.contacts);
  const { projectDir } = await project({ contacts: { dev: 'Dev Lead', content: 'Content Lead' } });
  assert.deepEqual(loadProject(projectDir).project.contacts, { dev: 'Dev Lead', content: 'Content Lead' });
  const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-sel-bad-'));
  writeJson(path.join(bad, 'answers.json'), { name: 'd', siteRoot: '/s', homePath: H, environments: [{ name: 'dev' }], contacts: 'Pat' });
  await assert.rejects(setupCommand(['--answers', path.join(bad, 'answers.json')], { projectDir: bad, print: false }), /contacts/);
});
