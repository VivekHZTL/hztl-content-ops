import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addDecision, listDecisions, loadOverrides, applyOverrides } from '../plugin/engine/lib/decisions/register.mjs';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { newContent } from '../plugin/engine/lib/content/schema.mjs';

const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-dec-')); fs.mkdirSync(path.join(d, '.content-ops'));
test.after(() => fs.rmSync(d, { recursive: true, force: true }));

test('decisions are numbered and persisted', () => {
  const a = addDecision(d, { scope: 'themes', decision: 'alternate white/light', reason: 'design', who: 'tester' });
  const b = addDecision(d, { scope: 'links', decision: 'pdf new tab', reason: 'a11y', who: 'tester' });
  assert.equal(a.id, 'D-1'); assert.equal(b.id, 'D-2');
  assert.equal(listDecisions(d).length, 2);
  assert.ok(listDecisions(d)[1].date);
});
test('overrides apply by locator and by url rule, and are recorded', () => {
  writeJson(path.join(d, '.content-ops', 'overrides.json'), { cells: { "'Clinics'!C3": { value: 'Fixed tagline', why: 'client email 10-18', who: 'tester' } }, links: { "'Clinics'!D3": 'https://example.org/book' }, urls: [{ match: '^https?://old\\.example\\.org/(.*)$', replace: '/$1', why: 'domain move' }] });
  const c = newContent({ pageId: '1', pageType: 'x', targetPath: '/s/Home/p' });
  c.components.push({ type: 'hero', fields: { tagline: 'Old', cta: { text: 'Book', url: '' }, more: { text: 'x', url: 'https://old.example.org/a/b' } }, children: [] });
  c.locators = { 'components.0.fields.tagline': "'Clinics'!C3", 'components.0.fields.cta': "'Clinics'!D3" };
  const out = applyOverrides(c, loadOverrides(d));
  assert.equal(out.components[0].fields.tagline, 'Fixed tagline');
  assert.equal(out.components[0].fields.cta.url, 'https://example.org/book');
  assert.equal(out.components[0].fields.more.url, '/a/b');
  assert.equal(out.appliedOverrides.length, 3);
  assert.ok(out.flags.some((f) => f.kind === 'confirm' && /client email/.test(f.text)));
  assert.equal(c.components[0].fields.tagline, 'Old', 'input not mutated');
});
