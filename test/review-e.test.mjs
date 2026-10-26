// Tests added from the phase-E review.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fakeCm, itemsFromSnapshot } from '../plugin/engine/lib/cm/fake.mjs';
import { snapshotPage } from '../plugin/engine/lib/snapshot/page.mjs';
import { exportPage } from '../plugin/engine/lib/ingest/sitecore.mjs';
import { planPage } from '../plugin/engine/lib/plan/page-plan.mjs';
import { assertRunFresh } from '../plugin/engine/lib/plan/run.mjs';
import { renderDryRun, renderCombined, renderRun } from '../plugin/engine/lib/report/render.mjs';
import { planDelete, applyDelete, undoDelete } from '../plugin/engine/lib/apply/delete.mjs';
import { stripImages, rewriteHrefs, replaceText } from '../plugin/engine/lib/transform/rte.mjs';
import { resolveLinks, loadSitemap } from '../plugin/engine/lib/ingest/sitemap.mjs';
import { newContent } from '../plugin/engine/lib/content/schema.mjs';
import { DEFAULT_RULES, writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { exportCommand } from '../plugin/engine/lib/cli/export.mjs';
import { planCommand } from '../plugin/engine/lib/cli/plan.mjs';
import { applyCommand } from '../plugin/engine/lib/cli/apply.mjs';
import { relinkCommand } from '../plugin/engine/lib/cli/relink.mjs';
import { catalog as smallCatalog } from './_catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snap0 = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/page-snapshot.json'), 'utf8'));
const xml = snap0.page.fields['__Final Renderings'].value;
const device = xml.match(/<d\s[^>]*id="([^"]+)"/)[1];
const rid = (ds) => xml.match(new RegExp(`s:ds="${ds}"[^>]*s:id="\\{([^}]+)\\}"`))[1].replace(/-/g, '').toLowerCase();
const heroRid = xml.match(/s:id="\{([^}]+)\}"/)[1].replace(/-/g, '').toLowerCase();
const ids = [...new Set([...xml.matchAll(/s:id="\{([^}]+)\}"/g)].map((m) => m[1].replace(/-/g, '').toLowerCase()))];
const catalog = { v: 1, device, placeholders: { hero: xml.match(/s:ph="([^"]*hero[^"]*)"/)[1], main: xml.match(/s:ph="([^"]*main-content[^"]*)"/)[1] }, pageTypes: { singleLocation: { name: 'Single Location Page Template', templateId: snap0.page.templateId, fields: [{ name: 'pageTitle', type: 'Single-Line Text' }] } }, components: {} };
for (const id of ids) catalog.components[`c_${id.slice(0, 6)}`] = { name: `Component ${id.slice(0, 6)}`, renderingId: id, ph: id === heroRid ? 'hero' : 'main', themed: false, params: '', fields: [{ name: 'title', type: 'Single-Line Text' }], children: [], parent: null, childPh: null, dsTemplateId: 'c'.repeat(32) };
const fsbsKey = `c_${rid('local:/Data/Feature Side by Side').slice(0, 6)}`;
catalog.components[fsbsKey] = { ...catalog.components[fsbsKey], name: 'Feature Side by Side', fields: [{ name: 'heading', type: 'Single-Line Text' }, { name: 'imageDAM', type: 'Image' }] };
const rules = DEFAULT_RULES;
async function project(cat = catalog, home = '/sitecore/content/DemoSite/Demo/Home') {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-re-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: home, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), cat);
  return projectDir;
}

test('C1: export → edit → plan → apply works end to end (sitecore: sources skip the manifest check)', async () => {
  assert.doesNotThrow(() => assertRunFresh({ createdAt: new Date().toISOString(), sources: [{ file: 'sitecore:/x', sha256: 'abc' }] }, { maxAgeHours: 12, sources: [] }));
  const projectDir = await project();
  const cm = fakeCm({ items: itemsFromSnapshot(snap0), env: 'fake' });
  const ex = await exportCommand(['--env', 'fake', '--paths', snap0.page.path], { projectDir, cmFactory: () => cm, print: false });
  const file = path.join(projectDir, ex.written[0]); const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  c.components.find((x) => x.type === fsbsKey).fields.heading = 'Changed by transform'; writeJson(file, c);
  const plan = await planCommand(['--env', 'fake', '--content', 'work'], { projectDir, cmFactory: () => cm, print: false });
  assert.equal(plan.counts.ready, 1, JSON.stringify(plan));
  const out = await applyCommand(['--run', plan.runId, '--confirm', 'fake'], { projectDir, cmFactory: () => cm, print: false });
  assert.equal(out.counts.done, 1, JSON.stringify(out));
});
test('I8: the planner never binds to a shared-datasource entry; export of such a page plans up-to-date', async () => {
  const cm = fakeCm({ items: itemsFromSnapshot(snap0) });
  const snap = await snapshotPage(cm, snap0.page.id);
  const sharedKey = `c_${xml.match(/s:ds="\{[^"]+\}"[^>]*s:id="\{([^}]+)\}"/)[1].replace(/-/g, '').toLowerCase().slice(0, 6)}`;
  // make the shared component's type also appear as a local one by exporting then planning: only local entries bind
  const c = exportPage({ snap, catalog, rules });
  assert.ok(c.notes.some((n) => n.kind === 'shared' && n.component === sharedKey));
  const plan = planPage({ content: c, snap, catalog, rules, key: 'k' });
  assert.equal(plan.status, 'up-to-date', JSON.stringify(plan.reasons));
  // a content component whose only entry is shared is refused, never repointed
  const c2 = { ...c, components: [...c.components, { type: sharedKey, fields: { title: 'x' }, children: [] }] };
  assert.equal(planPage({ content: c2, snap, catalog, rules, key: 'k' }).status, 'needs-review');
});
test('I3: report data with $ sequences survives', () => {
  const run = { runId: 'r', env: 'dev', createdAt: 'x', sources: [], pages: [{ key: 'p', status: 'ready', pending: [], reasons: [], ops: { creates: [], updates: [{}], layout: null }, diff: { components: { before: [], after: [] }, fields: [{ ref: 'page', field: 'f', from: "a $' b $& c $$", to: 'x' }] }, layout: { after: [] } }] };
  const html = renderDryRun(run);
  const data = JSON.parse(html.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.pages[0].fields[0].from, "a $' b $& c $$");
});
test('I9: combined report marks undone pages, keeps done over a later skipped, keys by itemId', () => {
  const run = { runId: 'r1', env: 'dev', pages: [{ key: 'p', itemId: 'i1', path: '/p' }] };
  const html = renderCombined([{ run, results: [{ applyId: 'a1', results: [{ key: 'p', itemId: 'i1', status: 'done' }] }, { applyId: 'a2', results: [{ key: 'p', itemId: 'i1', status: 'skipped' }] }], undone: new Set(['a1|p']) }]);
  const data = JSON.parse(html.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.rows.length, 1); assert.equal(data.rows[0].status, 'done'); assert.equal(data.rows[0].manualRollback, true);
});
test('run report undo command carries --prod on a production run', () => {
  const run = { runId: 'r', env: 'production', isProd: true, pages: [{ key: 'p', status: 'ready', pending: [], ops: { creates: [], updates: [], layout: null }, diff: { components: {}, fields: [] }, layout: { after: [] } }] };
  const html = renderRun(run, { applyId: 'a', results: [{ key: 'p', status: 'done' }], counts: {} });
  assert.match(html, /--confirm production --prod/);
});
test('C2/I4/I6: delete plan needs a scan from the site root, resolves blocked chains in rounds, refuses stale plans, honours --limit', async () => {
  const H = '/s/Home', S = '/s';
  const A = 'a'.repeat(32), B = 'b'.repeat(32), X = 'x'.repeat(32), HOME = 'h'.repeat(32), ROOT = 'r'.repeat(32), NAV = 'n'.repeat(32);
  const items = { [ROOT]: { id: ROOT, name: 's', path: S, templateId: 't', templateName: 'Site', parentId: '', version: 1, fields: {} }, [NAV]: { id: NAV, name: 'Nav', path: `${S}/Data/Nav`, templateId: 't', templateName: 'Nav', parentId: ROOT, version: 1, fields: { link: { value: `{${A.toUpperCase()}}`, std: false } } },
    [HOME]: { id: HOME, name: 'Home', path: H, templateId: 't', templateName: 'F', parentId: ROOT, version: 1, fields: {} }, [A]: { id: A, name: 'a', path: `${H}/a`, templateId: 't', templateName: 'Page', parentId: HOME, version: 1, fields: { ref: { value: `{${B.toUpperCase()}}`, std: false } } }, [B]: { id: B, name: 'b', path: `${H}/b`, templateId: 't', templateName: 'Page', parentId: HOME, version: 1, fields: {} }, [X]: { id: X, name: 'x', path: `${H}/x`, templateId: 't', templateName: 'Page', parentId: HOME, version: 1, fields: {} } };
  const cm = fakeCm({ items, env: 'fake' });
  const scanOf = (rootPath) => ({ env: 'fake', root: rootPath, at: new Date().toISOString(), tree: Object.values(cm.db).filter((x) => (x.path + '/').startsWith(rootPath + '/')).map((x) => ({ id: x.id, name: x.name, path: x.path, parentId: x.parentId, templateId: x.templateId, templateName: x.templateName })), fields: Object.fromEntries(Object.values(cm.db).map((x) => [x.id, { version: 1, f: Object.fromEntries(Object.entries(x.fields).map(([k, v]) => [k, v.value])) }])) });
  assert.throws(() => planDelete({ scan: scanOf(H), targets: [`${H}/a`], homePath: H, siteRoot: S }), /site root/i);
  const plan = planDelete({ scan: scanOf(S), targets: [`${H}/a`, `${H}/b`, `${H}/x`], homePath: H, siteRoot: S });
  assert.deepEqual(plan.blocked.map((b) => b.path).sort(), [`${H}/a`, `${H}/b`], 'b is only referenced by blocked a, so b is blocked too');
  assert.deepEqual(plan.deletable.map((d) => d.path), [`${H}/x`]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-de-'));
  await assert.rejects(applyDelete({ cm, plan: { ...plan, at: new Date(Date.now() - 13 * 3600e3).toISOString() }, journalFile: path.join(tmp, 'j.json'), confirm: 'fake' }), /older/);
  const r = await applyDelete({ cm, plan: { ...plan, deletable: [...plan.deletable, { ...plan.deletable[0], id: 'zz', path: `${H}/zz`, childIds: [] }] }, journalFile: path.join(tmp, 'j2.json'), confirm: 'fake', limit: 1 });
  assert.equal(r.deleted.length, 1); assert.equal(r.notStarted, 1);
});
test('I5: undo also restores roots stuck in deleting/FAILED when they are gone from the tree', async () => {
  const T = 't'.repeat(32), HOME = 'h'.repeat(32);
  const cm = fakeCm({ items: { [HOME]: { id: HOME, name: 'Home', path: '/s/Home', templateId: 't', templateName: 'F', parentId: '', version: 1, fields: {} }, [T]: { id: T, name: 'old', path: '/s/Home/old', templateId: 't', templateName: 'Page', parentId: HOME, version: 1, fields: {} } }, env: 'fake' });
  await cm.deleteItem({ id: T });
  const u = await undoDelete({ cm, journal: { env: 'fake', roots: [{ id: T, path: '/s/Home/old', state: 'deleting' }] }, confirm: 'fake' });
  assert.deepEqual(u.restored, ['/s/Home/old']); assert.ok(await cm.getItem({ id: T }));
});
test('I7: write-confirm asks when delete flags come before the subcommand', () => {
  const r = spawnSync(path.join(root, 'plugin/scripts/write-confirm.sh'), [], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'node bin/content-ops.mjs delete --plan p.json apply --confirm prod' } }), encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } });
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
});
test('I10: relink drops only the flag of the link it resolved, by content path, and skips missing paths', async () => {
  const projectDir = await project(smallCatalog, '/s/Home');
  writeJson(path.join(projectDir, 'sitemap.json'), { '12': { name: 'Heart', url: '/services/heart' }, '13': { name: 'Cancer', url: '/services/cancer' } });
  writeJson(path.join(projectDir, 'work', 'p.json'), { pageId: 'p', pageType: 'generalLanding', target: { path: '/s/Home/p', mode: 'update' }, components: [{ type: 'hero', fields: { cta: { text: 'Heart', url: '/services/heart', pid: '12' }, tagline: { text: 'Cancer', url: '/services/cancer', pid: '13' } }, children: [] }],
    flags: [{ kind: 'link-pending', where: "'T'!C3", path: 'components.0.fields.cta', text: '12' }, { kind: 'link-pending', where: "'T'!C3", path: 'components.0.fields.tagline', text: '13' }, { kind: 'link-pending', where: 'gone', path: 'components.9.fields.nope', text: 'x' }], sources: [], locators: { 'components.0.fields.cta': "'T'!C3", 'components.0.fields.tagline': "'T'!C3" } });
  const items = { ['a'.repeat(32)]: { id: 'a'.repeat(32), name: 'heart', path: '/s/Home/services/heart', templateId: 't', templateName: 'Page', parentId: '', version: 1, fields: {} } };
  const out = await relinkCommand(['--env', 'fake', '--sitemap', path.join(projectDir, 'sitemap.json')], { projectDir, cmFactory: () => fakeCm({ items, env: 'fake' }), print: false });
  assert.equal(out.resolved, 1);
  const c = JSON.parse(fs.readFileSync(path.join(projectDir, 'work', 'p.json'), 'utf8'));
  assert.equal(c.flags.filter((f) => f.kind === 'link-pending').length, 2, 'the other link at the same locator keeps its flag');
  assert.equal(c.components[0].fields.cta.id, 'a'.repeat(32));
});
test('resolveLinks records the content path on each flag', async () => {
  const sm = loadSitemap({ '99': { name: 'Nope', url: '/nope' } });
  const c = newContent({ pageId: '1', pageType: 'x', targetPath: '/s/Home/p' });
  c.components.push({ type: 'hero', fields: { cta: { text: 'Nope', pid: '99' } }, children: [] });
  const out = await resolveLinks(c, { sitemap: sm, cm: fakeCm({ items: {} }), homePath: '/s/Home' });
  assert.equal(out.flags[0].path, 'components.0.fields.cta');
});
test('I11 + minors: strip-images collapses only wrappers it emptied and needs a hostPattern; rewriteHrefs escapes; replaceText survives digit finds', () => {
  const html = '<p>&nbsp;</p><span class="icon"></span><p><img src="/-/media/a.jpg"></p><!-- c0 --><p>x 0 y</p>';
  const { html: out, changes } = stripImages(html, { hostPattern: '/-/media/' });
  assert.equal(changes, 1); assert.ok(out.includes('<p>&nbsp;</p>') && out.includes('<span class="icon"></span>'), 'pre-existing empties kept');
  assert.throws(() => stripImages(html, {}), /hostPattern/);
  assert.equal(rewriteHrefs('<a href="/x">a</a>', [{ match: '^/x$', replace: '/y" onclick="alert(1)' }]).html, '<a href="/y&quot; onclick=&quot;alert(1)">a</a>');
  const t = replaceText('<!-- c0 --><p>0 and 10</p>', { find: '0', replace: 'Z' });
  assert.equal(t.html, '<!-- c0 --><p>Z and 1Z</p>');
});
