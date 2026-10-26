// Sitecore as source: the planner's inverse. A page snapshot plus the catalog becomes content JSON that
// plans as up-to-date, so a Sitecore-to-Sitecore job is "export, edit the content, plan, apply".
import { parseLayout } from '../layout/layout.mjs';
import { catalogToSite } from '../catalog/schema.mjs';
import { fingerprint } from '../snapshot/page.mjs';
import { newContent } from '../content/schema.mjs';

const findByPath = (node, p) => { if (!node) return null; if (node.path.toLowerCase() === p.toLowerCase()) return node; for (const c of node.children || []) { const h = findByPath(c, p); if (h) return h; } return null; };
// Every non-empty value the page shows, standard values included: writing an equal value back plans as no change.
const own = (item, defFields) => Object.fromEntries(defFields.filter((f) => item.fields[f.name] && item.fields[f.name].value !== '').map((f) => [f.name, item.fields[f.name].value]));

export function exportPage({ snap, catalog, rules }) {
  const site = catalogToSite(catalog);
  const page = snap.page;
  const typeKey = Object.entries(catalog.pageTypes || {}).find(([, t]) => t.templateId && page.templateId && t.templateId.toLowerCase() === page.templateId.toLowerCase())?.[0] || null;
  const content = newContent({ pageId: page.name, pageType: typeKey, targetPath: page.path, mode: 'update' });
  content.sources = [{ file: `sitecore:${page.path}`, sha256: fingerprint(snap) }];
  content.notes = [];
  const pageType = typeKey ? catalog.pageTypes[typeKey] : null;
  if (pageType?.fields?.length) { content.pageFields = own(page, pageType.fields); for (const f of Object.keys(content.pageFields)) content.locators[`pageFields.${f}`] = `sitecore:${page.path}#${f}`; }
  const { entries } = parseLayout(page.fields['__Final Renderings']?.value || '', site);
  const localItem = (ds) => (ds && ds.startsWith('local:') ? findByPath(snap.data, `${page.path}${ds.slice('local:'.length)}`) : null);
  const byEntry = new Map();
  for (const e of entries) {
    const def = catalog.components[e.key];
    if (!def) { content.notes.push({ kind: 'unknown', renderingId: e.renderingId, ds: e.ds }); continue; }
    const top = ['hero', 'main'].includes(def.ph);
    if (e.ds && !e.ds.startsWith('local:')) { content.notes.push({ kind: 'shared', component: e.key, ds: e.ds }); continue; }
    const item = localItem(e.ds);
    if (e.ds && !item) { content.notes.push({ kind: 'missing', component: e.key, ds: e.ds }); continue; }
    const comp = { type: e.key, fields: item ? own(item, def.fields) : {}, children: [], locator: `sitecore:${item?.path || page.path}` };
    byEntry.set(e, comp);
    if (top) { content.components.push(comp); continue; }
    const parentEntry = entries.find((p) => p !== e && catalog.components[p.key]?.childPh && e.ph === `${site.placeholders.main}/${catalog.components[p.key].childPh}-${p.dynId}`);
    const parent = parentEntry && byEntry.get(parentEntry);
    if (parent) parent.children.push(comp); else content.notes.push({ kind: 'orphan-child', component: e.key, ds: e.ds });
  }
  content.components.forEach((c, i) => { for (const f of Object.keys(c.fields)) content.locators[`components.${i}.fields.${f}`] = `${c.locator}#${f}`; c.children.forEach((ch, j) => { for (const f of Object.keys(ch.fields)) content.locators[`components.${i}.children.${j}.fields.${f}`] = `${ch.locator}#${f}`; }); });
  return content;
}
