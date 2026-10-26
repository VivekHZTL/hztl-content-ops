// Real run for one change set, the same contract as applyPage:
//   1. Re-read what the set touches; if anything changed since the dry run, skip it ("stale").
//   2. Run the ops in order. Every step is written to the journal BEFORE it runs.
//   3. Read everything back and compare with the plan.
//   4. On any error or mismatch, undo the set from its journal (auto-rollback).
// Never publishes.
import fs from 'node:fs';
import path from 'node:path';
import { assertWritable } from '../apply/guards.mjs';
import { journalWriter, rollbackJournal } from '../apply/journal.mjs';
import { sameValue } from '../verify/values.mjs';
import { braced, normId } from '../cm/ids.mjs';
import { guardState } from './plan.mjs';

const fill = (refs, v) => (typeof v === 'string' ? v.replace(/\{\{(new:[^}]+)\}\}/g, (m, r) => { if (!refs[r]) throw new Error(`${r} was not created`); return braced(refs[r]); }) : v);
const idOf = (refs, r) => (typeof r === 'string' && r.startsWith('new:') ? refs[r] : normId(r));

export async function verifyChangeSet(cm, plan, refs) {
  const bad = [];
  const deleted = new Set(plan.ops.filter((o) => o.op === 'delete').map((o) => o.id));
  for (const o of plan.ops) {
    if (o.op !== 'delete' && deleted.has(o.id)) continue; // a later step removed it
    if (o.op === 'create' || o.op === 'copy') {
      const it = refs[o.ref] && await cm.getItem({ id: refs[o.ref] });
      if (!it) { bad.push(`${o.name} was not created`); continue; }
      if (it.name !== o.name || it.parentId !== idOf(refs, o.op === 'create' ? o.parent : o.toParent)) bad.push(`${o.name} is at ${it.path}, not where planned`);
      for (const f of o.fields || []) if (!sameValue(it.fields[f.name]?.value, fill(refs, f.to))) bad.push(`${f.name} on ${o.name} is not the planned value`);
    } else if (o.op === 'update') {
      const id = o.ref ? refs[o.ref] : o.id; const it = id && await cm.getItem({ id });
      if (!it) { bad.push(`Item for ${o.ref || o.id} not found`); continue; }
      for (const f of o.fields) if (!sameValue(it.fields[f.name]?.value, fill(refs, f.to))) bad.push(`${f.name} on ${it.name}: expected "${String(fill(refs, f.to)).slice(0, 60)}", found "${String(it.fields[f.name]?.value ?? '').slice(0, 60)}"`);
    } else if (o.op === 'rename') {
      const it = await cm.getItem({ id: o.id }); if (it?.name !== o.to) bad.push(`Item ${o.id} is named ${it?.name}, expected ${o.to}`);
    } else if (o.op === 'move') {
      const it = await cm.getItem({ id: o.id }); if (it?.parentId !== idOf(refs, o.toParent)) bad.push(`Item ${it?.path || o.id} is not under the planned parent`);
    } else if (o.op === 'delete') {
      if (await cm.getItem({ id: o.id })) bad.push(`${o.path} still exists`);
    }
  }
  return bad;
}

export async function applyChangeSet({ cm, plan, runDir, applyId, confirm, prod = false, autoRollback = true }) {
  assertWritable(cm, { confirm, prod });
  const result = { key: plan.key, itemId: plan.itemId || null, title: plan.title, startedAt: new Date().toISOString() };
  if (plan.status !== 'ready' || !plan.ops?.length) return { ...result, status: 'skipped', error: `Status is ${plan.status}` };
  if ((await guardState(cm, plan.guard || [])) !== plan.fingerprint) return { ...result, status: 'stale', error: 'Items changed in Sitecore after the dry run; run a new dry run' };
  fs.mkdirSync(path.join(runDir, 'journal'), { recursive: true });
  const jw = journalWriter(path.join(runDir, 'journal', `${applyId}_${plan.key.replace(/[^a-z0-9-]+/gi, '_').slice(-80)}.json`), { key: plan.key, itemId: plan.itemId || null, env: cm.env, applyId, kind: 'items' });
  const refs = { ...(plan.itemId ? { page: normId(plan.itemId) } : {}), ...(plan.bound || {}) };
  try {
    for (const o of plan.ops) {
      if (o.op === 'create' || o.op === 'copy') {
        const parentId = idOf(refs, o.op === 'create' ? o.parent : o.toParent);
        if (!parentId) throw new Error(`Parent for ${o.name} not available`);
        const parent = await cm.getItem({ id: parentId });
        if (parent.children.some((c) => c.name.toLowerCase() === o.name.toLowerCase())) throw new Error(`${o.name} already exists under ${parent.path}`);
        const rec = o.op === 'create'
          ? { op: 'create', parentId, name: o.name, preexisting: parent.children.map((c) => c.id) }
          : { op: 'copy', sourceId: o.id, parentId, name: o.name, preexisting: parent.children.map((c) => c.id) };
        refs[o.ref] = await jw.step(rec, async () => {
          const id = o.op === 'create'
            ? await cm.createItem({ parentId, name: o.name, templateId: o.templateId, fields: (o.fields || []).map((f) => ({ name: f.name, value: fill(refs, f.to) })) })
            : await cm.copyItem({ id: o.id, toParentId: parentId, name: o.name, deep: o.deep !== false });
          rec.id = id; return id;
        });
      } else if (o.op === 'update') {
        const id = o.ref ? refs[o.ref] : o.id;
        if (!id) throw new Error(`Item for ${o.ref} not available`);
        const rec = { op: 'update', id, fields: o.fields.map((f) => ({ name: f.name, from: f.from ?? '', std: f.std ?? true, to: fill(refs, f.to) })) };
        await jw.step(rec, () => cm.updateItem({ id, fields: rec.fields.map((f) => ({ name: f.name, value: f.to })) }));
      } else if (o.op === 'rename') {
        const rec = { op: 'rename', id: o.id, from: o.from, to: o.to };
        await jw.step(rec, () => cm.renameItem({ id: o.id, newName: o.to }));
      } else if (o.op === 'move') {
        const toParentId = idOf(refs, o.toParent);
        if (!toParentId) throw new Error(`Target for moving ${o.id} not available`);
        const rec = { op: 'move', id: o.id, fromParentId: o.fromParent, toParentId };
        await jw.step(rec, () => cm.moveItem({ id: o.id, toParentId, sortOrder: o.sortOrder }));
      } else if (o.op === 'delete') {
        const rec = { op: 'delete', id: o.id, name: o.name, parentId: o.parent, path: o.path };
        await jw.step(rec, () => cm.deleteItem({ id: o.id }));
      }
    }
    const bad = await verifyChangeSet(cm, plan, refs);
    const created = Object.fromEntries(Object.entries(refs).filter(([k]) => k.startsWith('new:')));
    if (!bad.length) { jw.finish('done', { created }); return { ...result, status: 'done', created, journal: path.basename(jw.j.file) }; }
    throw Object.assign(new Error('Verification failed'), { verify: bad });
  } catch (e) {
    const out = { ...result, error: e.message, verify: e.verify };
    if (!autoRollback) { jw.finish('failed', { error: e.message }); return { ...out, status: 'failed' }; }
    const problems = await rollbackJournal(cm, jw.j);
    jw.finish(problems.length ? 'rollback-incomplete' : 'rolled-back', { error: e.message, rollbackProblems: problems });
    return { ...out, status: problems.length ? 'rollback-incomplete' : 'rolled-back', rollbackProblems: problems };
  }
}
