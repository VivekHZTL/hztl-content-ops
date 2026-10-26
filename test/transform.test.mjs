import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripImages, unwrapAnchors, rewriteHrefs, replaceText } from '../plugin/engine/lib/transform/rte.mjs';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { transformCommand } from '../plugin/engine/lib/cli/transform.mjs';
import { catalog } from './_catalog.mjs';

test('stripImages removes matching images, keeps comments, collapses emptied wrappers innermost first', () => {
  const html = '<p>Keep</p><!-- <img src="/-/media/x.jpg"> --><div><p><img src="/-/media/a.jpg" alt="a"></p></div><p><img src="https://dam.example.org/b.jpg"> text</p>';
  const { html: out, changes } = stripImages(html, { hostPattern: '/-/media/' });
  assert.equal(changes, 1);
  assert.ok(out.includes('<!-- <img src="/-/media/x.jpg"> -->'), 'comment kept');
  assert.ok(!out.includes('<div><p></p></div>') && !out.includes('<div></div>'), 'empty wrappers removed');
  assert.ok(out.includes('dam.example.org/b.jpg'));
});
test('unwrapAnchors keeps the text; rewriteHrefs applies rules; replaceText only outside tags', () => {
  const u = unwrapAnchors('<p>Call <a href="/ped">Patient Education Department</a> or <a href="/x">us</a></p>', { text: 'Patient Education Department' });
  assert.equal(u.html, '<p>Call Patient Education Department or <a href="/x">us</a></p>'); assert.equal(u.changes, 1);
  const r = rewriteHrefs('<a href="https://old.example.org/a/b">x</a><a href="/keep">y</a>', [{ match: '^https://old\\.example\\.org/(.*)$', replace: '/$1' }]);
  assert.equal(r.html, '<a href="/a/b">x</a><a href="/keep">y</a>'); assert.equal(r.changes, 1);
  const t = replaceText('<p class="Acme">Acme Health</p>', { find: 'Acme', replace: 'Demo' });
  assert.equal(t.html, '<p class="Acme">Demo Health</p>'); assert.equal(t.changes, 1);
});
test('transform command edits matching fields in work/, logs counts and flags each change confirm', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-tr-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/s', homePath: '/s/Home', environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), catalog);
  writeJson(path.join(projectDir, 'work', 'p.json'), { pageId: 'p', pageType: 'generalLanding', target: { path: '/s/Home/p', mode: 'update' }, components: [{ type: 'richText', fields: { text: '<p><img src="/-/media/a.jpg"> Hello <a href="/ped">PED</a></p>' }, children: [] }], flags: [], sources: [], locators: {} });
  writeJson(path.join(projectDir, 'rules.json'), [{ rule: 'strip-images', components: ['richText'], fields: ['text'], hostPattern: '/-/media/' }, { rule: 'unwrap-anchors', components: ['richText'], fields: ['text'], text: 'PED' }]);
  const out = await transformCommand(['--rules', path.join(projectDir, 'rules.json')], { projectDir, print: false });
  assert.equal(out.files, 1); assert.equal(out.changes, 2);
  const c = JSON.parse(fs.readFileSync(path.join(projectDir, 'work', 'p.json'), 'utf8'));
  assert.equal(c.components[0].fields.text, '<p> Hello PED</p>');
  assert.equal(c.flags.filter((f) => f.kind === 'confirm').length, 2);
  assert.ok(fs.existsSync(path.join(projectDir, 'work', 'transform-log.json')));
});
