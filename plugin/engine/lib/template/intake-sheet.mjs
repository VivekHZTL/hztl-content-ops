// The client intake sheet is generated from the catalog so it is right for every project by construction
// (spec 4.8). Row 1 groups (name once at the first column of each group), row 2 headers, row 3 an example
// row with the field type in brackets and no key, so it is never imported as a record.
export function buildTemplate(catalog, pageTypeKey, { components = null, children = 3 } = {}) {
  const pt = catalog.pageTypes?.[pageTypeKey];
  if (!pt) throw new Error(`No page type "${pageTypeKey}" in the catalog; known: ${Object.keys(catalog.pageTypes || {}).join(', ')}`);
  const layout = components || pt.layout || [];
  for (const k of layout) if (!catalog.components[k]) throw new Error(`"${k}" is not a component in the catalog`);
  if (components) for (const k of components) if (!(pt.layout || []).includes(k)) throw new Error(`"${k}" is not on the ${pt.name} blueprint page; its components are ${(pt.layout || []).join(', ')}`);
  const groups = ['Page']; const headers = ['Slug']; const example = [null]; const skipped = [];
  for (const f of pt.fields || []) { groups.push(null); headers.push(f.name); example.push(`[${f.type || 'text'}]`); }
  for (const key of layout) {
    const c = catalog.components[key];
    const childKeys = (c.children || []).filter((k) => catalog.components[k]?.fields?.length);
    if (!(c.fields || []).length && !childKeys.length) { skipped.push({ key, why: 'no fields; it is placed by the planner without a datasource' }); continue; }
    let first = true;
    const add = (header, type) => { groups.push(first ? c.name : null); headers.push(header); example.push(`[${type}]`); first = false; };
    for (const f of c.fields || []) {
      if (/general link/i.test(f.type || '')) { add(f.name, 'General Link: text'); add(`${f.name} URL`, 'General Link: url'); }
      else add(f.name, f.type || 'text');
    }
    for (const childKey of childKeys) for (let n = 1; n <= children; n++) for (const f of catalog.components[childKey].fields) add(`Item ${n} ${f.name}`, f.type || 'text');
  }
  const readme = [
    ['How to fill this sheet'],
    [`Tab "${pt.name}": one row per page. Column A "Slug" is the page's URL name, lower-case with dashes (north-clinic). It is the key; a row without it is ignored.`],
    ['Row 1 says which part of the page a column belongs to. Row 2 is the field. Row 3 shows the kind of value expected; delete it or leave it, it is never imported.'],
    ['Links take two columns: the words, then the web address in the "… URL" column next to it.'],
    ['"Item 1 …", "Item 2 …" are repeating parts (cards, panels). Leave extra items blank.'],
    ['Leave a cell blank when you do not have the content yet. Never type TBD or lorem; blanks are reported, placeholders are flagged.'],
    ['Do not rename, reorder or delete columns, and do not rename the tab. The sheet maps back without questions only while the headers and tab match this file.'],
  ];
  return { tab: pt.name.slice(0, 31), rows: [groups, headers, example], widths: headers.map((h) => Math.max(16, Math.min(60, h.length + 8))), headers, skipped, readme };
}
