// The minimal setup: a key file is all anyone needs. `setup connect` signs in, finds the site, reads the home page and
// writes the smallest project.json. No catalog, no blueprints, no repo. Commands that need a catalog build it then.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { connectCommand, openCommand } from '../plugin/engine/lib/cli/connect.mjs';
import { parseEnvFile } from '../plugin/engine/lib/client/env.mjs';
import { catalogCommand } from '../plugin/engine/lib/cli/catalog.mjs';
import { templateCommand } from '../plugin/engine/lib/cli/template.mjs';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const SECRET = 'very-secret-value';
const keyFile = (home, project, env, body = `SITECORE_API_HOST=https://cm.example\nSITECORE_CLIENT_ID=client123\nSITECORE_CLIENT_SECRET=${SECRET}\n`) => {
  fs.mkdirSync(path.join(home, '.content-ops', project), { recursive: true });
  const f = path.join(home, '.content-ops', project, `${env}.env`); fs.writeFileSync(f, body); return f;
};
const SITES = [{ name: 'Brand', rootItem: { path: '/sitecore/content/T/Brand' }, startItem: { path: '/sitecore/content/T/Brand/Home' } }, { name: 'Shared', rootItem: { path: '/sitecore/content/T/Shared' }, startItem: { path: '/sitecore/content/T/Shared/Home' } }];
const HOME = { itemId: 'h1', name: 'Home', displayName: 'Home', path: '/sitecore/content/T/Brand/Home', template: { name: 'Home Page' }, updated: { value: '20261020T101500Z' }, title: { value: 'Welcome' }, children: { pageInfo: { hasNextPage: false }, nodes: [{ name: 'about' }, { name: 'services' }] } };
const fakeFetch = ({ sites = SITES, token = true, queries = [] } = {}) => async (url, init) => {
  if (/oauth/.test(url)) return { status: token ? 200 : 401, json: async () => (token ? { access_token: 't', expires_in: 300 } : {}) };
  const { query, variables } = JSON.parse(init.body); queries.push(query);
  if (/solutionSites/.test(query)) return { status: 200, json: async () => ({ data: { solutionSites: sites } }) };
  if (/__Updated/.test(query)) return { status: 200, json: async () => ({ data: { item: variables.p === HOME.path || variables.p === '/sitecore/content/T/Shared/Home' ? { ...HOME, path: variables.p } : null } }) };
  return { status: 200, json: async () => ({ data: { item: null } }) };
};
const setupDirs = () => { const home = tmp('cops-conn-home-'); const projectDir = tmp('cops-conn-proj-'); return { home, projectDir }; };

test('connect with only a key file: signs in, reads the home page, writes a minimal project.json and no catalog', async () => {
  const { home, projectDir } = setupDirs(); keyFile(home, 'brand', 'dev');
  const queries = [];
  const out = await connectCommand(['--env', 'dev'], { home, projectDir, print: false, fetchImpl: fakeFetch({ queries }) });
  assert.equal(out.status, 'connected'); assert.equal(out.project, 'brand');
  assert.equal(out.site.root, '/sitecore/content/T/Brand'); assert.deepEqual(out.otherSites, ['Shared']);
  assert.equal(out.home.displayName, 'Home'); assert.equal(out.home.updated, '2026-10-20'); assert.equal(out.home.childPages, 2);
  assert.match(out.say, /read the home page of Brand/);
  const cfg = JSON.parse(fs.readFileSync(path.join(projectDir, '.content-ops', 'project.json'), 'utf8'));
  assert.deepEqual(cfg, { name: 'brand', siteRoot: '/sitecore/content/T/Brand', homePath: '/sitecore/content/T/Brand/Home', language: 'en', environments: [{ name: 'dev' }] });
  assert.ok(!fs.existsSync(path.join(projectDir, '.content-ops', 'catalog.json')));
  assert.ok(!JSON.stringify(out).includes(SECRET) && !JSON.stringify(out).includes('client123'));
  assert.ok(queries.every((q) => !/^\s*mutation/i.test(q)), 'connect only reads');
});

test('connect a second environment adds it to project.json and keeps the site', async () => {
  const { home, projectDir } = setupDirs(); keyFile(home, 'brand', 'dev'); keyFile(home, 'brand', 'qa');
  await connectCommand(['--env', 'dev'], { home, projectDir, print: false, fetchImpl: fakeFetch() });
  const out = await connectCommand(['--env', 'qa'], { home, projectDir, print: false, fetchImpl: fakeFetch() });
  assert.equal(out.status, 'connected');
  const cfg = JSON.parse(fs.readFileSync(path.join(projectDir, '.content-ops', 'project.json'), 'utf8'));
  assert.deepEqual(cfg.environments.map((e) => e.name), ['dev', 'qa']);
});

test('no key file: makes an empty one to fill, says how to open it, never for production without --prod', async () => {
  const { home, projectDir } = setupDirs();
  const out = await connectCommand(['--env', 'dev', '--project', 'brand'], { home, projectDir, print: false, platform: 'win32' });
  assert.equal(out.status, 'key-file-created');
  const f = path.join(home, '.content-ops', 'brand', 'dev.env');
  assert.match(fs.readFileSync(f, 'utf8'), /^SITECORE_CLIENT_SECRET=$/m);
  assert.equal(out.open, `notepad "${f}"`);
  assert.ok(!fs.existsSync(path.join(projectDir, '.content-ops')), 'nothing written to the project until the connection works');
  const again = await connectCommand(['--env', 'dev', '--project', 'brand'], { home, projectDir, print: false });
  assert.equal(again.status, 'key-file-incomplete'); assert.deepEqual(again.missing, ['SITECORE_API_HOST', 'SITECORE_CLIENT_ID', 'SITECORE_CLIENT_SECRET']);
  const prod = await connectCommand(['--env', 'prod', '--project', 'brand'], { home, projectDir, print: false });
  assert.equal(prod.status, 'needs-prod-ok'); assert.ok(!fs.existsSync(path.join(home, '.content-ops', 'brand', 'prod.env')));
  const prodOk = await connectCommand(['--env', 'prod', '--project', 'brand', '--prod'], { home, projectDir, print: false });
  assert.equal(prodOk.status, 'key-file-created');
});

test('a key file Notepad saved as .env.txt is named, not silently missed', async () => {
  const { home, projectDir } = setupDirs(); const f = keyFile(home, 'brand', 'dev'); fs.renameSync(f, `${f}.txt`);
  const out = await connectCommand(['--env', 'dev'], { home, projectDir, print: false });
  assert.equal(out.project, 'brand'); assert.equal(out.status, 'key-file-misnamed'); assert.match(out.say, /dev\.env\.txt/);
});

test('reading production with an existing key file needs no flag; connect never writes to Sitecore', async () => {
  const { home, projectDir } = setupDirs(); keyFile(home, 'brand', 'prod');
  const out = await connectCommand(['--env', 'prod'], { home, projectDir, print: false, fetchImpl: fakeFetch() });
  assert.equal(out.status, 'connected'); assert.equal(out.env.isProd, true); assert.match(out.say, /PRODUCTION: reading only/);
});

test('several sites: asks which one, then --site picks it', async () => {
  const { home, projectDir } = setupDirs(); keyFile(home, 'brand', 'dev');
  const two = [SITES[0], { name: 'Other', rootItem: { path: '/sitecore/content/T/Other' }, startItem: { path: '/sitecore/content/T/Shared/Home' } }];
  const ask = await connectCommand(['--env', 'dev'], { home, projectDir, print: false, fetchImpl: fakeFetch({ sites: two }) });
  assert.equal(ask.status, 'choose-site'); assert.deepEqual(ask.sites.map((s) => s.name), ['Brand', 'Other']);
  assert.ok(!fs.existsSync(path.join(projectDir, '.content-ops', 'project.json')));
  const out = await connectCommand(['--env', 'dev', '--site', 'other'], { home, projectDir, print: false, fetchImpl: fakeFetch({ sites: two }) });
  assert.equal(out.status, 'connected'); assert.equal(out.site.name, 'Other');
});

test('project name: asked when several projects have that key file, refused in the home folder', async () => {
  const { home, projectDir } = setupDirs(); keyFile(home, 'a', 'dev'); keyFile(home, 'b', 'dev');
  const out = await connectCommand(['--env', 'dev'], { home, projectDir, print: false });
  assert.equal(out.status, 'need-project-name'); assert.deepEqual(out.candidates.sort(), ['a', 'b']);
  const inHome = await connectCommand(['--env', 'dev', '--project', 'a'], { home, projectDir: home, print: false });
  assert.equal(inHome.status, 'wrong-folder');
  const inCreds = await connectCommand(['--env', 'dev', '--project', 'a'], { home, projectDir: path.join(home, '.content-ops', 'a'), print: false });
  assert.equal(inCreds.status, 'wrong-folder');
});

test('a refused client id and secret is reported in plain words without the secret', async () => {
  const { home, projectDir } = setupDirs(); keyFile(home, 'brand', 'dev');
  const out = await connectCommand(['--env', 'dev'], { home, projectDir, print: false, fetchImpl: fakeFetch({ token: false }) });
  assert.equal(out.status, 'connection-failed'); assert.match(out.say, /did not accept the client id and secret/);
  assert.ok(!JSON.stringify(out).includes(SECRET));
});

test('setup connect is reachable through setupCommand', async () => {
  const { home, projectDir } = setupDirs(); keyFile(home, 'brand', 'dev');
  const out = await setupCommand(['connect', '--env', 'dev'], { home, projectDir, print: false, fetchImpl: fakeFetch() });
  assert.equal(out.status, 'connected');
});

test('key files saved by Windows Notepad (BOM, UTF-16, CRLF) parse', () => {
  const d = tmp('cops-bom-');
  const body = 'SITECORE_API_HOST=https://h\r\nSITECORE_CLIENT_ID=i\r\nSITECORE_CLIENT_SECRET=s\r\n';
  fs.writeFileSync(path.join(d, 'a.env'), '\uFEFF' + body);
  fs.writeFileSync(path.join(d, 'b.env'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')]));
  for (const f of ['a.env', 'b.env']) assert.deepEqual(parseEnvFile(path.join(d, f)), { SITECORE_API_HOST: 'https://h', SITECORE_CLIENT_ID: 'i', SITECORE_CLIENT_SECRET: 's' }, f);
});

test('openCommand fits the platform', () => {
  assert.equal(openCommand('C:\\Users\\a\\.content-ops\\p\\dev.env', 'win32'), 'notepad "C:\\Users\\a\\.content-ops\\p\\dev.env"');
  assert.equal(openCommand('/Users/a/x.env', 'darwin'), 'open -e "/Users/a/x.env"');
});

// The catalog is built the first time something needs it, from the environment named on that command.
const H = (c) => c.repeat(32);
const G = (c) => `{${H(c).toUpperCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')}}`;
const layout = `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="{DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD}"><r uid="{11111111-1111-1111-1111-111111111111}" s:ds="local:/Data/Hero" s:id="${G('a')}" s:par="DynamicPlaceholderId=1" s:ph="/hm/hero-0" /></d></r>`;
const item = (id, name, p, templateName, parentId, fields = {}, templateId = H('f')) => ({ id, name, path: p, templateId, templateName, parentId, version: 1, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, std: false }])) });
const items = {};
for (const it of [item('home', 'Home', '/s/Home', 'Folder', ''), item('p1', 'Page', '/s/Home/page', 'General Landing Page', 'home', { '__Final Renderings': layout }, H('1')),
  item(H('a'), 'Hero', '/sitecore/layout/Renderings/Hero', 'Json Rendering', 'rend', { 'Datasource Template': '/sitecore/templates/Project/Hero' }),
  item(H('1'), 'General Landing Page', '/sitecore/templates/Project/General Landing Page', 'Template', 'tpls'), item(H('d'), 'Hero', '/sitecore/templates/Project/Hero', 'Template', 'tpls'),
  item('secd', 'Content', '/sitecore/templates/Project/Hero/Content', 'Template section', H('d')), item('fd', 'title', '/sitecore/templates/Project/Hero/Content/title', 'Template field', 'secd', { Type: 'Single-Line Text' })]) items[it.id] = it;
const scan = { tree: Object.values(items).filter((i) => i.path.startsWith('/s/Home')).map((i) => ({ id: i.id, name: i.name, path: i.path, parentId: i.parentId, templateId: i.templateId, templateName: i.templateName })), fields: Object.fromEntries(Object.values(items).map((i) => [i.id, { version: 1, f: Object.fromEntries(Object.entries(i.fields).map(([k, v]) => [k, v.value])) }])) };
const minimalProject = () => { const projectDir = tmp('cops-lazy-'); writeJson(path.join(projectDir, '.content-ops', 'project.json'), { name: 'brand', siteRoot: '/s', homePath: '/s/Home', language: 'en', environments: [{ name: 'dev' }] }); return projectDir; };

test('catalog show with no catalog builds it from the named environment, says so, and saves it', async () => {
  const projectDir = minimalProject(); const cm = fakeCm({ items });
  const out = await catalogCommand(['show', '--env', 'dev'], { projectDir, print: false, cmFactory: () => cm, scanImpl: async () => scan });
  assert.match(out.catalogBuilt, /No catalog yet, so it was read from dev just now/);
  assert.deepEqual(out.pageTypes.map((p) => p.key), ['generalLandingPage']);
  assert.ok(fs.existsSync(path.join(projectDir, '.content-ops', 'catalog.json')));
  const second = await catalogCommand(['show'], { projectDir, print: false, cmFactory: () => { throw new Error('should not read Sitecore again'); } });
  assert.equal(second.catalogBuilt, undefined);
});

test('a command that needs a catalog and has no environment asks for one in plain words, never "set up a catalog first"', async () => {
  const projectDir = minimalProject();
  await assert.rejects(templateCommand(['--page-type', 'generalLandingPage'], { projectDir, print: false }), (e) => /Add --env <name> and it is read from Sitecore automatically/.test(e.message) && !/catalog build/.test(e.message));
});

test('join no longer tells anyone to build a catalog', async () => {
  const { home } = setupDirs(); const projectDir = minimalProject();
  const out = await setupCommand(['join'], { projectDir, home, print: false });
  assert.ok(out.next.every((l) => !/catalog/i.test(l)), out.next.join('\n'));
  assert.ok(out.next.some((l) => /setup connect --env dev/.test(l)));
});

test('quickScan stays bounded: first 100 children per item, skips Data folders, stops at maxItems', async () => {
  const { quickScan } = await import('../plugin/engine/lib/catalog/discover.mjs');
  const kids = (pid, n) => Array.from({ length: n }, (_, i) => ({ itemId: `${pid}c${i}`, name: i === 0 ? 'Data' : `p${i}`, path: `/x/${pid}/${i}`, hasChildren: true, template: { templateId: 't', name: 'Page' }, fr: { value: '' } }));
  const asked = [];
  const client = { query: async (q, v) => { if (/where:\{path/.test(q)) return { item: { itemId: 'root', name: 'Home', path: '/x', hasChildren: true, template: { templateId: 't', name: 'Home' }, fr: { value: '' } } }; asked.push(v.id); return { item: { children: { nodes: kids(v.id, 5) } } }; } };
  const s = await quickScan({ client, root: '/x', maxItems: 30 });
  assert.ok(s.tree.length <= 30 + 5 * 8, `${s.tree.length}`); assert.equal(s.complete, false);
  assert.ok(asked.every((id) => !/c0$/.test(id)), 'never opens a Data folder');
});

test('a catalog discovered from real pages tolerates a component used both top-level and nested; a blueprint catalog does not', async () => {
  const { validateCatalog } = await import('../plugin/engine/lib/catalog/schema.mjs');
  const c = { placeholders: { hero: 'h', main: 'm' }, pageTypes: {}, components: { card: { name: 'Card', renderingId: 'r', ph: 'main', placements: ['top', 'child'], children: [] } } };
  assert.deepEqual(validateCatalog({ ...c, source: 'discovered' }).filter((e) => /placed both/.test(e)), []);
  assert.equal(validateCatalog({ ...c, source: 'blueprints' }).filter((e) => /placed both/.test(e)).length, 1);
});

test('catalog build reads each template once however many components share it', async () => {
  const { buildCatalog } = await import('../plugin/engine/lib/catalog/build.mjs');
  const cm = fakeCm({ items }); const reads = new Map(); const get = cm.getItem;
  cm.getItem = async (q) => { const k = q.id || q.path; reads.set(k, (reads.get(k) || 0) + 1); return get(q); };
  await buildCatalog({ cm, pageIds: ['p1', 'p1'] });
  assert.ok([...reads.values()].every((n) => n === 1), JSON.stringify([...reads]));
});
