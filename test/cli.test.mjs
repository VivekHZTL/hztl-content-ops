import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../plugin/engine/bin/content-ops.mjs');

test('--version prints the package version', () => {
  const out = execFileSync(process.execPath, [bin, '--version'], { encoding: 'utf8' });
  assert.equal(out.trim(), JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')).version);
});
