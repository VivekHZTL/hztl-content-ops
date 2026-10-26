import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAG_KINDS, validateContent, newContent } from '../plugin/engine/lib/content/schema.mjs';

const catalog = { components: { accordion: { fields: [{ name: 'title' }], children: ['accordionItem'] }, accordionItem: { fields: [{ name: 'heading' }], children: [] } } };
test('newContent is valid and flags are a closed list', () => {
  const c = newContent({ pageId: '1', pageType: 'x', targetPath: '/s/Home/p' });
  assert.deepEqual(validateContent(c), []);
  assert.ok(FLAG_KINDS.includes('missing-url') && FLAG_KINDS.includes('link-pending'));
});
test('validateContent reports unknown flag kinds, missing target and unknown types', () => {
  const c = newContent({ pageId: '1', pageType: 'x', targetPath: '/s/Home/p' });
  c.flags.push({ kind: 'nope', where: '', text: '' });
  assert.ok(validateContent(c).some((e) => /nope/.test(e)));
  assert.ok(validateContent({ pageId: '1', components: [] }).some((e) => /target\.path/.test(e)));
  const d = newContent({ pageId: '1', pageType: 'x', targetPath: '/s/Home/p' });
  d.components.push({ type: 'zzz', fields: {}, children: [] }, { type: 'accordion', fields: { bogus: 1 }, children: [{ type: 'accordionItem', fields: { heading: 'h' }, children: [] }] });
  const errs = validateContent(d, catalog);
  assert.ok(errs.some((e) => /zzz/.test(e)) && errs.some((e) => /bogus/.test(e)));
  assert.ok(!errs.some((e) => /heading/.test(e)));
});
