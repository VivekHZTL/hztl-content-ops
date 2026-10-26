import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, mdText, buildRollout } from '../plugin/scripts/build-rollout.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugin = path.join(root, 'plugin');
const diagrams = (name) => { const f = path.join(plugin, 'rollout/diagrams', `${name}.svg`); if (!fs.existsSync(f)) throw new Error(`No diagram "${name}" at ${f}`); return fs.readFileSync(f, 'utf8'); };

test('renderMarkdown escapes text, keeps code fences whole, inlines diagrams, drops the fallback image line', () => {
  const md = '# A & B <c>\n\nSome `x < y` text with **bold** and a [link](https://example.test).\n\n<!-- diagram: daily-loop -->\n![Daily loop](rollout/diagrams/daily-loop.svg)\n\n```bash\n# not a heading\ncontent-ops check --project d --env dev\n```\n\n| Who | Can |\n|---|---|\n| Author & co | `plan` |\n\n- one\n- two\n';
  const { html, text } = renderMarkdown(md, { diagrams });
  assert.match(html, /<h1[^>]*>A &amp; B &lt;c&gt;<\/h1>/);
  assert.match(html, /<code>x &lt; y<\/code>/);
  assert.match(html, /<a href="https:\/\/example.test"[^>]*>link<\/a>/);
  assert.match(html, /<svg[^>]*role="img"/); assert.doesNotMatch(html, /<img/);
  assert.match(html, /<pre><code[^>]*># not a heading\ncontent-ops check/); assert.doesNotMatch(html, /<h1[^>]*>not a heading/);
  assert.match(html, /<td>Author &amp; co<\/td>/);
  assert.match(html, /<li>one<\/li><li>two<\/li>/);
  assert.equal(text, mdText(md));
});
test('an unknown diagram name fails the build with its name', () => {
  assert.throws(() => renderMarkdown('<!-- diagram: nope -->\n', { diagrams }), /nope/);
});
test('unsupported markdown throws rather than rendering wrong', () => {
  assert.throws(() => renderMarkdown('> a quote\n', { diagrams }), /blockquote|unsupported/i);
});
test('R-F2: nested lists and stray HTML comments throw instead of flattening or showing', () => {
  assert.throws(() => renderMarkdown('- parent\n  - child\n- next\n', { diagrams }), /nested list/i);
  assert.throws(() => renderMarkdown('<!-- a stray note -->\n', { diagrams }), /comment|diagram marker/i);
  assert.throws(() => renderMarkdown('<!-- diagram: Daily-Loop -->\n', { diagrams }), /comment|diagram marker/i);
});
test('R-F2: the rollout page and card never promise an undo command before apply', () => {
  for (const f of ['ROLLOUT.md', 'training/take-home-card.md']) {
    const s = fs.readFileSync(path.join(plugin, f), 'utf8');
    assert.doesNotMatch(s, /undo command[^.]*before/i, f); assert.doesNotMatch(s, /shown before every apply/i, f);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(plugin, 'ROLLOUT.md'), 'utf8'), /\.content-ops\/role/);
});
test('ROLLOUT.md and index.html say the same thing; the page is self-contained and theme-aware', () => {
  const md = fs.readFileSync(path.join(plugin, 'ROLLOUT.md'), 'utf8');
  const { out } = buildRollout({ pluginDir: plugin });
  const html = fs.readFileSync(out, 'utf8');
  const { text } = renderMarkdown(md, { diagrams });
  assert.equal(text, mdText(md));
  assert.ok(html.includes('with every write planned first, journaled, verified and undoable'));
  assert.match(html, /<title>[^<]{3,40}<\/title>/);
  assert.doesNotMatch(html, /<script src=|<link [^>]*href="https?:\/\/(?!fonts\.googleapis)/);
  assert.match(html, /:root:not\(\[data-theme="light"\]\)/); assert.match(html, /:root\[data-theme="dark"\]/); assert.match(html, /body\s*\{[^}]*background/);
  assert.equal((html.match(/<svg/g) || []).length, 3);
  assert.ok(fs.statSync(out).size < 400 * 1024);
  for (const h of ['Where things live', 'The daily loop', 'Who can do what', 'Safety in one screen', 'How it learns', 'FAQ', 'Links']) assert.ok(html.includes(h), h);
});
