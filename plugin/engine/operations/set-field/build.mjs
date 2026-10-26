// set-field: one field on many items, by paths or by walking a root (optionally one template).
export default async function build({ cm, args, helpers, log }) {
  const { paths, root, template, field, value, replace, onlyEmpty = false, limit = 5000 } = args;
  if (!field) throw new Error('set-field needs args.field');
  if (value === undefined && !replace) throw new Error('set-field needs args.value or args.replace { pattern, with }');
  if (!paths && !root) throw new Error('set-field needs args.paths or args.root');
  const re = replace ? new RegExp(replace.pattern, replace.flags || '') : null;
  const matchesTemplate = (it) => !template || it.templateName === template || helpers.ids.sameId(it.templateId, template);
  const items = [];
  if (paths) for (const p of paths) { const it = await cm.getItem({ path: p }); if (it) items.push(it); else log(`Not found: ${p}`); }
  if (root) {
    const start = await cm.getItem({ path: root });
    if (!start) throw new Error(`Root not found: ${root}`);
    // ids are queued and fetched one at a time, so the limit caps Sitecore reads, not just results
    const queue = [start.id]; let seen = 0;
    while (queue.length) {
      if (++seen > limit) { log(`Stopped after ${limit} items under ${root}; raise args.limit to go further`); break; }
      const id = queue.shift(); const it = id === start.id ? start : await cm.getItem({ id });
      if (!it) continue;
      if (matchesTemplate(it)) items.push(it);
      queue.push(...it.children.map((c) => c.id));
    }
  }
  const changeSets = []; let alreadyRight = 0, skippedFull = 0;
  for (const it of items) {
    if (!matchesTemplate(it)) continue;
    const cur = it.fields[field]?.value ?? '';
    if (onlyEmpty && String(cur).trim()) { skippedFull++; continue; }
    const next = re ? String(cur).replace(re, replace.with ?? '') : value;
    if (next === cur) { alreadyRight++; continue; }
    changeSets.push({ key: it.path, title: it.name, itemId: it.id, path: it.path, ops: [{ op: 'update', id: it.id, fields: [{ name: field, to: next }] }] });
  }
  return { changeSets, notes: [`${items.length} item(s) matched; ${changeSets.length} to change; ${alreadyRight} already right${onlyEmpty ? `; ${skippedFull} not empty, left alone` : ''}`] };
}
