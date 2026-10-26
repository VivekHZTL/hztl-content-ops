import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerSource, listSources, verifySources, hashFile } from '../plugin/engine/lib/sources/manifest.mjs';

const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-src-'));
fs.mkdirSync(path.join(d, 'sources')); fs.mkdirSync(path.join(d, '.content-ops'));
const f = path.join(d, 'sources', 'deck.txt'); fs.writeFileSync(f, 'v1');
test.after(() => fs.rmSync(d, { recursive: true, force: true }));

test('register, list, verify, change, missing, re-register', () => {
  const e = registerSource({ projectDir: d, file: f, note: 'v1 from client', by: 'tester' });
  assert.equal(e.file, 'sources/deck.txt');
  assert.equal(e.sha256, hashFile(f));
  assert.equal(listSources(d).length, 1);
  assert.equal(verifySources(d)[0].status, 'ok');
  fs.writeFileSync(f, 'v2');
  assert.equal(verifySources(d)[0].status, 'changed');
  fs.rmSync(f);
  assert.equal(verifySources(d)[0].status, 'missing');
  fs.writeFileSync(f, 'v3');
  registerSource({ projectDir: d, file: f, note: 'v3' });
  assert.equal(listSources(d).length, 1);
  assert.equal(verifySources(d)[0].status, 'ok');
});
