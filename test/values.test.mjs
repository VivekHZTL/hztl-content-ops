import test from 'node:test';
import assert from 'node:assert/strict';
import { sameValue } from '../plugin/engine/lib/verify/values.mjs';

test('links compare by text, target and url or id', () => {
  assert.ok(sameValue('<link text="A" linktype="internal" id="{AB}" target="" />', '<link linktype="internal" text="A" id="{AB}" anchor="" target="" />'));
  assert.ok(!sameValue('<link text="A" url="/x" />', '<link text="A" url="/y" />'));
});
test('rich text compares by text and hrefs, GUID case folded', () => {
  assert.ok(sameValue('<p>Hi <a href="~/link.aspx?_id=abc&amp;_z=z">x</a></p>', '<p>Hi  <a href="~/link.aspx?_id=ABC&_z=z">x</a></p>'));
  assert.ok(!sameValue('<p>Hi</p>', '<p>Hello</p>'));
});
test('guid lists compare case-insensitively; plain strings trim', () => {
  assert.ok(sameValue('{AB}|{CD}', '{ab}|{cd}'));
  assert.ok(sameValue(' x ', 'x'));
  assert.ok(sameValue(undefined, ''));
});
