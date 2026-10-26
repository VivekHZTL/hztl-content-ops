// Guarded delete: plan from a saved scan (blocked when referenced from outside the deleted set), journaled
// recycle-bin delete with drift checks, undo through restoreArchivedItem. Never permanent, never Home.
import fs from 'node:fs';
import { buildRefIndex } from '../refs/index.mjs';
import { assertWritable } from './guards.mjs';
import { writeJson } from '../config/project.mjs';
import { normId } from '../cm/ids.mjs';

const kidsMap = (tree) => { const m = new Map(); for (const t of tree) { if (!m.has(t.parentId)) m.set(t.parentId, []); m.get(t.parentId).push(t); } return m; };
const subtree = (kids, id) => { const out = []; const walk = (x) => { out.push(x); for (const c of kids.get(x) || []) walk(c.id); }; walk(id); return out; };

export function planDelete({ scan, targets, homePath, siteRoot = null }) {
  const home = homePath.replace(/\/$/, '').toLowerCase();
  if (siteRoot) { const sr = siteRoot.replace(/\/$/, '').toLowerCase(); const root = String(scan.root || '').replace(/\/$/, '').toLowerCase(); if (!root || !(sr + '/').startsWith(root + '/')) throw new Error(`The scan must start at the site root (${siteRoot}) or above it so references from outside Home are seen; this scan starts at ${scan.root}`); }
  const byPath = new Map(scan.tree.map((t) => [t.path.toLowerCase(), t]));
  const byId = new Map(scan.tree.map((t) => [t.id, t]));
  const kids = kidsMap(scan.tree);
  let roots = targets.map((t) => (/^\{?[0-9a-f-]{32,}\}?$/i.test(t) ? byId.get(normId(t)) : byPath.get(t.toLowerCase())) || (() => { throw new Error(`Target not in scan: ${t}`); })());
  // a root inside another root is covered by the parent
  roots = roots.filter((r) => !roots.some((o) => o !== r && (r.path.toLowerCase() + '/').startsWith(o.path.toLowerCase() + '/')));
  for (const r of roots) {
    if (r.path.toLowerCase() === home) throw new Error(`Refusing to plan a delete of Home (${r.path})`);
    if (!(r.path.toLowerCase() + '/').startsWith(home + '/')) throw new Error(`Refusing ${r.path}: outside ${homePath}`);
  }
  // Rounds: a root referenced only from another root that turns out blocked is itself blocked.
  const everything = new Set(roots.flatMap((r) => subtree(kids, r.id)));
  const { refs } = buildRefIndex({ tree: scan.tree, fields: scan.fields, targets: everything, homePath });
  let deletableSet = new Set(roots.map((r) => r.id));
  let items;
  for (;;) {
    const all = new Set([...deletableSet].flatMap((id) => subtree(kids, id)));
    items = roots.map((r) => {
      const mine = new Set(subtree(kids, r.id));
      const externalRefs = refs.filter((x) => mine.has(x.target) && !all.has(x.from)).map((x) => ({ from: byId.get(x.from)?.path || x.from, field: x.field, how: x.how, to: byId.get(x.target)?.path || x.target }));
      return { id: r.id, path: r.path, name: r.name, subtree: mine.size, childIds: (kids.get(r.id) || []).map((c) => c.id).sort(), updated: scan.fields[r.id]?.f?.__Updated || null, externalRefs };
    });
    const next = new Set(items.filter((i) => !i.externalRefs.length).map((i) => i.id));
    if (next.size === deletableSet.size) break;
    deletableSet = next;
  }
  return { env: scan.env, scanAt: scan.at || null, scanRoot: scan.root || null, at: new Date().toISOString(), homePath, items, deletable: items.filter((i) => !i.externalRefs.length), blocked: items.filter((i) => i.externalRefs.length) };
}

export async function applyDelete({ cm, plan, journalFile, confirm, prod = false, maxFailures = 3, maxAgeHours = 12, limit = null }) {
  assertWritable(cm, { confirm, prod });
  if (plan.env && cm.env && plan.env !== cm.env) throw new Error(`Plan is for ${plan.env}, client is ${cm.env}`);
  for (const [label, at] of [['plan', plan.at], ['scan', plan.scanAt]]) { if (!at) continue; const age = (Date.now() - new Date(at).getTime()) / 3600e3; if (age > maxAgeHours) throw new Error(`The ${label} is older than ${maxAgeHours} hours (${age.toFixed(1)} h); scan and plan again`); }
  const home = (plan.homePath || '').replace(/\/$/, '').toLowerCase();
  for (const it of plan.deletable) { if (home && (it.path.toLowerCase() === home || !(it.path.toLowerCase() + '/').startsWith(home + '/'))) throw new Error(`Refusing ${it.path}: Home or outside ${plan.homePath}`); }
  const todo = limit ? plan.deletable.slice(0, limit) : plan.deletable;
  const notStarted = plan.deletable.length - todo.length;
  const journal = { env: cm.env, startedAt: new Date().toISOString(), roots: [] };
  const save = () => writeJson(journalFile, journal);
  const deleted = [], skipped = [], failed = [];
  let failures = 0;
  for (const it of todo) {
    const rec = { id: it.id, path: it.path, name: it.name, state: 'checking' }; journal.roots.push(rec); save();
    try {
      const cur = await cm.getItem({ id: it.id });
      if (!cur) { rec.state = 'already-gone'; skipped.push({ path: it.path, why: 'already gone' }); save(); continue; }
      const childIds = cur.children.map((c) => c.id).sort();
      if (cur.path !== it.path || JSON.stringify(childIds) !== JSON.stringify(it.childIds) || (it.updated && cur.fields.__Updated?.value && cur.fields.__Updated.value !== it.updated)) { rec.state = 'skipped'; rec.why = 'item changed since the plan (path, children or __Updated)'; skipped.push({ path: it.path, why: rec.why }); save(); continue; }
      rec.state = 'deleting'; save();
      await cm.deleteItem({ id: it.id });
      if (await cm.getItem({ id: it.id })) throw new Error('item still present after delete');
      rec.state = 'deleted'; rec.deletedAt = new Date().toISOString(); deleted.push({ path: it.path, id: it.id }); save();
    } catch (e) { rec.state = 'FAILED'; rec.error = e.message; failed.push({ path: it.path, error: e.message }); save(); if (++failures >= maxFailures) { journal.stoppedEarly = `Stopped after ${failures} failures`; break; } }
  }
  journal.finishedAt = new Date().toISOString(); save();
  return { deleted, skipped, failed, notStarted, blocked: plan.blocked.map((b) => b.path), journal: journalFile, stoppedEarly: journal.stoppedEarly || null };
}

export async function undoDelete({ cm, journal, confirm, prod = false }) {
  assertWritable(cm, { confirm, prod });
  if (journal.env && cm.env && journal.env !== cm.env) throw new Error(`Journal is for ${journal.env}, client is ${cm.env}`);
  const restored = [], problems = [];
  // reverse order so a parent comes back before a child; also try roots left in 'deleting' or 'FAILED' that are gone
  for (const r of [...journal.roots].reverse().filter((x) => ['deleted', 'deleting', 'FAILED'].includes(x.state))) {
    try {
      if (r.state !== 'deleted' && (await cm.getItem({ id: r.id }))) { r.state = 'present'; continue; }
      await cm.restoreArchivedItem({ id: r.id }); if (!(await cm.getItem({ id: r.id }))) throw new Error('not present after restore'); r.state = 'restored'; restored.push(r.path);
    } catch (e) { problems.push(`${r.path}: ${e.message}`); }
  }
  return { restored, problems };
}
