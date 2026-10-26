import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { docxToText } from '../plugin/engine/lib/ingest/docx.mjs';
import { proposeSectionMap, deckToContent } from '../plugin/engine/lib/ingest/deck-adapter.mjs';
import { validateContent } from '../plugin/engine/lib/content/schema.mjs';
import { catalog } from './_catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const text = docxToText(fs.readFileSync(path.join(here, 'fixtures/deck.docx')));

test('proposeSectionMap aliases a misspelled heading to the catalog component and maps labels to fields', () => {
  const map = proposeSectionMap(text, catalog);
  assert.equal(map.aliases['accodion'], 'accordion');
  assert.equal(map.fields.accordion['title'], 'title');
  assert.equal(map.childFields.accordion['heading'], 'heading');
  assert.equal(map.childFields.accordion['copy'], 'content');
  assert.ok(map.unmatched.includes('mystery block'));
});
test('deckToContent builds components, children and flags with line locators', () => {
  const map = proposeSectionMap(text, catalog);
  const c = deckToContent(text, map, { catalog, pageType: 'generalLanding', targetPath: '/s/Home/north-clinic', sourceFile: 'sources/deck.docx', sha256: 'abc' });
  assert.equal(c.pageId, '12.3');
  const acc = c.components.find((x) => x.type === 'accordion');
  assert.equal(acc.fields.title, 'Why choose us');
  assert.equal(acc.children.length, 2);
  assert.deepEqual(acc.children[1].fields, { heading: 'Hours', content: 'Mon-Fri' });
  assert.match(c.locators[`components.${c.components.indexOf(acc)}.fields.title`], /^deck line \d+$/);
  const other = c.components.find((x) => x.type === 'other');
  assert.ok(other && /Some copy nobody mapped/.test(other.raw));
  assert.ok(c.flags.some((f) => f.kind === 'unmapped' && /Mystery Block/.test(f.text)));
  assert.ok(other.links.some((l) => l.url === 'https://example.org/x?a=1&b=2' && l.pid === '45.10' && l.text === 'our site'));
  assert.deepEqual(validateContent({ ...c, components: c.components.filter((x) => x.type !== 'other') }, catalog), []);
});
