import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeCm } from '../plugin/engine/lib/cm/fake.mjs';
import { createPage } from '../plugin/engine/lib/apply/create-page.mjs';
import { catalog } from './_catalog.mjs';

const base = () => ({ ['h'.repeat(32)]: { id: 'h'.repeat(32), name: 'Home', path: '/s/Home', templateId: 't', templateName: 'T', parentId: '', version: 1, fields: {} }, ['e'.repeat(32)]: { id: 'e'.repeat(32), name: 'existing', path: '/s/Home/existing', templateId: 't', templateName: 'T', parentId: 'h'.repeat(32), version: 1, fields: {} } });
const sleep = () => new Promise((r) => setTimeout(r, 0)); // a real tick, so the fake's job timer fires
test('creates from a branch and waits for the item; template path when no branch', async () => {
  const cm = fakeCm({ items: base() });
  const cat = structuredClone(catalog); cat.pageTypes.generalLanding.branchId = 'b'.repeat(32);
  const it = await createPage({ cm, parentPath: '/s/Home', name: 'new-page', pageType: 'generalLanding', catalog: cat, fields: { pageTitle: 'New' }, confirm: 'fake', sleep });
  assert.equal(it.path, '/s/Home/new-page');
  assert.ok(cm.log.some((l) => l[0] === 'createFromBranch'));
  const cm2 = fakeCm({ items: base() });
  const it2 = await createPage({ cm: cm2, parentPath: '/s/Home', name: 'tpl-page', pageType: 'generalLanding', catalog, confirm: 'fake', sleep });
  assert.equal(it2.templateId, '1'.repeat(32));
});
test('refuses an existing name and a missing parent before any write, and needs confirm', async () => {
  const cm = fakeCm({ items: base() });
  await assert.rejects(createPage({ cm, parentPath: '/s/Home', name: 'existing', pageType: 'generalLanding', catalog, confirm: 'fake', sleep }), /already has a child/);
  await assert.rejects(createPage({ cm, parentPath: '/s/Nope', name: 'x', pageType: 'generalLanding', catalog, confirm: 'fake', sleep }), /Parent not found/);
  await assert.rejects(createPage({ cm, parentPath: '/s/Home', name: 'x', pageType: 'generalLanding', catalog, sleep }), /confirm/);
  assert.equal(cm.log.length, 0);
});
