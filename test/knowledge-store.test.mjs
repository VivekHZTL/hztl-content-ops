import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { knowledgeDir, ensureKnowledge } from '../plugin/engine/lib/knowledge/store.mjs';
import { headerFingerprint } from '../plugin/engine/lib/knowledge/fingerprint.mjs';

test('ensureKnowledge creates the folder tree once and is idempotent', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-k-'));
  const d = ensureKnowledge(p);
  assert.equal(d, path.join(p, '.content-ops', 'knowledge'));
  assert.equal(knowledgeDir(p), d);
  for (const sub of ['mappings', 'adapters']) assert.ok(fs.statSync(path.join(d, sub)).isDirectory());
  assert.equal(ensureKnowledge(p), d);
});
test('headerFingerprint ignores case and whitespace but not order', () => {
  const a = headerFingerprint(['Slug', ' Page Title', 'Hero  Title'], 'Sheet1');
  const b = headerFingerprint(['slug', 'page title', 'hero title'], 'sheet1');
  const c = headerFingerprint(['Page Title', 'Slug', 'Hero Title'], 'Sheet1');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});
test('headerFingerprint changes with the tab name', () => {
  assert.notEqual(headerFingerprint(['a'], 'x'), headerFingerprint(['a'], 'y'));
});
