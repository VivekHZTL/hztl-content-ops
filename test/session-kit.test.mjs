import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSessionKit } from '../plugin/scripts/build-session-kit.mjs';
import { unzip } from '../plugin/engine/lib/ingest/xlsx.mjs';
import { zipStore, crc32 } from '../plugin/engine/lib/util/zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function demo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-kit-'));
  fs.mkdirSync(path.join(d, '.content-ops/knowledge'), { recursive: true });
  fs.writeFileSync(path.join(d, '.content-ops/project.json'), '{"name":"demo"}');
  fs.writeFileSync(path.join(d, '.content-ops/catalog.json'), '{}');
  fs.mkdirSync(path.join(d, 'node_modules/x'), { recursive: true }); fs.writeFileSync(path.join(d, 'node_modules/x/index.js'), '1');
  fs.mkdirSync(path.join(d, '.git')); fs.writeFileSync(path.join(d, '.git/HEAD'), 'ref');
  fs.writeFileSync(path.join(d, '.env.local'), 'SITECORE_CLIENT_SECRET=zz');
  fs.writeFileSync(path.join(d, 'notes.txt'), 'hello');
  fs.writeFileSync(path.join(d, 'server.key'), 'k');
  fs.writeFileSync(path.join(d, 'innocent.txt'), 'SITECORE_CLIENT_SECRET=leaked-by-name');
  fs.mkdirSync(path.join(d, 'sources')); fs.writeFileSync(path.join(d, 'sources/template-generalLanding.xlsx'), 'x'); fs.writeFileSync(path.join(d, 'sources/client.xlsx'), 'y');
  fs.mkdirSync(path.join(d, 'runs/r1'), { recursive: true }); fs.writeFileSync(path.join(d, 'runs/r1/plan.json'), '{}');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-kit-out-')); fs.writeFileSync(path.join(outside, 'prod.env'), 'SITECORE_CLIENT_SECRET=pp');
  fs.symlinkSync(outside, path.join(d, 'creds-link'));
  for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(d, `f${i}.md`), String(i));
  return d;
}
test('zipStore round-trips through unzip and crc32 matches zlib', async () => {
  const z = zipStore([['a/b.txt', 'hi'], ['c.bin', Buffer.from([1, 2, 3])]]);
  const files = unzip(z);
  assert.equal(files['a/b.txt'](), 'hi');
  const { crc32: zc } = await import('node:zlib');
  assert.equal(crc32(Buffer.from('hello')), zc(Buffer.from('hello')));
});
test('kit includes project config, START-HERE and cards; refuses secrets, keys, symlinks, node_modules, runs, client sources', () => {
  const d = demo();
  const out = path.join(d, '..', `kit-${path.basename(d)}.zip`);
  const r = buildSessionKit({ projectDir: d, out, pluginDir: path.join(root, 'plugin') });
  const names = Object.keys(unzip(fs.readFileSync(out)));
  assert.ok(names.includes('START-HERE.md')); assert.ok(names.includes('training/take-home-card.md')); assert.ok(names.includes('training/session-run-sheet.md'));
  assert.ok(names.includes('.content-ops/project.json') && names.includes('.content-ops/catalog.json') && names.includes('notes.txt'));
  assert.ok(names.includes('sources/template-generalLanding.xlsx')); assert.ok(!names.includes('sources/client.xlsx'));
  for (const bad of ['.env.local', 'server.key', 'innocent.txt', 'node_modules/x/index.js', '.git/HEAD', 'runs/r1/plan.json', 'creds-link/prod.env', 'creds-link']) assert.ok(!names.includes(bad), bad);
  assert.ok(r.refused.some((x) => x.path === '.env.local' && /credential/i.test(x.why)));
  assert.ok(r.refused.some((x) => x.path === 'innocent.txt' && /secret/i.test(x.why)));
  assert.ok(r.refused.some((x) => x.path === 'creds-link' && /symlink/i.test(x.why)));
  assert.equal(r.files, names.length); assert.ok(r.bytes > 0);
  assert.ok(r.top.length <= 20, 'summary lists at most 20 paths');
});
test('refuses a project folder that is not a content-ops project', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-kit-bad-'));
  assert.throws(() => buildSessionKit({ projectDir: d, out: path.join(d, 'k.zip'), pluginDir: path.join(root, 'plugin') }), /\.content-ops\/project\.json/);
});
test('R-F3: kit refuses nested client sources, *.env by name, secrets past 4 KB, its own output, and lets kit files win a name clash', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-kit-r-'));
  fs.mkdirSync(path.join(d, '.content-ops'), { recursive: true }); fs.writeFileSync(path.join(d, '.content-ops/project.json'), '{"name":"demo"}');
  fs.mkdirSync(path.join(d, 'sources/nested'), { recursive: true }); fs.writeFileSync(path.join(d, 'sources/nested/client.xlsx'), 'y'); fs.writeFileSync(path.join(d, 'sources/template-x.xlsx'), 'x');
  fs.mkdirSync(path.join(d, 'sub')); fs.writeFileSync(path.join(d, 'sub/prod.env'), 'OTHER_NAME=zz');
  fs.writeFileSync(path.join(d, 'deep.txt'), 'a'.repeat(5000) + '\nSITECORE_CLIENT_SECRET=late');
  fs.writeFileSync(path.join(d, 'START-HERE.md'), 'project copy, must lose');
  const out = path.join(d, 'kit.zip');
  const r1 = buildSessionKit({ projectDir: d, out, pluginDir: path.join(root, 'plugin') });
  const names = Object.keys(unzip(fs.readFileSync(out)));
  for (const bad of ['sources/nested/client.xlsx', 'sub/prod.env', 'deep.txt', 'kit.zip']) assert.ok(!names.includes(bad), bad);
  assert.equal(names.filter((n) => n === 'START-HERE.md').length, 1);
  assert.notEqual(unzip(fs.readFileSync(out))['START-HERE.md'](), 'project copy, must lose');
  assert.ok(r1.refused.some((x) => x.path === 'sub/prod.env' && /credential/i.test(x.why)));
  assert.ok(r1.refused.some((x) => x.path === 'deep.txt' && /secret/i.test(x.why)));
  assert.ok(r1.refused.some((x) => x.path === 'START-HERE.md' && /kit/i.test(x.why)));
  const r2 = buildSessionKit({ projectDir: d, out, pluginDir: path.join(root, 'plugin') });
  assert.equal(r2.files, r1.files, 'a second run does not zip the first zip');
});
