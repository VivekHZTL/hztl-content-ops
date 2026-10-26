import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { relinkCommand } from '../plugin/engine/lib/cli/relink.mjs';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { catalog } from './_catalog.mjs';

test('relink resolves pending links whose target now exists, drops their flag, leaves the rest untouched', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-rl-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/s', homePath: '/s/Home', environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), catalog);
  writeJson(path.join(projectDir, 'sitemap.json'), { '12': { name: 'Heart', url: '/services/heart' }, '13': { name: 'Cancer', url: '/services/cancer' } });
  writeJson(path.join(projectDir, 'work', 'p.json'), { pageId: 'p', pageType: 'generalLanding', target: { path: '/s/Home/p', mode: 'update' }, components: [{ type: 'hero', fields: { title: 'T', cta: { text: 'Heart', url: '/services/heart', pid: '12' } }, children: [{ type: 'x', fields: {}, children: [] }] }, { type: 'hero', fields: { cta: { text: 'Cancer', url: '/services/cancer', pid: '13' } }, children: [] }], flags: [{ kind: 'link-pending', where: 'components.0.fields.cta', text: 'Page ID 12 (/services/heart) does not exist yet' }, { kind: 'link-pending', where: 'components.1.fields.cta', text: 'Page ID 13 (/services/cancer) does not exist yet' }], sources: [], locators: { 'components.0.fields.cta': 'components.0.fields.cta', 'components.1.fields.cta': 'components.1.fields.cta' } });
  const items = { ['a'.repeat(32)]: { id: 'a'.repeat(32), name: 'heart', path: '/s/Home/services/heart', templateId: 't', templateName: 'Page', parentId: '', version: 1, fields: {} } };
  const out = await relinkCommand(['--env', 'fake', '--sitemap', path.join(projectDir, 'sitemap.json')], { projectDir, cmFactory: () => fakeCm({ items, env: 'fake' }), print: false });
  assert.equal(out.resolved, 1); assert.equal(out.stillPending, 1);
  const c = JSON.parse(fs.readFileSync(path.join(projectDir, 'work', 'p.json'), 'utf8'));
  assert.equal(c.components[0].fields.cta.id, 'a'.repeat(32)); assert.ok(!('url' in c.components[0].fields.cta));
  assert.equal(c.components[1].fields.cta.url, '/services/cancer');
  assert.equal(c.flags.filter((f) => f.kind === 'link-pending').length, 1);
  assert.equal(c.components[0].fields.title, 'T');
});
