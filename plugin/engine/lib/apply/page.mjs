// Real run for one page, in this order:
//   1. Re-read the page; if anything changed since the dry run, skip it ("stale").
//   2. Create new datasource items, then update fields, then the layout, then rename.
//      Every step is written to the journal BEFORE it runs.
//   3. Read everything back and compare with the plan.
//   4. On any error or mismatch, undo this page from its journal (auto-rollback).
// Never publishes.
//
// Plan shape (what the planner must produce):
//   { key, itemId, title, status: 'ready'|..., fingerprint,
//     ops: { creates: [{ ref:'new:<name>', parentRef:'page'|'new:<name>'|'<32hex>', name, templateId }],
//            updates: [{ ref, field, from, std, to }],      // `to` may hold {{new:<name>}} tokens
//            layout: { to:'<xml>' } | null, rename: { from, to } | null },
//     layout: { after: ['Component', ...], themesAfter?: ['White', ...] } }
import fs from 'node:fs';
import path from 'node:path';
import { snapshotPage, fingerprint } from '../snapshot/page.mjs';
import { parseLayout, describe, themesOf, layoutGuards } from '../layout/layout.mjs';
import { assertWritable } from './guards.mjs';
import { sameValue } from '../verify/values.mjs';
import { journalWriter, rollbackJournal } from './journal.mjs';
import { braced, normId } from '../cm/ids.mjs';

const resolveRef = (refs, ref) => refs[ref] ?? (/^[0-9a-f]{32}$/i.test(ref) ? normId(ref) : null);
/** Field values can point at items created earlier in the same run (e.g. a multilist of new links). */
const fill = (refs, v) => (typeof v === 'string' ? v.replace(/\{\{(new:[^}]+)\}\}/g, (m, r) => { if (!refs[r]) throw new Error(`${r} was not created`); return braced(refs[r]); }) : v);

export async function verifyPage(cm, plan, refs, site) {
  const bad = [];
  const cache = {};
  const get = async (id) => (id ? (cache[id] ??= await cm.getItem({ id })) : null);
  for (const u of plan.ops.updates) {
    const it = await get(resolveRef(refs, u.ref));
    if (!it) { bad.push(`Item for ${u.ref} not found`); continue; }
    if (!sameValue(it.fields[u.field]?.value, fill(refs, u.to))) bad.push(`${u.field} on ${it.name}: expected "${String(fill(refs, u.to)).slice(0, 60)}", found "${String(it.fields[u.field]?.value).slice(0, 60)}"`);
  }
  const page = (cache[refs.page] = await cm.getItem({ id: refs.page }));
  if (plan.ops.layout) {
    const entries = parseLayout(page.fields['__Final Renderings']?.value, site).entries;
    const got = describe(entries, site).map((s) => s.trim());
    const want = plan.layout.after.map((s) => s.trim());
    if (got.join('|') !== want.join('|')) bad.push(`Layout is [${got.join(', ')}], expected [${want.join(', ')}]`);
    if (plan.layout.themesAfter) { const gotT = themesOf(entries); if (gotT.join('|') !== plan.layout.themesAfter.join('|')) bad.push(`Themes are [${gotT.join(', ')}], expected [${plan.layout.themesAfter.join(', ')}]`); }
  }
  if (plan.ops.rename && page.name !== plan.ops.rename.to) bad.push(`Item name is ${page.name}, expected ${plan.ops.rename.to}`);
  for (const c of plan.ops.creates) if (!refs[c.ref]) bad.push(`${c.name} was not created`);
  return bad;
}

export async function applyPage({ cm, plan, runDir, applyId, site, confirm, prod = false, autoRollback = true, dataFolder = 'Data' }) {
  assertWritable(cm, { confirm, prod });
  const result = { key: plan.key, itemId: plan.itemId, title: plan.title, startedAt: new Date().toISOString() };
  if (plan.status !== 'ready' || !plan.ops) return { ...result, status: 'skipped', error: `Status is ${plan.status}` };
  const fresh = await snapshotPage(cm, plan.itemId, { dataFolder });
  if (fingerprint(fresh) !== plan.fingerprint) return { ...result, status: 'stale', error: 'Page changed in Sitecore after the dry run; run a new dry run' };
  if (plan.ops.layout) {
    const reasons = layoutGuards(fresh.page.fields['__Final Renderings']?.value, fresh.page.fields['__Renderings']?.value, site);
    if (reasons.length) return { ...result, status: 'skipped', error: `Layout refused: ${reasons.join('; ')}` };
  }

  fs.mkdirSync(path.join(runDir, 'journal'), { recursive: true });
  const jw = journalWriter(path.join(runDir, 'journal', `${applyId}_${plan.key.replace(/[^a-z0-9-]+/gi, '_').slice(-80)}.json`), { key: plan.key, itemId: plan.itemId, env: cm.env, applyId });
  const refs = { page: plan.itemId };
  const resolve = (ref) => resolveRef(refs, ref);
  try {
    for (const c of plan.ops.creates) {
      const parentId = resolve(c.parentRef);
      if (!parentId) throw new Error(`Parent for ${c.name} not available`);
      const parent = await cm.getItem({ id: parentId });
      const rec = { op: 'create', parentId, name: c.name, preexisting: parent.children.map((x) => x.id) };
      if (parent.children.some((x) => x.name === c.name)) throw new Error(`${c.name} already exists under ${parent.name}`);
      refs[c.ref] = await jw.step(rec, async () => { const id = await cm.createItem({ parentId, name: c.name, templateId: c.templateId }); rec.id = id; return id; });
    }
    const byRef = {};
    for (const u of plan.ops.updates) (byRef[u.ref] ??= []).push(u);
    for (const [ref, list] of Object.entries(byRef)) {
      const id = resolve(ref);
      if (!id) throw new Error(`Item for ${ref} not available`);
      const rec = { op: 'update', id, fields: list.map((u) => ({ name: u.field, from: u.from, std: u.std, to: fill(refs, u.to) })) };
      await jw.step(rec, () => cm.updateItem({ id, fields: list.map((u) => ({ name: u.field, value: fill(refs, u.to) })) }));
    }
    if (plan.ops.layout) {
      const f = fresh.page.fields['__Final Renderings'] || { value: '', std: true };
      const rec = { op: 'update', id: plan.itemId, fields: [{ name: '__Final Renderings', from: f.value, std: f.std, to: plan.ops.layout.to }] };
      await jw.step(rec, () => cm.updateItem({ id: plan.itemId, fields: [{ name: '__Final Renderings', value: plan.ops.layout.to }] }));
    }
    if (plan.ops.rename) {
      const rec = { op: 'rename', id: plan.itemId, from: plan.ops.rename.from, to: plan.ops.rename.to };
      await jw.step(rec, () => cm.renameItem({ id: plan.itemId, newName: plan.ops.rename.to }));
    }
    const bad = await verifyPage(cm, plan, refs, site);
    if (!bad.length) { jw.finish('done'); return { ...result, status: 'done', created: Object.fromEntries(Object.entries(refs).filter(([k]) => k.startsWith('new:'))), journal: path.basename(jw.j.file) }; }
    throw Object.assign(new Error('Verification failed'), { verify: bad });
  } catch (e) {
    const out = { ...result, error: e.message, verify: e.verify };
    if (!autoRollback) { jw.finish('failed', { error: e.message }); return { ...out, status: 'failed' }; }
    const problems = await rollbackJournal(cm, jw.j);
    jw.finish(problems.length ? 'rollback-incomplete' : 'rolled-back', { error: e.message, rollbackProblems: problems });
    return { ...out, status: problems.length ? 'rollback-incomplete' : 'rolled-back', rollbackProblems: problems };
  }
}
