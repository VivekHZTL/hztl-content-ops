// Self-contained HTML reports: a template with the data inlined as JSON (`<` escaped so it can never close
// the script tag). No external resources. Light and dark. Re-rendered from saved files, never from Sitecore.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from './pending.mjs';
import { pageViews } from '../plan/run.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const tpl = (name) => fs.readFileSync(path.join(here, 'templates', name), 'utf8');
export const escapeJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const fill = (name, data) => tpl(name).replace('/*__CSS__*/', () => tpl('_base.css')).replace('/*__DATA__*/null', () => escapeJson(data));

const pageRow = (p) => ({ kind: p.kind || 'page', changes: p.changes || [], key: p.key, pageId: p.pageId, path: p.path, status: p.status, reasons: p.reasons || [], creates: (p.ops?.creates || []).map((c) => c.name), updates: (p.ops?.updates || []).length, layout: !!p.ops?.layout, pending: (p.pending || []).map((x) => ({ ...x, category: x.category || 'other' })), before: p.diff?.components?.before || [], after: p.layout?.after || p.diff?.components?.after || [], fields: (p.diff?.fields || []).map((f) => ({ ref: f.ref, field: f.field, from: String(f.from ?? '').slice(0, 300), to: String(f.to ?? '').slice(0, 300) })) });

export function renderDryRun(run) {
  const pages = pageViews(run).map(pageRow);
  const counts = {}; for (const p of pages) counts[p.status] = (counts[p.status] || 0) + 1;
  const pending = pages.flatMap((p) => p.pending.map((x) => ({ page: p.key, ...x })));
  return fill('dry-run.html', { title: `Dry run ${run.runId}`, runId: run.runId, env: run.env, host: run.host || null, createdAt: run.createdAt, counts, pages, pending, categories: CATEGORIES, sources: run.sources || [] });
}

export function renderRun(run, results) {
  const byKey = new Map(pageViews(run).map((p) => [p.key, pageRow(p)]));
  const rows = (results.results || []).map((r) => ({ ...r, page: byKey.get(r.key) || { key: r.key } }));
  const written = rows.filter((r) => r.status === 'done').map((r) => ({ ...r, undo: `content-ops undo --run ${run.runId} --apply ${results.applyId} --page ${r.key} --confirm ${run.env}${run.isProd ? ' --prod' : ''}` }));
  const notWritten = rows.filter((r) => r.status !== 'done');
  const pending = rows.filter((r) => r.status === 'done').flatMap((r) => (r.page.pending || []).map((x) => ({ page: r.key, ...x })));
  return fill('run.html', { title: `Run ${results.applyId} on ${run.env}`, runId: run.runId, applyId: results.applyId, env: run.env, host: run.host || null, counts: results.counts || {}, written, notWritten, notStarted: results.notStarted || [], stoppedEarly: results.stoppedEarly || null, pending, categories: CATEGORIES, recheck: results.recheck || null });
}

/** One row per page ever written on an env, latest status wins (by applyId order, then results order). */
const NO_WRITE = new Set(['skipped', 'stale', 'up-to-date']);
export function renderCombined(entries) {
  const latest = new Map();
  const sorted = entries.flatMap(({ run, results, undone }) => results.map((res) => ({ run, res, undone: undone || new Set() }))).sort((a, b) => String(a.res.applyId).localeCompare(String(b.res.applyId)));
  for (const { run, res, undone } of sorted) for (const r of res.results || []) {
    const page = pageViews(run).find((p) => p.key === r.key);
    const id = r.itemId || page?.itemId || r.key;
    const prev = latest.get(id);
    if (prev && NO_WRITE.has(r.status) && !NO_WRITE.has(prev.status)) continue; // a later non-write never hides an earlier write
    latest.set(id, { key: r.key, itemId: id, path: page?.path || null, status: r.status, runId: run.runId, applyId: res.applyId, error: r.error || null, manualRollback: !!r.manualRollback || undone.has(`${res.applyId}|${r.key}`) });
  }
  const rows = [...latest.values()];
  const counts = {}; for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  const env = entries[0]?.run?.env || '';
  return fill('combined.html', { title: `All runs on ${env}`, env, counts, rows, runs: entries.map((e) => ({ runId: e.run.runId, createdAt: e.run.createdAt, applies: e.results.map((r) => r.applyId) })) });
}
