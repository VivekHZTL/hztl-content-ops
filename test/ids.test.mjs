import test from 'node:test';
import assert from 'node:assert/strict';
import { normId, braced, sameId } from '../plugin/engine/lib/cm/ids.mjs';

test('normId strips braces and dashes and lowercases', () => {
  assert.equal(normId('{D8401815-AE71-411A-B398-6D260E17C36B}'), 'd8401815ae71411ab3986d260e17c36b');
  assert.equal(normId(''), '');
  assert.equal(normId(undefined), '');
});
test('braced rebuilds the canonical form', () => {
  assert.equal(braced('d8401815ae71411ab3986d260e17c36b'), '{D8401815-AE71-411A-B398-6D260E17C36B}');
});
test('sameId ignores format', () => {
  assert.ok(sameId('{D8401815-AE71-411A-B398-6D260E17C36B}', 'd8401815-ae71-411a-b398-6d260e17c36b'));
  assert.ok(!sameId('d8401815ae71411ab3986d260e17c36b', 'd8401815ae71411ab3986d260e17c36c'));
});
