// attach-shared: one shared datasource, many pages. First run creates the shared item when it is missing;
// the next run attaches it (change sets cannot point at an item another set creates).
export default async function build({ cm, args, site, helpers, log }) {
  const { pages, root, template, component, shared, after, replaceLocal = true, limit = 5000 } = args;
  if (!site) throw new Error('attach-shared needs a catalog (content-ops catalog build)');
  if (!component || !site.components[component]) throw new Error(`Unknown component "${component}"; see content-ops catalog show`);
  if (!['hero', 'main'].includes(site.components[component].ph)) throw new Error(`${component} is a child component; attach-shared handles top-level components only`);
  if (!shared?.path && !(shared?.parent && shared?.name && shared?.templateId)) throw new Error('args.shared needs { path } or { parent, name, templateId }');
  const { parseLayout, buildLayout, newEntry, placeholderFor, layoutGuards } = helpers.layout;
  const sharedPath = shared.path || `${shared.parent.replace(/\/$/, '')}/${shared.name}`;
  const item = await cm.getItem({ path: sharedPath });
  if (!item) {
    if (!shared.parent) throw new Error(`Shared item not found: ${sharedPath}`);
    const parent = await cm.getItem({ path: shared.parent });
    if (!parent) throw new Error(`Parent for the shared item not found: ${shared.parent}`);
    log(`Shared item ${sharedPath} does not exist yet: this run only creates it. Apply, then plan again to attach it to the pages.`);
    return { changeSets: [{ key: `shared:${shared.name}`, title: `Create shared ${shared.name}`, path: sharedPath, ops: [{ op: 'create', ref: 'new:shared', parent: parent.id, name: shared.name, templateId: shared.templateId, fields: Object.entries(shared.fields || {}).map(([name, to]) => ({ name, to })) }] }] };
  }
  const ds = helpers.ids.braced(item.id);
  const isTemplate = (it) => !template || it.templateName === template || helpers.ids.sameId(it.templateId, template);
  const list = [];
  if (pages) for (const p of pages) { const it = await cm.getItem({ path: p }); if (it) list.push(it); else log(`Not found: ${p}`); }
  if (root) {
    const start = await cm.getItem({ path: root });
    if (!start) throw new Error(`Root not found: ${root}`);
    const queue = [start.id]; let seen = 0;
    while (queue.length) {
      if (++seen > limit) { log(`Stopped after ${limit} items under ${root}; raise args.limit to go further`); break; }
      const id = queue.shift(); const it = id === start.id ? start : await cm.getItem({ id });
      if (!it) continue;
      if (isTemplate(it) && it.fields['__Final Renderings']) list.push(it);
      queue.push(...it.children.map((c) => c.id));
    }
  }
  const changeSets = []; let alreadyRight = 0;
  for (const page of list) {
    const xml = page.fields['__Final Renderings']?.value || '';
    const reasons = layoutGuards(xml, page.fields['__Renderings']?.value, site);
    const { entries } = parseLayout(xml, site);
    const before = helpers.layout.describe(entries, site);
    const mine = entries.filter((e) => e.key === component);
    if (mine.length) {
      const needs = mine.filter((e) => (replaceLocal || !e.ds) && e.ds.toUpperCase() !== ds.toUpperCase());
      if (!needs.length) { alreadyRight++; continue; }
      for (const e of needs) e.wantDs = ds;
      if (mine.some((e) => e.ds && /^local:/i.test(e.ds))) log(`${page.path}: the local ${component} datasource is left in place; remove it with the cleanup skill once verified`);
    } else {
      const at = after ? entries.findIndex((e) => e.key === after) : entries.length - 1;
      if (after && at < 0) reasons.push(`No ${after} on this page to insert ${component} after`);
      const dynId = Math.max(0, ...entries.map((e) => (Number.isFinite(e.dynId) ? e.dynId : 0))) + 1;
      entries.splice(at + 1, 0, newEntry({ key: component, ds, ph: placeholderFor(component, null, site), dynId }, site));
    }
    const to = buildLayout(entries, site);
    changeSets.push({ key: page.path, title: page.name, itemId: page.id, path: page.path, reasons, layout: { before, after: helpers.layout.describe(entries, site) }, ops: [{ op: 'update', id: page.id, fields: [{ name: '__Final Renderings', to }] }] });
  }
  return { changeSets, notes: [`${list.length} page(s) found; ${changeSets.length} to change; ${alreadyRight} already use the shared item`] };
}
