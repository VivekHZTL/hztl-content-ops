// Change sets: the item-level unit of a governed write, for anything an operation needs that is not a
// page-from-content plan (shared datasources, Data items, renames, moves, copies, deletes, layout edits).
//
// An operation's build step proposes ops; this planner (read-only) checks each one against Sitecore,
// records the before-state itself (operations cannot supply or fake it), drops steps that would change
// nothing, and fingerprints exactly what the set touches so apply can refuse a stale plan.
//
//   ops: { op: 'create', ref: 'new:x', parent: <id>|'new:y', name, templateId, fields?: [{ name, to }], reuse? }
//        { op: 'update', id | ref, fields: [{ name, to }] }      → fields gain from, std
//        { op: 'rename', id, to }                                → gains from
//        { op: 'move', id, toParent: <id>|'new:y', sortOrder? }  → gains fromParent
//        { op: 'copy', ref: 'new:x', id, toParent, name, deep? }
//        { op: 'delete', id, ifPresent? }                        → gains name, parent; recycle bin only
import crypto from 'node:crypto';
import { normId } from '../cm/ids.mjs';
import { sameValue } from '../verify/values.mjs';

export const OPS = ['create', 'update', 'rename', 'move', 'copy', 'delete'];
const lower = (p) => String(p || '').replace(/\/$/, '').toLowerCase();
const under = (p, root) => lower(p) === lower(root) || lower(p).startsWith(lower(root) + '/');
const isRef = (r) => typeof r === 'string' && r.startsWith('new:');

/** The state of the touched items that apply compares before writing. */
export async function guardState(cm, guard) {
  const out = [];
  for (const g of guard) {
    const it = await cm.getItem({ id: g.id });
    out.push(it ? [g.id, it.name, it.parentId, ...g.fields.map((f) => it.fields[f]?.value ?? null)] : [g.id, null]);
  }
  return crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex');
}

export async function planChangeSet(cm, set, { siteRoot, homePath = null } = {}) {
  const reasons = [...(set.reasons || [])];
  const cache = new Map();
  const get = async (id) => { const k = normId(id); if (!cache.has(k)) cache.set(k, await cm.getItem({ id: k })); return cache.get(k); };
  const refs = new Map(); // ref → { bound: id } | { created: true }
  const guard = new Map(); // id → Set(fields)
  const touch = (id, fields = []) => { const k = normId(id); const s = guard.get(k) || new Set(); fields.forEach((f) => s.add(f)); guard.set(k, s); };
  const existing = async (id, what) => {
    const it = await get(id);
    if (!it) { reasons.push(`${what}: item ${id} not found`); return null; }
    if (siteRoot && !under(it.path, siteRoot)) { reasons.push(`${what}: ${it.path} is outside the site root ${siteRoot}`); return null; }
    return it;
  };
  const parentOf = async (p, what) => {
    if (isRef(p)) { if (!refs.has(p)) reasons.push(`${what}: ${p} is not created earlier in this change set`); return refs.get(p)?.bound ? await get(refs.get(p).bound) : null; }
    return existing(p, what);
  };
  // Children as they will be after the earlier steps of this set (renames, moves, deletes, creates).
  const kids = new Map(); // parent id or ref → Map(lower name → id or ref)
  const kidsOf = async (key) => {
    if (!kids.has(key)) { const it = isRef(key) ? null : await get(key); kids.set(key, new Map((it?.children || []).map((c) => [c.name.toLowerCase(), c.id]))); }
    return kids.get(key);
  };
  const out = [];
  for (const [i, raw] of (set.ops || []).entries()) {
    const o = structuredClone(raw); const what = `step ${i + 1} (${o.op})`;
    if (!OPS.includes(o.op)) { reasons.push(`${what}: Unknown op "${o.op}"`); continue; }
    if (o.op === 'create' || o.op === 'copy') {
      if (!isRef(o.ref)) { reasons.push(`${what}: ref must look like new:<name>`); continue; }
      if (!o.name || /\//.test(o.name)) { reasons.push(`${what}: a name without "/" is required`); continue; }
      if (o.op === 'create' && !/^[0-9a-f]{32}$/i.test(normId(o.templateId))) { reasons.push(`${what}: templateId is not a GUID`); continue; }
      const parentRef = o.op === 'create' ? o.parent : o.toParent;
      const parent = await parentOf(parentRef, what);
      if (o.op === 'copy' && !(await get(o.id))) { reasons.push(`${what}: source item ${o.id} not found`); continue; }
      const pkey = isRef(parentRef) && !refs.get(parentRef)?.bound ? parentRef : parent?.id;
      if (!pkey) continue;
      const siblings = await kidsOf(pkey);
      const clash = siblings.get(o.name.toLowerCase());
      if (clash && o.op === 'create' && o.reuse && !isRef(clash)) { refs.set(o.ref, { bound: clash }); continue; }
      if (clash) { reasons.push(`${what}: "${o.name}" already exists under ${parent?.path || parentRef}`); continue; }
      refs.set(o.ref, { created: true, path: parent ? `${parent.path}/${o.name}` : `${refs.get(parentRef)?.path || parentRef}/${o.name}` }); siblings.set(o.name.toLowerCase(), o.ref);
      o.parentPath = parent?.path || refs.get(parentRef)?.path || parentRef;
      if (o.op === 'copy') o.sourcePath = (await get(o.id))?.path;
      if (parent) touch(parent.id);
      out.push(o); continue;
    }
    if (o.op === 'update') {
      if (o.ref) {
        if (refs.get(o.ref)?.path) o.path = refs.get(o.ref).path;
        if (!refs.has(o.ref)) { reasons.push(`${what}: ${o.ref} is not created earlier in this change set`); continue; }
        if (refs.get(o.ref).bound) { o.id = refs.get(o.ref).bound; delete o.ref; }
      }
      if (!o.ref) {
        const it = await existing(o.id, what); if (!it) continue;
        o.id = it.id; o.path = it.path;
        const unknown = (o.fields || []).filter((f) => !(f.name in it.fields)).map((f) => f.name);
        if (unknown.length && Object.keys(it.fields).length) { reasons.push(`${what}: ${unknown.join(', ')} not a field on ${it.path} (${it.templateName})`); continue; }
        o.fields = (o.fields || []).map((f) => ({ ...f, from: it.fields[f.name]?.value ?? '', std: it.fields[f.name] ? !!it.fields[f.name].std : true }))
          .filter((f) => !(typeof f.to === 'string' && !/\{\{new:/.test(f.to) && sameValue(f.from, f.to)));
        if (!o.fields.length) continue;
        touch(it.id, o.fields.map((f) => f.name));
      }
      out.push(o); continue;
    }
    if (o.op === 'delete') {
      const it = await get(o.id);
      if (!it && o.ifPresent) continue;
      const ok = await existing(o.id, what); if (!ok) continue;
      if (lower(ok.path) === lower(siteRoot) || (homePath && under(homePath, ok.path)) || under(siteRoot, ok.path)) { reasons.push(`${what}: refusing to delete the site root, Home, or one of their ancestors (${ok.path})`); continue; }
      Object.assign(o, { id: ok.id, name: ok.name, parent: ok.parentId, path: ok.path }); touch(ok.id); out.push(o);
      (await kidsOf(ok.parentId)).delete(ok.name.toLowerCase()); continue;
    }
    const it = await existing(o.id, what); if (!it) continue;
    o.id = it.id;
    if (o.op === 'rename') {
      if (!o.to || /\//.test(o.to)) { reasons.push(`${what}: a new name without "/" is required`); continue; }
      if (it.name === o.to) continue;
      const sib = await kidsOf(it.parentId);
      if (sib.has(o.to.toLowerCase()) && o.to.toLowerCase() !== it.name.toLowerCase()) { reasons.push(`${what}: "${o.to}" already exists next to ${it.path}`); continue; }
      sib.delete(it.name.toLowerCase()); sib.set(o.to.toLowerCase(), it.id);
      o.from = it.name; o.path = it.path; touch(it.id); out.push(o); continue;
    }
    // move
    const target = await parentOf(o.toParent, what);
    if (target && (target.id === it.id || under(target.path, it.path))) { reasons.push(`${what}: cannot move ${it.path} inside itself`); continue; }
    if (target && target.id === it.parentId) continue;
    const tkey = isRef(o.toParent) && !refs.get(o.toParent)?.bound ? o.toParent : target?.id;
    if (tkey) { const dest = await kidsOf(tkey); if (dest.has(it.name.toLowerCase())) { reasons.push(`${what}: "${it.name}" already exists under the target`); continue; } dest.set(it.name.toLowerCase(), it.id); }
    (await kidsOf(it.parentId)).delete(it.name.toLowerCase());
    o.fromParent = it.parentId; o.path = it.path; o.fromParentPath = (await get(it.parentId))?.path; o.toParentPath = target?.path || refs.get(o.toParent)?.path || o.toParent;
    touch(it.id); out.push(o);
  }
  const g = [...guard].map(([id, f]) => ({ id, fields: [...f] }));
  const base = { ...set, ops: out, guard: g, reasons, bound: Object.fromEntries([...refs].filter(([, v]) => v.bound).map(([k, v]) => [k, v.bound])) };
  if (reasons.length) return { ...base, status: 'needs-review' };
  if (!out.length) return { ...base, status: 'up-to-date' };
  return { ...base, status: 'ready', fingerprint: await guardState(cm, g) };
}
