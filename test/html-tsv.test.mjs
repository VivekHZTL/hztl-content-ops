import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToBlocks, proposePlacement } from '../plugin/engine/lib/ingest/html.mjs';
import { readTsv } from '../plugin/engine/lib/ingest/tsv.mjs';

const html = `<html><head><title>Heart care | Legacy</title><meta name="description" content="Heart services"></head><body><script>var x=1;</script><nav>Menu</nav>
<h1>Heart care</h1><p>We treat <a href="/old/afib">AFib</a> and more.</p><p>Second para &amp; friends.</p><ul><li>One</li><li>Two</li></ul><img src="/img/heart.jpg" alt="A heart"><iframe src="https://player.example/v/1"></iframe><footer>Foot</footer></body></html>`;
test('htmlToBlocks extracts title, meta, h1 and blocks without chrome or scripts', () => {
  const out = htmlToBlocks(html);
  assert.equal(out.title, 'Heart care | Legacy');
  assert.equal(out.meta.description, 'Heart services');
  assert.equal(out.h1, 'Heart care');
  assert.deepEqual(out.blocks.map((b) => b.kind), ['heading', 'text', 'text', 'list', 'image', 'embed']);
  assert.match(out.blocks[1].text, /<a href="\/old\/afib">AFib<\/a>/);
  assert.equal(out.blocks[2].text, 'Second para & friends.');
  assert.deepEqual(out.blocks[3].items, ['One', 'Two']);
  assert.equal(out.blocks[4].alt, 'A heart');
  assert.ok(!JSON.stringify(out).includes('var x=1') && !JSON.stringify(out).includes('Menu'));
  assert.equal(out.blocks[0].locator, '#block-1');
});
test('proposePlacement ranks the sitemap entry that shares title and url words first', () => {
  const r = proposePlacement({ title: 'Heart care | Legacy', url: 'https://old.example.org/services/heart-care', h1: 'Heart care' }, [{ pid: '12', name: 'Heart care (MHI)', url: '/services/heart-care' }, { pid: '13', name: 'Cancer care', url: '/services/cancer-care' }, { pid: '1', name: 'Home', url: '/' }]);
  assert.equal(r[0].pid, '12');
  assert.ok(r[0].score > r[1].score);
  assert.ok(r[0].why);
});
test('readTsv parses headers and rows, tolerating CR', () => {
  assert.deepEqual(readTsv('pageId\ttitle\r\n1\tA\r\n2\tB\n'), [{ pageId: '1', title: 'A' }, { pageId: '2', title: 'B' }]);
});
