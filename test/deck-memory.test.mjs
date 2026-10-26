import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../plugin/engine/lib/config/project.mjs';
import { setupCommand } from '../plugin/engine/lib/cli/setup.mjs';
import { intakeCommand } from '../plugin/engine/lib/cli/intake.mjs';
import { docxToText } from '../plugin/engine/lib/ingest/docx.mjs';
import { deckHeadings } from '../plugin/engine/lib/ingest/deck-adapter.mjs';
import { deckFingerprint, listMappings } from '../plugin/engine/lib/knowledge/mappings.mjs';
import { catalog } from './_catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const H = '/sitecore/content/DemoSite/Demo/Home';
async function project() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cops-dm-'));
  writeJson(path.join(projectDir, 'answers.json'), { name: 'd', siteRoot: '/sitecore/content/DemoSite/Demo', homePath: H, environments: [{ name: 'fake' }] });
  await setupCommand(['--answers', path.join(projectDir, 'answers.json')], { projectDir, print: false });
  writeJson(path.join(projectDir, '.content-ops', 'catalog.json'), catalog);
  fs.copyFileSync(path.join(here, 'fixtures/deck.docx'), path.join(projectDir, 'sources', 'deck.docx'));
  return projectDir;
}
test('deckHeadings lists the deck headings in order; a reworded heading changes the fingerprint', () => {
  const text = docxToText(fs.readFileSync(path.join(here, 'fixtures/deck.docx')));
  const h = deckHeadings(text);
  assert.ok(h.length >= 2, JSON.stringify(h));
  const a = deckFingerprint(text);
  assert.equal(a.kind, 'deck'); assert.match(a.fingerprint, /^[0-9a-f]{64}$/);
  const b = deckFingerprint(text.replace(h[0], h[0] + ' (new)'));
  assert.notEqual(a.fingerprint, b.fingerprint);
});
test('intake remembers a confirmed section map and reuses it for the same deck shape', async () => {
  const projectDir = await project();
  const first = await intakeCommand(['--parent-path', H, '--page-type', 'generalLanding'], { projectDir, print: false });
  assert.ok(first.proposed.some((p) => /section-map/.test(p)));
  const second = await intakeCommand(['--parent-path', H, '--page-type', 'generalLanding', '--section-map', path.join(projectDir, 'work', 'section-map.proposed.json')], { projectDir, print: false });
  assert.ok(second.pages > 0);
  const maps = listMappings(projectDir);
  assert.equal(maps.length, 1); assert.equal(maps[0].kind, 'deck');
  const third = await intakeCommand(['--parent-path', H, '--page-type', 'generalLanding'], { projectDir, print: false });
  assert.equal(third.proposed.length, 0, JSON.stringify(third.proposed));
  assert.equal(third.pages, second.pages);
  assert.ok(third.mappings.some((m) => m.kind === 'deck' && m.reused));
});

test('R-F2: a deck with no component headings is never remembered or reused', async () => {
  const projectDir = await project();
  fs.rmSync(path.join(projectDir, 'sources', 'deck.docx'));
  const { writeWorkbook } = await import('../plugin/engine/lib/ingest/xlsx-write.mjs'); void writeWorkbook;
  // a docx with plain paragraphs only: reuse the fixture's zip structure by stripping headings from its text is not possible,
  // so build a minimal docx by hand
  const { zipStore } = await import('../plugin/engine/lib/util/zip.mjs');
  const docx = zipStore([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Just a brief with no component headings.</w:t></w:r></w:p></w:body></w:document>'],
  ]);
  fs.writeFileSync(path.join(projectDir, 'sources', 'brief.docx'), docx);
  const first = await intakeCommand(['--parent-path', H, '--page-type', 'generalLanding', '--section-map', path.join(here, 'fixtures/empty-section-map.json')], { projectDir, print: false }).catch((e) => ({ error: e.message }));
  assert.equal(listMappings(projectDir).length, 0, 'nothing remembered for a heading-less deck');
  assert.ok((first.errors || []).some((e) => /no component headings/i.test(e)) || first.error, JSON.stringify(first));
});
