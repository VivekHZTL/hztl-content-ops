// Blueprints are optional. Given a tenant scan (tree + fields), pick one representative page per page
// template: the page whose Final Renderings uses the most distinct renderings. The catalog built from
// these may miss components no page uses yet; `catalog refresh` picks them up as pages grow.
const RID = /\ss:id="([^"]+)"/g;

export function pickRepresentativePages({ tree, fields }) {
  const byTemplate = new Map();
  for (const it of tree) {
    const xml = fields[it.id]?.f?.['__Final Renderings'];
    if (!xml) continue; // not a page with its own layout
    const ids = new Set([...xml.matchAll(RID)].map((m) => m[1].toLowerCase()));
    const cur = byTemplate.get(it.templateName) || { templateName: it.templateName, templateId: it.templateId, pageId: it.id, path: it.path, components: -1, pages: 0 };
    cur.pages += 1;
    if (ids.size > cur.components) { cur.components = ids.size; cur.pageId = it.id; cur.path = it.path; cur.templateId = it.templateId; }
    byTemplate.set(it.templateName, cur);
  }
  return [...byTemplate.values()].sort((a, b) => a.templateName.localeCompare(b.templateName));
}
