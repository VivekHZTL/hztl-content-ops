// Copy deck (annotated text from docxToText) → content JSON through a section map. Deterministic: headings
// are aliased to catalog components, labels to fields; anything unmatched becomes an `other` component with
// its raw text and an `unmapped` flag, so nothing is dropped and nothing is invented.
import { newContent } from '../content/schema.mjs';
import { componentKey } from '../catalog/schema.mjs';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const lev = (a, b) => { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; };
const close = (a, b) => { a = norm(a); b = norm(b); return a === b || lev(a, b) <= 2 || (a.length > 3 && (a.includes(b) || b.includes(a))); };
const SYN = { copy: 'content', body: 'content', text: 'content', description: 'content', headline: 'heading', header: 'heading', name: 'title', label: 'text', link: 'cta', button: 'cta' };
const CHILD = /^(panel|item|card|tab|link|slide|quote|stat)\s*(\d+)\s+(.+)$/i;
const HEADING = /^(?:component\s*:\s*)(.+)$/i;
const ROW = /^([^|:]{1,60}?)\s*(?:\|\s*|:\s+)(.+)$/;
// ⟦ marks the anchor start (docxToText); without it, fall back to the words before ⟨ on the same line.
const LINK = /(?:⟦([^⟦⟨\n]*)|([^⟨⟦\n|]*?))⟨([^⟩]+)⟩(?:\s*\(Page ID:?\s*([\d.]+)\))?/g;

function matchField(label, def) {
  const l = norm(label);
  const exact = def.fields.find((f) => norm(f.name) === l); if (exact) return exact.name;
  const near = def.fields.find((f) => close(f.name, l)); if (near) return near.name;
  for (const [a, b] of Object.entries(SYN)) if (l.includes(a) && def.fields.some((f) => norm(f.name) === b)) return b;
  return null;
}

/** Guess the section map from the deck text and the catalog. Headings = "Component: X" lines or a "Component | X" table row. */
/** The deck's shape: its component headings in order (what a section map keys on). */
export function deckHeadings(text) {
  const out = [];
  for (const line of text.split('\n')) { const hm = line.match(HEADING) || line.match(/^component\s*\|\s*(.+)$/i); if (hm) out.push(line.trim()); }
  return out;
}

export function proposeSectionMap(text, catalog) {
  const map = { aliases: {}, fields: {}, childFields: {}, unmatched: [] };
  const lines = text.split('\n');
  let current = null;
  for (const line of lines) {
    const hm = line.match(HEADING) || line.match(/^component\s*\|\s*(.+)$/i);
    if (hm) {
      const name = hm[1].trim(); const key = norm(name);
      const hit = Object.entries(catalog.components).find(([k, c]) => k === componentKey(name) || close(c.name, name));
      if (hit) { map.aliases[key] = hit[0]; current = hit[0]; map.fields[current] ||= {}; if (catalog.components[current].children?.length) map.childFields[current] ||= {}; }
      else { if (!map.unmatched.includes(key)) map.unmatched.push(key); current = null; }
      continue;
    }
    if (!current) continue;
    const rm = line.match(ROW); if (!rm) continue;
    const label = rm[1].trim(); const cm = label.match(CHILD);
    if (cm && catalog.components[current].children?.length) { const child = catalog.components[catalog.components[current].children[0]]; const f = matchField(cm[3], child); if (f) map.childFields[current][norm(cm[3])] = f; }
    else { const f = matchField(label, catalog.components[current]); if (f) map.fields[current][norm(label)] = f; }
  }
  return map;
}

const parseLinks = (s) => { const links = []; const clean = s.replace(LINK, (m, marked, loose, url, pid) => { const t = (marked ?? loose ?? '').trim(); links.push({ text: t, url: url.trim(), ...(pid ? { pid } : {}) }); return t; }).replace(/\s*\(Page ID:?\s*[\d.]+\)/g, '').replace(/⟦/g, '').trim(); return { clean, links }; };

export function deckToContent(text, sectionMap, { catalog, pageType = null, targetPath, sourceFile, sha256 = null, pageId = null }) {
  const lines = text.split('\n');
  const pid = pageId || lines.map((l) => l.match(/^page id\s*(?::|\|)?\s*([\d.]+)/i)?.[1]).find(Boolean) || 'unknown';
  const content = newContent({ pageId: pid, pageType, targetPath, mode: 'update' });
  content.sources = [{ file: sourceFile, sha256 }];
  const flag = (kind, where, t) => content.flags.push({ kind, where, text: t });
  let section = null; // { comp, key, def, idx, childByNum, last: { obj, field } }
  const open = (name, lineNo) => {
    const key = sectionMap.aliases[norm(name)];
    if (key) { const comp = { type: key, fields: {}, children: [], locator: `deck line ${lineNo}` }; content.components.push(comp); section = { comp, key, def: catalog.components[key], idx: content.components.length - 1, childByNum: new Map() }; }
    else { const comp = { type: 'other', deckName: name, raw: '', links: [], fields: {}, children: [], locator: `deck line ${lineNo}` }; content.components.push(comp); flag('unmapped', `deck line ${lineNo}`, `Section "${name}" matches no catalog component; kept as raw text`); section = { comp, key: 'other', def: null, idx: content.components.length - 1, childByNum: new Map() }; }
  };
  lines.forEach((line, i) => {
    const n = i + 1;
    const hm = line.match(HEADING) || line.match(/^component\s*\|\s*(.+)$/i);
    if (hm) { open(hm[1].trim(), n); return; }
    if (!section || !line.trim()) return;
    if (section.key === 'other') { const { clean, links } = parseLinks(line); section.comp.raw += (section.comp.raw ? '\n' : '') + clean; section.comp.links.push(...links); return; }
    const rm = line.match(ROW);
    if (!rm) {
      // a continuation of the previous field (multi-paragraph or bulleted cell)
      if (section.last && typeof section.last.obj[section.last.field] === 'string') { section.last.obj[section.last.field] += '\n' + line.trim(); return; }
      flag('unmapped', `deck line ${n}`, `Line inside ${section.def.name} is not a "Label | value" row: "${line.slice(0, 80)}"`); return;
    }
    const label = rm[1].trim(); const { clean, links } = parseLinks(rm[2].trim());
    const cm = label.match(CHILD);
    if (cm && section.def.children?.length) {
      const f = sectionMap.childFields?.[section.key]?.[norm(cm[3])];
      if (!f) { flag('unmapped', `deck line ${n}`, `Child label "${label}" in ${section.def.name} matches no field`); return; }
      const num = +cm[2]; if (!section.childByNum.has(num)) { section.childByNum.set(num, { type: section.def.children[0], fields: {}, children: [] }); section.comp.children.push(section.childByNum.get(num)); }
      const child = section.childByNum.get(num); const cidx = section.comp.children.indexOf(child);
      const cv = valueFor(section.def, catalog.components[section.def.children[0]], f, clean, links);
      if (f in child.fields) { flag('confirm', `deck line ${n}`, `Repeated label "${label}" in ${section.def.name}; values joined, confirm`); child.fields[f] = typeof child.fields[f] === 'string' && typeof cv === 'string' ? child.fields[f] + '\n' + cv : cv; } else child.fields[f] = cv;
      section.last = { obj: child.fields, field: f };
      for (const l of links) if (!l.url || l.url === '?') flag('missing-url', `deck line ${n}`, `Link "${l.text}" has no usable URL`);
      content.locators[`components.${section.idx}.children.${cidx}.fields.${f}`] = `deck line ${n}`;
      return;
    }
    const f = sectionMap.fields?.[section.key]?.[norm(label)];
    if (!f) { flag('unmapped', `deck line ${n}`, `Label "${label}" in ${section.def.name} matches no field`); return; }
    const fv = valueFor(section.def, section.def, f, clean, links);
    if (f in section.comp.fields) { flag('confirm', `deck line ${n}`, `Repeated label "${label}" in ${section.def.name}; values joined, confirm`); section.comp.fields[f] = typeof section.comp.fields[f] === 'string' && typeof fv === 'string' ? section.comp.fields[f] + '\n' + fv : fv; } else section.comp.fields[f] = fv;
    section.last = { obj: section.comp.fields, field: f };
    for (const l of links) if (!l.url || l.url === '?') flag('missing-url', `deck line ${n}`, `Link "${l.text}" has no usable URL`);
    content.locators[`components.${section.idx}.fields.${f}`] = `deck line ${n}`;
  });
  return content;
}

function valueFor(parentDef, def, field, clean, links) {
  const type = def.fields.find((x) => x.name === field)?.type || '';
  if (/general link/i.test(type)) return links[0] ? { text: links[0].text || clean, url: links[0].url === '?' ? '' : links[0].url, ...(links[0].pid ? { pid: links[0].pid } : {}) } : { text: clean, url: '' };
  if (/rich text/i.test(type) && links.length) { let html = clean; for (const l of links) html = html.replace(l.text, `<a href="${l.url}"${l.pid ? ` data-pid="${l.pid}"` : ''}>${l.text}</a>`); return html.startsWith('<') ? html : `<p>${html}</p>`; }
  return clean;
}
