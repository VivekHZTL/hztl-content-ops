// Type-aware equality for Sitecore field values, used by read-back verification and strict undo.
// General links compare by text, url-or-id, target and querystring; rich text by its visible text
// plus its hrefs (GUID case folded); GUID lists case-insensitively; everything else trimmed.
export const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export const linkParts = (v) => `${v?.match(/text="([^"]*)"/)?.[1] ?? ''}|${v?.match(/url="([^"]*)"/)?.[1] ?? v?.match(/\sid="([^"]*)"/)?.[1] ?? ''}|${v?.match(/target="([^"]*)"/)?.[1] ?? ''}|${(v?.match(/\squerystring="([^"]*)"/)?.[1] ?? '').replace(/&amp;/g, '&')}`;
const hrefs = (h) => [...String(h || '').matchAll(/\shref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&').trim().replace(/_id=([0-9a-f]+)/i, (x, id) => `_id=${id.toUpperCase()}`)).join(' ');

/** Exact equality after whitespace collapse and GUID case folding: for strict undo, where a formatting-only edit must count as a change. */
export const exactValue = (a, b) => {
  const n = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/\{[0-9a-f-]+\}/gi, (g) => g.toUpperCase());
  return n(a) === n(b);
};

export const sameValue = (a, b) => {
  a = a ?? ''; b = b ?? '';
  if (a === b) return true;
  if (/^<link\s/.test(a) || /^<link\s/.test(b)) return linkParts(a) === linkParts(b);
  if (/<p>/.test(a) || /<p>/.test(b)) return strip(a) === strip(b) && hrefs(a) === hrefs(b);
  if (/^\{[0-9A-F-]+\}(\|\{[0-9A-F-]+\})*$/i.test(a)) return a.toUpperCase() === b.toUpperCase();
  return a.trim() === b.trim();
};
