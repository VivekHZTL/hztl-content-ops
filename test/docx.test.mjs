import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { docxToText } from '../plugin/engine/lib/ingest/docx.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
test('docxToText renders paragraphs, tables, bullets and hyperlinks', () => {
  const t = docxToText(fs.readFileSync(path.join(here, 'fixtures/deck.docx')));
  assert.match(t, /Title \| Why choose us/);
  assert.match(t, /• First bullet/);
  assert.match(t, /our site⟨https:\/\/example\.org\/x\?a=1&b=2⟩/);
  assert.match(t, /Component \| Accodion/);
  assert.ok(!/<w:/.test(t));
});
