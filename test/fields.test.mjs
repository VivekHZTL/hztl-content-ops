import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPlaceholder, linkXml, buildFieldValue } from '../plugin/engine/lib/plan/fields.mjs';
import { DEFAULT_RULES } from '../plugin/engine/lib/config/project.mjs';

const rules = DEFAULT_RULES;
test('hasPlaceholder finds tokens case-insensitively inside strings and objects', () => {
  assert.equal(hasPlaceholder('Call [tbd] today', rules.placeholders), '[TBD]');
  assert.equal(hasPlaceholder({ text: 'x', url: 'lorem ipsum' }, rules.placeholders), 'lorem');
  assert.equal(hasPlaceholder('fine', rules.placeholders), null);
});
test('linkXml builds internal, external, tel and file links with the new-tab policy', () => {
  assert.match(linkXml({ text: 'A & B', id: 'a'.repeat(32) }, rules.newTab), /linktype="internal".*id="\{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA\}"/);
  assert.match(linkXml({ text: 'A & B', id: 'a'.repeat(32) }, rules.newTab), /text="A &amp; B"/);
  assert.match(linkXml({ text: 'x', url: 'https://example.org/p' }, rules.newTab), /linktype="external".*target="_blank"/);
  assert.match(linkXml({ text: 'x', url: '/services/care' }, rules.newTab), /url="\/services\/care".*target=""/);
  assert.match(linkXml({ text: 'x', url: 'tel:+15551234567' }, rules.newTab), /target=""/);
  assert.match(linkXml({ text: 'x', url: '/files/a.pdf' }, rules.newTab), /target="_blank"/);
  assert.match(linkXml({ text: 'x', url: 'mailto:a@b.c' }, rules.newTab), /linktype="mailto"/);
});
test('buildFieldValue by field type', () => {
  const t = (type) => ({ name: 'f', type });
  assert.deepEqual(buildFieldValue(t('Single-Line Text'), 'Hello', { rules }), { value: 'Hello' });
  assert.match(buildFieldValue(t('General Link'), { text: 'x', url: 'https://e.org' }, { rules }).value, /^<link /);
  assert.match(buildFieldValue(t('General Link'), 'https://e.org', { rules }).value, /url="https:\/\/e.org"/);
  assert.equal(buildFieldValue(t('Multilist'), ['a'.repeat(32), 'b'.repeat(32)], { rules }).value, '{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}|{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}');
  assert.equal(buildFieldValue(t('Droplink'), 'a'.repeat(32), { rules }).value, '{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}');
  assert.equal(buildFieldValue(t('Image'), { asset: { id: 1 } }, { rules }).value, '{"asset":{"id":1}}');
  assert.equal(buildFieldValue(t('Rich Text'), '<p>Call [TBD]</p>', { rules }).pending.category, 'placeholder');
  assert.equal(buildFieldValue(t('Weird Type'), { a: 1 }, { rules }).pending.category, 'no-field');
  assert.equal(buildFieldValue(t('Weird Type'), 'plain', { rules }).value, 'plain');
});
