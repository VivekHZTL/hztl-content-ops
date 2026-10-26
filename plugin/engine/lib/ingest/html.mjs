// Legacy web page → blocks, and a placement proposal against the new sitemap (always to be confirmed).
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const stripTags = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const keepLinks = (s) => decode(s.replace(/<(?!\/?a\b)[^>]+>/g, '').replace(/<a\s[^>]*href="([^"]*)"[^>]*>/gi, '<a href="$1">')).replace(/\s+/g, ' ').trim();

export function htmlToBlocks(html) {
  let h = String(html || '');
  const title = stripTags(h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const description = decode(h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || h.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] || '');
  h = h.replace(/<(script|style|noscript|svg|nav|footer|header|form)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const body = h.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? h;
  const blocks = [];
  const re = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>|<p\b[^>]*>([\s\S]*?)<\/p>|<(ul|ol)\b[^>]*>([\s\S]*?)<\/\4>|<img\b[^>]*>|<iframe\b[^>]*>/gi;
  let m, h1 = '';
  while ((m = re.exec(body))) {
    const raw = m[0];
    let b = null;
    if (m[1]) { const text = stripTags(m[2]); if (text) { b = { kind: 'heading', level: +m[1][1], text }; if (m[1] === 'h1' && !h1) h1 = text; } }
    else if (m[3] !== undefined) { const text = keepLinks(m[3]); if (text) b = { kind: 'text', text }; }
    else if (m[4]) { const items = [...m[5].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((x) => keepLinks(x[1])).filter(Boolean); if (items.length) b = { kind: 'list', ordered: m[4].toLowerCase() === 'ol', items }; }
    else if (/^<img/i.test(raw)) b = { kind: 'image', src: decode(raw.match(/\bsrc="([^"]*)"/i)?.[1] || ''), alt: decode(raw.match(/\balt="([^"]*)"/i)?.[1] || '') };
    else if (/^<iframe/i.test(raw)) b = { kind: 'embed', src: decode(raw.match(/\bsrc="([^"]*)"/i)?.[1] || '') };
    if (b) { b.locator = `#block-${blocks.length + 1}`; blocks.push(b); }
  }
  return { title, meta: { description }, h1, blocks };
}

const words = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2 && !['the', 'and', 'for', 'with', 'care', 'page', 'legacy', 'services', 'www', 'com', 'org', 'https', 'http'].includes(w)));
export function proposePlacement(page, sitemapEntries, { top = 3 } = {}) {
  const title = words(`${page.title || ''} ${page.h1 || ''}`);
  const urlWords = words((page.url || '').replace(/^https?:\/\/[^/]+/, ''));
  const scored = sitemapEntries.map((e) => {
    const n = words(e.name), u = words(e.url);
    let score = 0; const why = [];
    for (const w of title) { if (n.has(w)) { score += 2; why.push(`title word "${w}" in name`); } if (u.has(w)) { score += 1; why.push(`title word "${w}" in url`); } }
    for (const w of urlWords) if (u.has(w)) { score += 2; why.push(`url segment "${w}" matches`); }
    return { pid: e.pid, name: e.name, url: e.url, score, why: why.slice(0, 4).join('; ') || 'no overlap' };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, top);
}
