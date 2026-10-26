// Pure rich-text transforms for bulk jobs. Each returns { html, changes }. Comments are left alone.
const COMMENT = /<!--[\s\S]*?-->/g;
// comment placeholders: \u0000\u0002<n>\u0002\u0000, never produced by ordinary text
const protect = (html) => { const parts = []; const out = html.replace(COMMENT, (m) => { parts.push(m); return `\u0000\u0002${parts.length - 1}\u0002\u0000`; }); return { out, restore: (s) => s.replace(/\u0000\u0002(\d+)\u0002\u0000/g, (m, i) => parts[+i]) }; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Remove <img> whose src matches hostPattern; then collapse wrappers that became empty, innermost first. */
export function stripImages(html, { hostPattern = '' } = {}) {
  if (!hostPattern) throw new Error('strip-images needs a non-empty hostPattern (which images to remove)');
  const { out, restore } = protect(String(html || ''));
  const re = new RegExp(`<img\\b[^>]*\\bsrc="[^"]*${esc(hostPattern)}[^"]*"[^>]*>`, 'gi');
  let changes = 0;
  let s = out.replace(re, () => { changes++; return '\u0001'; });
  if (changes) {
    let prev;
    // only wrappers that now hold nothing but our marker (plus whitespace) collapse; pre-existing empties stay
    do { prev = s; s = s.replace(/<(p|div|span|figure|a|li|ul|ol|em|strong|b|i)\b[^>]*>(?:\s|&nbsp;)*\u0001(?:\u0001|\s|&nbsp;)*<\/\1>/gi, '\u0001'); } while (s !== prev);
    s = s.replace(/\u0001/g, '');
  }
  return { html: restore(s), changes };
}

/** Replace <a …>text</a> with text when the text or href matches. */
export function unwrapAnchors(html, { text = null, hrefPattern = null } = {}) {
  const { out, restore } = protect(String(html || ''));
  let changes = 0;
  const s = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (m, attrs, inner) => {
    const href = attrs.match(/\bhref="([^"]*)"/i)?.[1] || '';
    const plain = inner.replace(/<[^>]+>/g, '');
    const hit = (text && plain.trim() === text) || (hrefPattern && new RegExp(hrefPattern, 'i').test(href));
    if (!hit) return m; changes++; return inner;
  });
  return { html: restore(s), changes };
}

export function rewriteHrefs(html, rules = []) {
  const { out, restore } = protect(String(html || ''));
  let changes = 0;
  const s = out.replace(/\bhref="([^"]*)"/gi, (m, href) => { for (const r of rules) { const re = new RegExp(r.match, 'i'); if (re.test(href)) { const next = href.replace(re, r.replace); if (next !== href) { changes++; return `href="${next.replace(/"/g, '&quot;')}"`; } } } return m; });
  return { html: restore(s), changes };
}

/** Replace text outside tags only. */
export function replaceText(html, { find, replace }) {
  const { out, restore } = protect(String(html || ''));
  let changes = 0;
  const s = out.split(/(<[^>]+>|\u0000\u0002\d+\u0002\u0000)/g).map((part) => (part.startsWith('<') || part.startsWith('\u0000') ? part : part.split(find).join((() => { const n = part.split(find).length - 1; changes += n; return replace; })()))).join('');
  return { html: restore(s), changes };
}
