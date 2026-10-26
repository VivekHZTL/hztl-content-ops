import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderDryRun, renderRun, renderCombined } from '../plugin/engine/lib/report/render.mjs';
import { CATEGORIES } from '../plugin/engine/lib/report/pending.mjs';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { reportCommand } from '../plugin/engine/lib/cli/report.mjs';

const run = { runId: 'r1_dev_plan', env: 'dev', host: 'h', createdAt: '2026-10-19T10:00:00Z', sources: [{ file: 'sources/a.xlsx', sha256: 'abc123def' }], pages: [
  { key: 'p1', pageId: '1.1', path: '/s/Home/p1', status: 'ready', reasons: [], pending: [{ category: 'placeholder', text: 'heading: contains "[TBD]"', where: 'Hero', locator: "'Clinics'!B3" }], ops: { creates: [{ name: 'RTE' }], updates: [{ ref: 'page', field: 'pageTitle', from: 'Old', to: 'New' }], layout: { to: 'x' }, rename: null }, diff: { components: { before: ['Hero'], after: ['Hero', 'Rich Text'] }, fields: [{ ref: 'page', field: 'pageTitle', from: 'Old', to: 'New </script> & <b>' }] }, layout: { after: ['Hero', 'Rich Text'] } },
  { key: 'p2', pageId: '1.2', path: '/s/Home/p2', status: 'needs-review', reasons: ['Unknown component type "zzz"'], pending: [], ops: null },
  { key: 'p3', pageId: '1.3', path: '/s/Home/p3', status: 'up-to-date', reasons: [], pending: [], ops: { creates: [], updates: [], layout: null, rename: null }, diff: { components: { before: [], after: [] }, fields: [] } },
] };
const results = { applyId: 'a1', runId: 'r1_dev_plan', env: 'dev', results: [{ key: 'p1', status: 'rolled-back', error: 'Verification failed', verify: ['Layout is [x], expected [y]'] }, { key: 'p3', status: 'skipped', error: 'Status is up-to-date' }], notStarted: [], counts: { 'rolled-back': 1, skipped: 1 } };

test('dry-run report carries counts, categories with next steps, locators, and escapes data', () => {
  const html = renderDryRun(run);
  assert.match(html, /<title>/);
  assert.match(html, /ready/); assert.match(html, /needs-review/);
  assert.match(html, new RegExp(CATEGORIES.placeholder.title));
  assert.match(html, /'Clinics'!B3/);
  assert.ok(!html.includes('</script> &'), 'data must not break out of the script tag');
  assert.ok(!/<link\s|<script\s+src=|url\(https?:\/\//.test(html), 'no external resources');
  assert.match(html, /prefers-color-scheme/);
});
test('run report lists rolled-back under Not written with the error and no undo command', () => {
  const html = renderRun(run, results);
  const notWritten = html.slice(html.indexOf('Not written'));
  assert.match(notWritten, /rolled-back/); assert.match(notWritten, /Verification failed/);
  assert.ok(!/content-ops undo[^<]*--page p1\b/.test(html), 'no undo for a page that was not written');
});
test('combined report dedupes a page written in two runs, keeping the latest status', () => {
  const r2 = { ...results, applyId: 'a2', results: [{ key: 'p1', status: 'done' }] };
  const html = renderCombined([{ run, results: [results] }, { run: { ...run, runId: 'r2_dev_plan' }, results: [r2] }]);
  assert.equal((html.match(/"key":"p1"/g) || []).length, 1);
  assert.match(html, /"status":"done"/);
});
test('report command writes report.html and a run report when results exist', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-rep-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/s', homePath: '/s/Home', environments: [{ name: 'dev' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  const dir = path.join(projectDir, 'runs', run.runId); fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, 'plan.json'), run); writeJson(path.join(dir, 'results-a1.json'), results);
  const out = await reportCommand(['--run', run.runId], { projectDir, print: false });
  assert.ok(fs.existsSync(path.join(projectDir, out.files[0])));
  assert.ok(out.files.some((f) => /run-report-a1\.html$/.test(f)));
  const c = await reportCommand(['--combined', '--env', 'dev'], { projectDir, print: false });
  assert.ok(fs.existsSync(path.join(projectDir, c.files[0])));
});
