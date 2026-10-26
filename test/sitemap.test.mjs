import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSitemap, resolveLinks } from '../plugin/engine/lib/ingest/sitemap.mjs';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { newContent } from '../plugin/engine/lib/content/schema.mjs';

const sm = loadSitemap({ '12': { name: 'Heart care', url: '/services/heart-care' }, '13': { name: 'Cancer care', url: '/services/cancer-care' }, '12.6': { name: 'TeleHeart', url: '/services/heart-care/teleheart' } });
const items = { home: { id: 'home', name: 'Home', path: '/s/Home', templateId: 't', templateName: 'T', parentId: '', version: 1, fields: {} }, hc: { id: 'a'.repeat(32), name: 'heart-care', path: '/s/Home/services/heart-care', templateId: 't', templateName: 'Page', parentId: 'home', version: 1, fields: {} } };
test('loadSitemap indexes by pid and url', () => {
  assert.equal(sm.byPid.get('12').url, '/services/heart-care');
  assert.equal(sm.byUrl.get('/services/cancer-care').pid, '13');
});
test('resolveLinks sets ids for existing pages, keeps url + link-pending for missing ones, flags pid-fix and suspect-link', async () => {
  const cm = fakeCm({ items });
  const c = newContent({ pageId: '1', pageType: 'x', targetPath: '/s/Home/p' });
  c.components.push({ type: 'hero', fields: { cta: { text: 'Heart care', pid: '12' }, more: { text: 'Cancer care', pid: '13' }, odd: { text: 'Totally different words', pid: '12.6' }, nope: { text: 'x', pid: '99' }, abs: { text: 'Heart', url: 'https://www.example.org/services/heart-care?tab=1' } }, children: [] });
  c.locators = { 'components.0.fields.more': 'deck line 9' };
  const out = await resolveLinks(c, { sitemap: sm, cm, homePath: '/s/Home', ownHosts: ['www.example.org', 'example.org'] });
  const f = out.components[0].fields;
  assert.equal(f.cta.id, 'a'.repeat(32)); assert.ok(!('url' in f.cta));
  assert.equal(f.more.url, '/services/cancer-care'); assert.ok(out.flags.some((x) => x.kind === 'link-pending' && x.where === 'deck line 9'));
  assert.ok(out.flags.some((x) => x.kind === 'suspect-link' && /12\.6/.test(x.text)));
  assert.ok(out.flags.some((x) => x.kind === 'pid-fix' && /99/.test(x.text)));
  assert.equal(f.abs.id, 'a'.repeat(32)); assert.equal(f.abs.querystring, 'tab=1');
});
