// The planner: content JSON + a read-only page snapshot + the catalog → the plan applyPage consumes.
// Pure: no I/O, no Sitecore calls. Refuses rather than guesses (status needs-review with reasons).
//
// Binding: content components bind, in order, to unbound existing top-level layout entries of the same
// catalog key. An entry whose local datasource item is missing is reused in place and gets a new item
// (wantDs). An entry whose datasource is shared (a GUID) is never edited: the page is needs-review.
// Children bind the same way inside their parent's dynamic placeholder. Existing entries the content does
// not mention are kept (listed as pending 'review') unless rules.removeMissingComponents and they hold no
// own values. Themes: existing clean themes are kept; new or malformed ones are solved by alternation.
import { fingerprint } from '../snapshot/page.mjs';
import { parseLayout, buildLayout, newEntry, placeholderFor, describe, themesOf, layoutGuards } from '../layout/layout.mjs';
import { sameValue, exactValue } from '../verify/values.mjs';
import { catalogToSite } from '../catalog/schema.mjs';
import { buildFieldValue } from './fields.mjs';
import { solveThemes } from './themes.mjs';

const findByPath = (node, p) => { if (!node) return null; if (node.path.toLowerCase() === p.toLowerCase()) return node; for (const c of node.children || []) { const hit = findByPath(c, p); if (hit) return hit; } return null; };
const ownValues = (item) => Object.entries(item?.fields || {}).filter(([k, v]) => !k.startsWith('__') && !v.std && v.value).length;
/** For deciding writes: links by parts (attribute order varies), everything else exact after whitespace and GUID case. */
const planSame = (a, b) => (/^<link\s/.test(a ?? '') || /^<link\s/.test(b ?? '') ? sameValue(a, b) : exactValue(a, b));
const MODES = new Set(['update', 'fill-shell']);

export function planPage({ content, snap, catalog, rules, key }) {
  const site = catalogToSite(catalog);
  const page = snap.page;
  const reasons = [];
  const pending = [];
  const plan = { key: key ?? content.pageId ?? page.name, itemId: page.id, title: page.name, path: page.path, pageId: content.pageId, content, status: 'ready', fingerprint: fingerprint(snap), reasons, pending, sources: content.sources || [], diff: { components: { before: [], after: [] }, fields: [] } };
  const note = (category, text, where, locator) => pending.push({ category, text, where, locator });

  // ---- guards
  for (const f of content.flags || []) if (['do-not-author', 'hold', 'new-adapter'].includes(f.kind)) reasons.push(`Flag ${f.kind}: ${f.text || ''} (${f.where || ''})`);
  const mode = content.target?.mode || 'update';
  if (!MODES.has(mode)) reasons.push(`target.mode "${mode}" is not supported by this planner (update, fill-shell)`);
  const pageType = content.pageType ? catalog.pageTypes?.[content.pageType] : null;
  if (content.pageType && pageType && pageType.templateId && page.templateId && pageType.templateId.toLowerCase() !== page.templateId.toLowerCase()) reasons.push(`Page template is "${page.templateName}" but content says page type "${content.pageType}" (${pageType.name})`);
  const finalXml = page.fields['__Final Renderings']?.value || '';
  reasons.push(...layoutGuards(finalXml, page.fields['__Renderings']?.value || '', site));
  if (!snap.data) reasons.push(`No ${rules.dataFolder} folder under the page`);
  const checkComponent = (c, parentKey) => {
    const def = catalog.components[c.type];
    if (!def) { reasons.push(`Unknown component type "${c.type}"`); return; }
    if (def.status === 'missing') { reasons.push(`"${c.type}" (${def.name}) is missing from the blueprint pages since ${def.missingSince || 'the last refresh'}; a developer runs catalog verify ${c.type} to confirm it is gone or restores the blueprint`); return; }
    if (def.status === 'unverified' || def.status === 'changed') note('unverified-component', `"${c.type}" (${def.name}) is ${def.status} in the catalog since the last refresh; a developer confirms it with catalog verify ${c.type}`, c.type, c.locator || '');
    if (!parentKey && !['hero', 'main'].includes(def.ph)) reasons.push(`"${c.type}" is a child component (placeholder "${def.ph}") and cannot sit at the top level`);
    if (parentKey) {
      const parent = catalog.components[parentKey];
      if (!(parent.children || []).includes(c.type)) reasons.push(`"${c.type}" is not a child of "${parentKey}"`);
      else if (parent.childPh && def.ph !== parent.childPh) reasons.push(`"${c.type}" placeholder "${def.ph}" does not match "${parentKey}" childPh "${parent.childPh}"`);
    }
    for (const f of Object.keys(c.fields || {})) if (!f.startsWith('__') && !def.fields.some((d) => d.name === f)) reasons.push(`Field "${f}" is not on ${def.name}`);
    for (const ch of c.children || []) checkComponent(ch, c.type);
  };
  for (const c of content.components || []) checkComponent(c, null);
  for (const f of Object.keys(content.pageFields || {})) if (pageType && pageType.fields?.length && !pageType.fields.some((d) => d.name === f) && !(f in page.fields)) reasons.push(`Page field "${f}" is not on ${pageType.name}`);
  // shared datasources: a content component of a type whose only available entry is shared → never edited
  const parsed = parseLayout(finalXml, site);
  for (const c of content.components || []) {
    const candidates = parsed.entries.filter((e) => e.key === c.type && ['hero', 'main'].includes(catalog.components[c.type]?.ph));
    if (candidates.length && candidates.every((e) => e.ds && !e.ds.startsWith('local:'))) reasons.push(`${catalog.components[c.type].name} on this page uses a shared datasource (${candidates[0].ds}); shared items are never edited by the tool`);
  }
  if (reasons.length) return { ...plan, status: 'needs-review', ops: null, layout: null };

  // ---- existing layout
  const { entries } = parsed;
  plan.diff.components.before = describe(entries, site);
  const localItem = (ds) => (ds && ds.startsWith('local:') ? findByPath(snap.data, `${page.path}${ds.slice('local:'.length)}`) : null);
  const bound = new Set();
  const creates = [], updates = [];
  const usedNames = new Map();
  const namesUnder = (k, existing) => { if (!usedNames.has(k)) usedNames.set(k, new Set(existing)); return usedNames.get(k); };
  const uniqueName = (base, names) => { let n = base, i = 1; while (names.has(n)) n = `${base} ${++i}`; names.add(n); return n; };
  let nextDyn = Math.max(0, ...entries.map((e) => (Number.isInteger(e.dynId) ? e.dynId : 0))) + 1;
  const after = [...entries];
  const firstMainIndex = () => { const i = after.findIndex((e) => catalog.components[e.key]?.ph === 'main'); return i < 0 ? after.length : i; };
  const insertAfter = (anchor, entry) => { const i = anchor ? after.indexOf(anchor) : -1; if (i < 0) after.splice(firstMainIndex(), 0, entry); else after.splice(i + 1, 0, entry); };

  const planFields = (fields, defFields, item, ref, where, locator) => {
    for (const [field, raw] of Object.entries(fields || {})) {
      const fdef = defFields.find((d) => d.name === field) || { name: field, type: '' };
      if (fdef.changedTo) { note('unverified-component', `${field}: type changed ${fdef.type} → ${fdef.changedTo} on the blueprint; held until catalog verify`, where, locator); continue; }
      if (fdef.status === 'missing') { note('unverified-component', `${field}: field missing from the blueprint since ${fdef.missingSince || 'the last refresh'}; held until catalog verify`, where, locator); continue; }
      const built = buildFieldValue(fdef, raw, { rules });
      if (built.pending) { note(built.pending.category, built.pending.text, where, locator); continue; }
      const cur = item?.fields?.[field];
      if (item && planSame(cur?.value, built.value)) continue;
      updates.push({ ref, field, from: cur?.value ?? '', std: cur ? !!cur.std : true, to: built.value });
      plan.diff.fields.push({ ref, field, from: cur?.value ?? '', to: built.value });
    }
  };

  // page-level fields
  planFields(content.pageFields, pageType?.fields?.length ? pageType.fields : Object.keys(page.fields).map((n) => ({ name: n, type: '' })), page, 'page', 'page', content.locator);
  if (content.seo && Object.keys(content.seo).length) {
    const map = rules.seoFields || null;
    if (map) planFields(Object.fromEntries(Object.entries(content.seo).filter(([k]) => map[k]).map(([k, v]) => [map[k], v])), Object.keys(page.fields).map((n) => ({ name: n, type: '' })), page, 'page', 'seo', content.locator);
    else note('no-field', `seo values present but rules.seoFields has no mapping to page fields; not written`, 'seo', content.locator);
  }

  const bindOrCreate = (c, pool, parentCtx) => {
    const def = catalog.components[c.type];
    const where = `${def.name}${parentCtx ? ` in ${parentCtx.def.name}` : ''}`;
    const entry = pool.find((e) => e.key === c.type && !bound.has(e));
    let item = entry ? localItem(entry.ds) : null;
    if (entry) bound.add(entry);
    if (entry && item) { planFields(c.fields, def.fields, item, item.id, where, c.locator); return { entry, item, ref: item.id, isNew: false }; }
    if (entry && !entry.ds) { // a rendering with no datasource (page-driven component): nothing to write into
      for (const f of Object.keys(c.fields || {})) note('no-field', `${def.name} has no datasource on this page; "${f}" cannot be written`, where, c.locator);
      return { entry, item: null, ref: null, isNew: false };
    }
    // create: either a brand-new entry, or a new item for an entry whose local datasource is missing
    const parentItem = parentCtx ? parentCtx.item : snap.data;
    const parentRef = parentCtx ? parentCtx.ref : snap.data.id;
    const existingNames = parentItem ? parentItem.children.map((x) => x.name) : [];
    const base = parentCtx ? `${def.name} ${(parentItem ? parentItem.children.length : 0) + (parentCtx.created = (parentCtx.created || 0) + 1)}` : def.name;
    const name = uniqueName(base, namesUnder(parentRef, existingNames));
    const ref = `new:${name}`;
    creates.push({ ref, parentRef, name, templateId: def.dsTemplateId });
    const dsPath = parentCtx ? `${parentCtx.dsPath}/${name}` : `local:/${rules.dataFolder}/${name}`;
    let e;
    if (entry) { note('review', `${def.name}: layout points at ${entry.ds} which is missing; a new item ${name} is created and the rendering repointed`, where, c.locator); entry.wantDs = dsPath; e = entry; }
    else {
      e = newEntry({ key: c.type, ds: dsPath, ph: parentCtx ? placeholderFor(c.type, parentCtx.entry.dynId, site) : placeholderFor(c.type, null, site), dynId: nextDyn++ }, site);
      insertAfter(parentCtx ? parentCtx.lastChild || parentCtx.entry : lastTop, e);
      bound.add(e);
    }
    planFields(c.fields, def.fields, null, ref, where, c.locator);
    return { entry: e, item: null, ref, isNew: true };
  };

  let lastTop = null;
  const topPool = entries.filter((e) => ['hero', 'main'].includes(catalog.components[e.key]?.ph));
  for (const c of content.components || []) {
    const r = bindOrCreate(c, topPool, null);
    lastTop = r.entry;
    const def = catalog.components[c.type];
    const childPool = def.childPh ? entries.filter((e) => e.ph === `${site.placeholders.main}/${def.childPh}-${r.entry.dynId}`) : [];
    const ctx = { def, entry: r.entry, item: r.item, ref: r.ref, dsPath: r.entry.wantDs || r.entry.ds, lastChild: null, created: 0 };
    for (const ch of c.children || []) { const cr = bindOrCreate(ch, childPool, ctx); ctx.lastChild = cr.entry; }
  }

  // ---- existing entries the content did not mention
  for (const e of entries) {
    if (bound.has(e) || !['hero', 'main'].includes(catalog.components[e.key]?.ph)) continue;
    const item = localItem(e.ds);
    if (rules.removeMissingComponents && item && !ownValues(item)) { after.splice(after.indexOf(e), 1); plan.diff.components.removed = [...(plan.diff.components.removed || []), catalog.components[e.key].name]; }
    else note('review', `${catalog.components[e.key].name} is on the page but not in the content; kept`, catalog.components[e.key].name);
  }

  // ---- themes
  const mainThemed = after.filter((e) => catalog.components[e.key]?.ph === 'main' && catalog.components[e.key]?.themed);
  const units = mainThemed.map((e) => { const pinned = rules.themes.pinned[e.key]; const clean = e.theme && !e.theme.startsWith('!') ? e.theme : null; return { fixed: pinned ?? (e.isNew ? undefined : clean ?? undefined) }; });
  solveThemes(units, { alternate: rules.themes.alternate }).forEach((t, i) => { const e = mainThemed[i]; if (t && t !== e.theme) e.wantTheme = t; });

  const changed = after.length !== entries.length || after.some((e, i) => e !== entries[i]) || after.some((e) => e.wantTheme || (e.wantDs && e.wantDs !== e.ds));
  const layoutOp = changed ? { to: buildLayout(after, site) } : null;
  plan.diff.components.after = describe(after, site);
  plan.ops = { creates, updates, layout: layoutOp, rename: null };
  plan.layout = { after: describe(after, site), themesAfter: themesOf(after) };
  if (!creates.length && !updates.length && !layoutOp) plan.status = 'up-to-date';
  return plan;
}
