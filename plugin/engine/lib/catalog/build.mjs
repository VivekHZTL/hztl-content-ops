// Generate the catalog from blueprint pages on the CM.
// Convention: under `blueprintRoot` the tech team keeps one page per page template, with every allowed
// component placed once. Each page's Final Renderings tells us the renderings, their placeholders, their
// nesting and their parameters; each rendering item tells us its datasource template; each template
// tells us its fields (sections plus base templates). Read-only.
import { normId } from '../cm/ids.mjs';
import { componentKey } from './schema.mjs';

const STD_SECTIONS = /^(Standard template|Advanced|Appearance|Help|Layout|Lifetime|Insert Options|Publishing|Security|Statistics|Tasks|Validators|Workflow|Indexing|Item Buckets)$/;

export async function templateFields(cm, templateId, seen = new Set()) {
  const id = normId(templateId);
  if (!id || seen.has(id)) return [];
  seen.add(id);
  const t = await cm.getItem({ id });
  if (!t || t.name === 'Standard template' || /\/System\//.test(t.path)) return [];
  const out = [];
  for (const s of t.children.filter((c) => c.templateName === 'Template section' && !STD_SECTIONS.test(c.name))) {
    const sec = await cm.getItem({ id: s.id });
    for (const f of sec.children) { const fi = await cm.getItem({ id: f.id }); out.push({ name: fi.name, type: fi.fields.Type?.value || '', source: (fi.fields.Source?.value || '').slice(0, 200) }); }
  }
  for (const b of (t.fields['__Base template']?.value || '').split('|').filter(Boolean)) out.push(...(await templateFields(cm, b, seen)));
  return out;
}

const attr = (raw, name) => raw.match(new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`))?.[1];
const dec = (s) => (s || '').replace(/&amp;/g, '&');

async function resolveTemplate(cm, ref) {
  if (!ref) return null;
  return /^\{?[0-9a-f-]{32,}\}?$/i.test(ref.trim()) ? cm.getItem({ id: ref }) : cm.getItem({ path: ref.trim() });
}

export async function buildCatalog({ cm, blueprintRoot = null, pageIds = null, language = 'en', placeholderHints = { hero: /hero/i } }) {
  let children;
  if (pageIds) children = pageIds.map((id) => ({ id }));
  else {
    const root = await cm.getItem({ path: blueprintRoot });
    if (!root) throw new Error(`Blueprint root not found: ${blueprintRoot}`);
    children = root.children;
  }
  const catalog = { v: 1, generatedAt: new Date().toISOString(), env: cm.env, language, device: null, placeholders: { hero: null, main: null }, pageTypes: {}, components: {}, warnings: [] };
  const renderingCache = new Map();
  const tplCache = new Map();
  const fieldsFor = async (tid) => { const k = normId(tid); if (!tplCache.has(k)) tplCache.set(k, await templateFields(cm, k)); return tplCache.get(k); };

  for (const child of children) {
    const page = await cm.getItem({ id: child.id });
    const xml = page.fields['__Final Renderings']?.value || '';
    if (!xml) continue;
    const typeKey = componentKey(page.templateName);
    catalog.device ||= xml.match(/<d\s[^>]*id="([^"]+)"/)?.[1] || null;
    const entries = [];
    for (const m of xml.matchAll(/<r\s(?![^>]*xmlns:p=)[^>]*?\/>/g)) {
      const raw = m[0];
      const rid = normId(attr(raw, 's:id') || attr(raw, 'id'));
      if (!rid) continue;
      const par = dec(attr(raw, 's:par'));
      entries.push({ rid, par, ph: dec(attr(raw, 's:ph')), dynId: +(par.match(/(?:^|&)DynamicPlaceholderId=(\d+)/)?.[1] ?? NaN) });
    }
    for (const e of entries) if (!renderingCache.has(e.rid)) renderingCache.set(e.rid, await cm.getItem({ id: e.rid })); // load all first: a parent may come after its child in the XML
    const keys = [];
    const links = [];
    for (const e of entries) {
      const r = renderingCache.get(e.rid);
      if (!r) continue;
      const key = componentKey(r.name);
      keys.push(key);
      const nested = e.ph.match(/\/([^/]+)-(\d+)$/);
      const topLevel = !nested || !entries.some((p) => p.dynId === +nested[2]);
      let ph, parent = null;
      if (topLevel) {
        ph = placeholderHints.hero.test(e.ph) ? 'hero' : 'main';
        catalog.placeholders[ph] ||= e.ph;
      } else {
        ph = nested[1];
        const parentEntry = entries.find((p) => p.dynId === +nested[2]);
        parent = componentKey(renderingCache.get(parentEntry.rid)?.name || '');
      }
      const placement = topLevel ? 'top' : 'child';
      if (catalog.components[key] && !catalog.components[key].placements.includes(placement)) { catalog.components[key].placements.push(placement); catalog.warnings.push(`${key} (${r.name}) is placed both at the top level and inside ${parent || catalog.components[key].parent}; the catalog keeps its first placement (${catalog.components[key].placements[0]})`); }
      if (!catalog.components[key]) {
        const tpl = await resolveTemplate(cm, r.fields['Datasource Template']?.value);
        catalog.components[key] = {
          name: r.name, renderingId: e.rid, ph, parent, placements: [placement], childPh: null, children: [],
          themed: /(^|&)selectTheme(=|&|$)/.test(e.par),
          params: e.par.split('&').filter((p) => p && !/^DynamicPlaceholderId=/.test(p)).join('&'),
          dsTemplateId: tpl ? tpl.id : null, dsTemplateName: tpl ? tpl.name : null,
          fields: tpl ? await fieldsFor(tpl.id) : [], codePath: null,
        };
      }
      if (parent && catalog.components[key].placements[0] === 'child') links.push({ key, parent, ph });
    }
    for (const l of links) { // second pass: a parent may have been registered after its child
      const p = catalog.components[l.parent]; if (!p) continue;
      p.childPh ||= l.ph;
      if (!p.children.includes(l.key)) p.children.push(l.key);
      catalog.components[l.key].parent ||= l.parent;
    }
    catalog.pageTypes[typeKey] = { name: page.templateName, templateId: page.templateId, blueprintId: page.id, blueprintPath: page.path, layout: keys, fields: await fieldsFor(page.templateId) };
  }
  if (!catalog.placeholders.main) catalog.placeholders.main = catalog.placeholders.hero;
  if (!catalog.placeholders.hero) catalog.placeholders.hero = catalog.placeholders.main;
  return catalog;
}
