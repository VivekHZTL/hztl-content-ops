import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeCm, itemsFromSnapshot } from '../plugin/engine/lib/cm/fake.mjs';
import { writeJson, loadProject } from '../plugin/engine/lib/config/project.mjs';
import { parseArgs } from '../plugin/engine/lib/cli/args.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { sourcesCommand } from '../plugin/engine/lib/cli/sources.mjs';
import { planCommand } from '../plugin/engine/lib/cli/plan.mjs';
import { showCommand } from '../plugin/engine/lib/cli/show.mjs';
import { applyCommand } from '../plugin/engine/lib/cli/apply.mjs';
import { verifyCommand } from '../plugin/engine/lib/cli/verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const snap0 = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/page-snapshot.json'), 'utf8'));
const xml = snap0.page.fields['__Final Renderings'].value;
const device = xml.match(/<d\s[^>]*id="([^"]+)"/)[1];
const fsbsRid = xml.match(/s:ds="local:\/Data\/Feature Side by Side"[^>]*s:id="\{([^}]+)\}"/)[1].replace(/-/g, '').toLowerCase();
const heroRid = xml.match(/s:id="\{([^}]+)\}"/)[1].replace(/-/g, '').toLowerCase();
const ids = [...new Set([...xml.matchAll(/s:id="\{([^}]+)\}"/g)].map((m) => m[1].replace(/-/g, '').toLowerCase()))];
const catalog = { v: 1, device, placeholders: { hero: xml.match(/s:ph="([^"]*hero[^"]*)"/)[1], main: xml.match(/s:ph="([^"]*main-content[^"]*)"/)[1] }, pageTypes: {}, components: {} };
for (const id of ids) catalog.components[`c_${id.slice(0, 6)}`] = { name: `Component ${id.slice(0, 6)}`, renderingId: id, ph: id === heroRid ? 'hero' : 'main', themed: false, params: '', fields: [], children: [], parent: null, childPh: null };
delete catalog.components[`c_${fsbsRid.slice(0, 6)}`];
catalog.components.fsbs = { name: 'Feature Side by Side', renderingId: fsbsRid, ph: 'main', themed: true, params: 'selectTheme&Styles', fields: [{ name: 'heading', type: 'Single-Line Text' }], children: [], parent: null, childPh: null, dsTemplateId: 'f'.repeat(32) };

const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-cli-'));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-cli-home-'));
test.after(() => { fs.rmSync(projectDir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });
const cm = Object.assign(fakeCm({ items: itemsFromSnapshot(snap0), env: 'fake' }), { writable: true });
const deps = { projectDir, home, cmFactory: () => cm, print: false };

test('parseArgs splits positionals and flags', () => {
  assert.deepEqual(parseArgs(['register', 'a.txt', '--note', 'v1', '--offline']), { _: ['register', 'a.txt'], flags: { note: 'v1', offline: true } });
});
test('setup --answers writes the config files and loadProject reads them', async () => {
  const answers = path.join(projectDir, 'answers.json');
  writeJson(answers, { name: 'demo', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: '/sitecore/content/DemoSite/Demo/Home', environments: [{ name: 'fake', siteUrl: 'https://fake.example.org' }] });
  const out = await setupCommand(['--answers', answers], deps);
  for (const f of ['project.json', 'knowledge', 'decisions.json', 'overrides.json', 'sources.json']) assert.ok(fs.existsSync(path.join(projectDir, '.content-ops', f)), f);
  assert.ok(out.next.length > 0);
  const p = loadProject(projectDir);
  assert.equal(p.project.name, 'demo');
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), catalog);
});
let runId, applyId;
test('sources register + plan produce a run with one ready page', async () => {
  fs.mkdirSync(path.join(projectDir, 'sources'), { recursive: true });
  const src = path.join(projectDir, 'sources', 'deck.txt'); fs.writeFileSync(src, 'deck v1');
  const reg = await sourcesCommand(['register', src, '--note', 'v1'], deps);
  fs.mkdirSync(path.join(projectDir, 'work'), { recursive: true });
  writeJson(path.join(projectDir, 'work', 'p1.json'), { pageId: '1.1', pageType: 'x', target: { path: snap0.page.path, mode: 'update' }, components: [{ type: 'fsbs', fields: { heading: 'From the CLI' } }], flags: [], sources: [{ file: 'sources/deck.txt', sha256: reg.sha256 }] });
  const out = await planCommand(['--env', 'fake', '--content', path.join(projectDir, 'work')], deps);
  runId = out.runId;
  assert.equal(out.counts.ready, 1);
  assert.ok(fs.existsSync(path.join(projectDir, 'runs', runId, 'plan.json')));
  const shown = await showCommand(['--run', runId, '--status', 'ready'], deps);
  assert.equal(shown.pages.length, 1);
  assert.equal(shown.pages[0].status, 'ready');
});
test('apply --confirm writes results and verify reports up-to-date', async () => {
  await assert.rejects(applyCommand(['--run', runId], deps), /confirm/);
  const out = await applyCommand(['--run', runId, '--confirm', 'fake'], deps);
  applyId = out.applyId;
  assert.equal(out.counts.done, 1, JSON.stringify(out));
  assert.equal((await cm.getItem({ path: `${snap0.page.path}/Data/Feature Side by Side` })).fields.heading.value, 'From the CLI');
  const v = await verifyCommand(['--run', runId, '--apply', applyId], deps);
  assert.equal(v.upToDate, 1);
});
test('apply is refused when a source changed since the dry run', async () => {
  fs.writeFileSync(path.join(projectDir, 'sources', 'deck.txt'), 'deck v2');
  await assert.rejects(applyCommand(['--run', runId, '--confirm', 'fake'], deps), /sources\/deck\.txt changed/);
});
