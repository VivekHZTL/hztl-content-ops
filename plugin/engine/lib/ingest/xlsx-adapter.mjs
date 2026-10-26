// Workbook → content JSON through a profile (column → target). proposeProfile guesses the profile from
// the catalog; a human confirms it. Every value carries its sheet locator ('Tab'!C12).
import { sheetRecords, sheetColumns, colToNum } from './xlsx.mjs';
import { componentKey } from '../catalog/schema.mjs';
import { newContent } from '../content/schema.mjs';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => new Set(norm(s).split(' ').filter(Boolean));
const similarity = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let hit = 0; for (const w of A) if (B.has(w) || [...B].some((x) => x.startsWith(w) || w.startsWith(x))) hit++; return hit / Math.max(A.size, B.size); };
const DO_NOT = /do\s*not\s*author/i;
const URLISH = /^(https?:\/\/|\/|tel:|mailto:|#)/i;

function matchComponent(groupText, catalog) {
  const g = groupText.replace(/^component\s*:\s*/i, '').replace(/\?$/, '').trim();
  if (!g) return null;
  const exact = Object.entries(catalog.components).find(([k, c]) => k === componentKey(g) || norm(c.name) === norm(g));
  if (exact) return { key: exact[0], confidence: 'exact', why: `group "${g}" = component ${exact[1].name}` };
  let best = null;
  for (const [k, c] of Object.entries(catalog.components)) { const s = similarity(g, c.name); if (s > (best?.s || 0.49)) best = { k, s }; }
  return best ? { key: best.k, confidence: 'fuzzy', why: `group "${g}" ~ component ${catalog.components[best.k].name}` } : null;
}
function matchField(header, def) {
  const h = norm(header);
  const exact = def.fields.find((f) => norm(f.name) === h);
  if (exact) return { field: exact.name, confidence: 'exact' };
  let best = null;
  for (const f of def.fields) { const s = Math.max(similarity(header, f.name), h.includes(norm(f.name)) ? 0.6 : 0); if (s > (best?.s || 0.49)) best = { f: f.name, s }; }
  // common synonyms
  const syn = { copy: 'content', body: 'content', text: 'content', description: 'content', headline: 'heading', header: 'heading', name: 'title', label: 'text', link: 'cta', button: 'cta' };
  if (!best) for (const [a, b] of Object.entries(syn)) { const hit = def.fields.find((f) => norm(f.name) === b); if (h.includes(a) && hit) { best = { f: hit.name, s: 0.5 }; break; } }
  return best ? { field: best.f, confidence: 'fuzzy' } : null;
}

export function proposeProfile(columns, catalog, { tab, layout, parentPath, matchBy = 'slug', pageType = null }) {
  const profile = { sheet: { tab, ...layout }, match: { by: matchBy, parentPath }, columns: {} };
  const cols = Object.keys(columns).sort((a, b) => colToNum(a) - colToNum(b));
  let current = null; let lastGroup = null;
  for (const col of cols) {
    const { group, header } = columns[col];
    if (group !== lastGroup) { current = matchComponent(group, catalog); lastGroup = group; }
    const h = header || '';
    const entry = { target: 'ignore', confidence: 'none', why: '' };
    if (col === layout.keyColumn) Object.assign(entry, { target: 'key', confidence: 'exact', why: 'key column' });
    else if (/note|comment|remark|status/i.test(h)) Object.assign(entry, { target: 'note', confidence: 'exact', why: 'notes column' });
    else if (/^page$/i.test(group || '') && pageType) {
      const pf = (pageType.fields || []).find((f) => norm(f.name) === norm(h));
      if (pf) Object.assign(entry, { target: `page.${pf.name}`, confidence: 'exact', why: `Page group; header "${h}" → page field ${pf.name}` });
      else Object.assign(entry, { why: `Page group; header "${h}" matches no page field` });
    }
    else if (!h) Object.assign(entry, { why: 'no header' });
    else if (current) {
      const def = catalog.components[current.key];
      const prevCol = cols[cols.indexOf(col) - 1];
      const prevTarget = prevCol ? profile.columns[prevCol]?.target || '' : '';
      const prevIsLink = (() => { const m = prevTarget.match(/^component\.([^.]+)\.(.+)$/); return !!(m && /general link/i.test(catalog.components[m[1]]?.fields.find((f) => f.name === m[2])?.type || '')); })();
      const child = h.match(/^(panel|item|card|tab|link|slide)\s*(\d*)\s*(.+)$/i);
      if (prevIsLink && /\b(url|link|href)\b/i.test(h)) Object.assign(entry, { target: 'pair', confidence: 'exact', why: `URL column for the link in ${prevCol}` });
      else if (child && def.children?.length && child[3].trim()) {
        const childKey = def.children[0]; const cf = matchField(child[3], catalog.components[childKey]);
        if (cf) Object.assign(entry, { target: `child.${childKey}.${child[2] || 'row'}.${cf.field}`, confidence: cf.confidence, why: `${current.why}; "${h}" → child ${childKey} ${child[2] ? '#' + child[2] : 'per row'} ${cf.field}` });
        else Object.assign(entry, { why: `${current.why}; child label "${child[3]}" matches no field of ${childKey}` });
      } else {
        const f = matchField(h, def);
        if (f) Object.assign(entry, { target: `component.${current.key}.${f.field}`, confidence: f.confidence, why: `${current.why}; header "${h}" → ${f.field}` });
        else if (/url|link/i.test(h)) Object.assign(entry, { target: 'pair', confidence: 'fuzzy', why: `${current.why}; URL column for the previous link` });
        else Object.assign(entry, { why: `${current.why}; header "${h}" matches no field` });
      }
    } else Object.assign(entry, { why: group ? `group "${group}" matches no component` : 'no component group' });
    profile.columns[col] = entry;
  }
  // link + pair: a 'pair' column fills the url of the nearest preceding General Link column
  let lastLink = null;
  for (const col of cols) { const t = profile.columns[col].target; const m = t.match(/^component\.([^.]+)\.(.+)$/); if (m && /general link/i.test(catalog.components[m[1]].fields.find((f) => f.name === m[2])?.type || '')) lastLink = col; if (t === 'pair' && lastLink) { profile.columns[lastLink].pair = col; lastLink = null; } }
  return profile;
}

const slugOf = (key) => String(key).trim().replace(/^.*\//, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function workbookToContent(workbook, profile, { catalog, sourceFile, sha256 = null, pageType = null }) {
  const sheet = workbook.sheets.find((s) => s.name === profile.sheet.tab);
  if (!sheet) throw new Error(`Tab "${profile.sheet.tab}" not found; tabs: ${workbook.sheets.map((s) => s.name).join(', ')}`);
  const columns = sheetColumns(sheet, { headerRow: profile.sheet.headerRow, groupRows: profile.sheet.groupRows || [] });
  const records = sheetRecords(sheet, { keyColumn: profile.sheet.keyColumn, firstDataRow: profile.sheet.firstDataRow });
  const contents = [];
  const inventory = { records: records.length, byComponent: {}, flags: {}, unmappedColumns: Object.entries(profile.columns).filter(([c, e]) => e.target === 'ignore' && columns[c]?.header).map(([c]) => `${c}: ${columns[c]?.header}`) };
  const flag = (content, kind, where, text) => { content.flags.push({ kind, where, text }); inventory.flags[kind] = (inventory.flags[kind] || 0) + 1; };
  for (const rec of records) {
    const rowOf = (col, i) => { const first = +rec.rows.split('-')[0]; let n = -1; for (let r = first; r <= +rec.rows.split('-')[1]; r++) if (sheet.rows[r]?.[col] != null) { n++; if (n === i) return r; } return first; };
    const loc = (col, i = 0) => `'${profile.sheet.tab}'!${col}${rowOf(col, i)}`;
    const slug = profile.match.by === 'path' ? rec.key.replace(/^\/+|\/+$/g, '') : slugOf(rec.key);
    const content = newContent({ pageId: slug, pageType, targetPath: `${profile.match.parentPath.replace(/\/$/, '')}/${slug}` });
    content.sources = [{ file: sourceFile, sha256 }];
    content.key = rec.key;
    const comps = new Map(); // key → component object (first instance); children by number
    const getComp = (key) => { if (!comps.has(key)) { const c = { type: key, fields: {}, children: [], locator: loc(profile.sheet.keyColumn) }; comps.set(key, c); content.components.push(c); inventory.byComponent[key] = (inventory.byComponent[key] || 0) + 1; } return comps.get(key); };
    for (const [col, vals] of Object.entries(rec.cols)) {
      const e = profile.columns[col]; if (!e) continue;
      for (const [i, raw] of vals.entries()) if (DO_NOT.test(raw)) flag(content, 'do-not-author', loc(col, i), raw.trim());
      if (e.target === 'note') { vals.forEach((v, i) => { if (!DO_NOT.test(v)) flag(content, 'dev-note', loc(col, i), v.trim()); }); continue; }
      if (e.target === 'key' || e.target === 'ignore' || e.target === 'pair') continue;
      let m;
      if ((m = e.target.match(/^page\.(.+)$/))) { content.pageFields[m[1]] = vals.join('\n'); content.locators[`pageFields.${m[1]}`] = loc(col); continue; }
      if ((m = e.target.match(/^component\.([^.]+)\.(.+)$/))) {
        const comp = getComp(m[1]); const idx = content.components.indexOf(comp);
        const fdef = catalog.components[m[1]]?.fields.find((f) => f.name === m[2]);
        if (/general link/i.test(fdef?.type || '')) {
          const urlCol = e.pair; const url = urlCol ? (rec.cols[urlCol] || [])[0] || '' : '';
          const text = vals[0].trim();
          const okUrl = URLISH.test(url.trim());
          comp.fields[m[2]] = { text, url: okUrl ? url.trim() : '' };
          if (urlCol) content.locators[`components.${idx}.fields.${m[2]}.url`] = loc(urlCol);
          if (!okUrl) flag(content, 'missing-url', loc(urlCol || col), url ? `Link cell holds words, not a URL: "${url.trim()}"` : `Link "${text}" has no URL${urlCol ? '' : ' column'}`);
        } else comp.fields[m[2]] = vals.length > 1 ? vals.join('\n') : vals[0];
        content.locators[`components.${idx}.fields.${m[2]}`] = loc(col);
        continue;
      }
      if ((m = e.target.match(/^child\.([^.]+)\.(\d+|row)\.(.+)$/))) {
        const childKey = m[1]; const parentKey = Object.entries(catalog.components).find(([, c]) => (c.children || []).includes(childKey))?.[0];
        if (!parentKey) continue;
        const parent = getComp(parentKey); const pidx = content.components.indexOf(parent);
        // A numbered header ("Panel 2 heading") is child #2; several rows under it are one value joined and flagged.
        // An unnumbered header ("Panel heading") gives one child per value row.
        if (m[2] === 'row') {
          vals.forEach((v, i) => { parent.children[i] ||= { type: childKey, fields: {}, children: [] }; parent.children[i].fields[m[3]] = v; content.locators[`components.${pidx}.children.${i}.fields.${m[3]}`] = loc(col, i); });
        } else {
          const n = +m[2] - 1;
          parent.children[n] ||= { type: childKey, fields: {}, children: [] };
          parent.children[n].fields[m[3]] = vals.join('\n');
          content.locators[`components.${pidx}.children.${n}.fields.${m[3]}`] = loc(col);
          if (vals.length > 1) flag(content, 'confirm', loc(col), `${vals.length} rows under "${columns[col]?.header || col}" joined into one value; confirm`);
        }
        continue;
      }
    }
    // compact sparse children and remap their locators
    content.components.forEach((c, ci) => {
      const kept = []; const remap = new Map();
      c.children.forEach((ch, i) => { if (ch) { remap.set(i, kept.length); kept.push(ch); } });
      c.children = kept;
      for (const [p, l] of Object.entries(content.locators)) { const mm = p.match(new RegExp('^components\\.' + ci + '\\.children\\.(\\d+)\\.(.+)$')); if (mm && remap.has(+mm[1]) && remap.get(+mm[1]) !== +mm[1]) { delete content.locators[p]; content.locators['components.' + ci + '.children.' + remap.get(+mm[1]) + '.' + mm[2]] = l; } }
    });
    contents.push(content);
  }
  return { contents, inventory };
}
