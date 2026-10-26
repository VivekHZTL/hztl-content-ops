import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanRepoComponents, attachCodePaths } from '../plugin/engine/lib/catalog/repo.mjs';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-repo-'));
for (const f of ['src/components/x/Accordion.tsx', 'src/components/x/Accordion.stories.tsx', 'src/components/x/Accordion.test.tsx', 'src/components/deep/er/FeatureSideBySide.tsx', 'src/other/Nope.tsx']) { fs.mkdirSync(path.join(repo, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), ''); }
test.after(() => fs.rmSync(repo, { recursive: true, force: true }));

test('scanRepoComponents maps component names to files under src/components', () => {
  const m = scanRepoComponents(repo);
  assert.deepEqual(Object.keys(m).sort(), ['Accordion', 'FeatureSideBySide']);
  assert.equal(m.Accordion, 'src/components/x/Accordion.tsx');
});
test('attachCodePaths sets codePath by name without spaces, case-insensitive', () => {
  const cat = { components: { accordion: { name: 'Accordion' }, fsbs: { name: 'Feature Side by Side' }, x: { name: 'Nothing Here' } } };
  attachCodePaths(cat, scanRepoComponents(repo));
  assert.equal(cat.components.accordion.codePath, 'src/components/x/Accordion.tsx');
  assert.equal(cat.components.fsbs.codePath, 'src/components/deep/er/FeatureSideBySide.tsx');
  assert.equal(cat.components.x.codePath, null);
});
