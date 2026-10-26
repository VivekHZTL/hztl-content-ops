import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addLesson, listLessons, checkLessons, acceptLessons, exportLessons } from '../plugin/engine/lib/knowledge/lessons.mjs';
import { saveMapping } from '../plugin/engine/lib/knowledge/mappings.mjs';
import { setRule } from '../plugin/engine/lib/knowledge/rules.mjs';
import { lessonsCommand } from '../plugin/engine/lib/cli/lessons.mjs';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';

const H = '/sitecore/content/DemoSite/Demo/Home';
async function project() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-kl-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'demo', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  return projectDir;
}
test('addLesson appends in order, listLessons reads the last n newest first', async () => {
  const p = await project();
  addLesson(p, { area: 'intake', title: 'Phone column is called Main line', body: 'Seen in intake-oct.xlsx.', applies: 'this' });
  addLesson(p, { area: 'plan', title: 'Themes alternate white and sand', body: 'Client has no light theme.', applies: 'all' });
  const all = listLessons(p);
  assert.equal(all.length, 2); assert.equal(all[0].title, 'Themes alternate white and sand'); assert.equal(all[0].applies, 'all');
  assert.equal(listLessons(p, { last: 1 }).length, 1);
  const md = fs.readFileSync(path.join(p, '.content-ops', 'knowledge', 'lessons.md'), 'utf8');
  assert.ok(md.indexOf('Main line') < md.indexOf('sand'), 'file order is append order');
  assert.match(md, /^## \d{4}-\d{2}-\d{2} · intake · Phone column is called Main line$/m);
});
test('lessons refuse secrets and GUIDs', async () => {
  const p = await project();
  assert.throws(() => addLesson(p, { area: 'x', title: 'y', body: 'client_secret=abc' }), /secret|token|password|GUID/i);
  assert.throws(() => addLesson(p, { area: 'x', title: 'y', body: 'item ' + 'a'.repeat(32) }), /GUID/i);
});
test('hand edits are detected; accept re-locks', async () => {
  const p = await project();
  addLesson(p, { area: 'a', title: 'one', body: 'b' });
  assert.equal(checkLessons(p).ok, true);
  const f = path.join(p, '.content-ops', 'knowledge', 'lessons.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('one', 'uno'));
  assert.equal(checkLessons(p).ok, false);
  assert.throws(() => addLesson(p, { area: 'a', title: 'two', body: 'b' }), /edited by hand/);
  acceptLessons(p);
  addLesson(p, { area: 'a', title: 'two', body: 'b' });
  assert.equal(listLessons(p).length, 2);
});
test('export bundles all-project lessons, mapping headers, and merged-candidate rules, never values', async () => {
  const p = await project();
  addLesson(p, { area: 'intake', title: 'local only', body: 'x', applies: 'this' });
  addLesson(p, { area: 'intake', title: 'everyone', body: 'y', applies: 'all' });
  saveMapping(p, { fingerprint: 'f'.repeat(64), headers: ['Slug', 'Hero Title'], tab: 'Sheet1', sourceFile: 'sources/x.xlsx', profile: { sheet: {}, columns: { A: { target: 'key' }, B: { target: 'component.hero.title' } } } });
  setRule(p, 'placeholders', ['COPY TK'], { why: 'client wording' });
  const out = exportLessons(p, { project: 'demo', now: '2026-10-19' });
  assert.equal(out.file.endsWith('lessons-demo-2026-10-19.md'), true);
  const md = fs.readFileSync(out.file, 'utf8');
  assert.match(md, /everyone/); assert.doesNotMatch(md, /local only/);
  assert.match(md, /Slug, Hero Title/); assert.match(md, /component\.hero\.title/);
  assert.match(md, /placeholders.*COPY TK.*client wording/s);
});
test('lessons CLI: add, list, check, export', async () => {
  const p = await project();
  const a = await lessonsCommand(['add', '--area', 'intake', '--title', 'T', '--body', 'B', '--applies', 'all'], { projectDir: p, print: false });
  assert.equal(a.entry.applies, 'all');
  await assert.rejects(lessonsCommand(['add', '--area', 'intake', '--title', 'T'], { projectDir: p, print: false }), /--body/);
  const l = await lessonsCommand(['list', '--last', '5'], { projectDir: p, print: false });
  assert.equal(l.lessons.length, 1);
  assert.equal((await lessonsCommand(['check'], { projectDir: p, print: false })).ok, true);
  const e = await lessonsCommand(['export'], { projectDir: p, print: false });
  assert.ok(fs.existsSync(e.file));
});
