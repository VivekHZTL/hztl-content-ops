// `catalog refresh` never deletes (spec 4.5). Added → unverified, removed → missing (dated), changed field
// types keep the old type. Only `catalog verify <key>` by a developer flips a status.
const clone = (o) => JSON.parse(JSON.stringify(o));
const statusOf = (c) => c.status || 'ok';

export function diffCatalog(oldCat, newCat, { now = new Date().toISOString() } = {}) {
  const out = clone(newCat);
  const summary = { added: [], missing: [], changed: [], unchanged: 0 };
  const oldComps = oldCat?.components || {};
  for (const [key, comp] of Object.entries(out.components)) {
    const prev = oldComps[key];
    if (!prev) { comp.status = oldCat ? 'unverified' : 'ok'; if (oldCat) summary.added.push(key); else summary.unchanged++; continue; }
    comp.status = statusOf(prev) === 'unverified' ? 'unverified' : 'ok';
    let changed = false;
    for (const f of comp.fields || []) {
      const pf = (prev.fields || []).find((x) => x.name === f.name);
      if (!pf) { f.status = 'unverified'; changed = true; summary.changed.push(`${key}.${f.name}`); continue; }
      if (pf.status === 'unverified') f.status = 'unverified';
      if (pf.type !== f.type) { f.changedTo = f.type; f.type = pf.type; changed = true; summary.changed.push(`${key}.${f.name}`); }
    }
    for (const pf of prev.fields || []) if (!(comp.fields || []).some((f) => f.name === pf.name)) { comp.fields.push({ ...pf, status: 'missing', missingSince: pf.missingSince || now }); changed = true; summary.changed.push(`${key}.${pf.name}`); }
    if (changed) comp.status = 'changed'; else if (comp.status === 'ok') summary.unchanged++;
  }
  for (const [key, prev] of Object.entries(oldComps)) {
    if (out.components[key]) continue;
    out.components[key] = { ...clone(prev), status: 'missing', missingSince: prev.missingSince || now };
    summary.missing.push(key);
  }
  for (const [key, pt] of Object.entries(oldCat?.pageTypes || {})) if (!out.pageTypes[key]) out.pageTypes[key] = { ...clone(pt), status: 'missing', missingSince: pt.missingSince || now };
  return { catalog: out, summary };
}

export function verifyComponent(catalog, key) {
  const out = clone(catalog);
  const c = out.components[key];
  if (!c) throw new Error(`No component "${key}" in the catalog`);
  const st = statusOf(c);
  if (st === 'ok') return { catalog: out, action: 'noop' };
  if (st === 'missing') {
    delete out.components[key];
    for (const pt of Object.values(out.pageTypes)) pt.layout = (pt.layout || []).filter((k) => k !== key);
    for (const other of Object.values(out.components)) other.children = (other.children || []).filter((k) => k !== key);
    return { catalog: out, action: 'removed' };
  }
  c.fields = (c.fields || []).filter((f) => f.status !== 'missing');
  for (const f of c.fields) { if (f.changedTo) { f.type = f.changedTo; delete f.changedTo; } delete f.status; delete f.missingSince; }
  c.status = 'ok';
  return { catalog: out, action: 'verified' };
}
