// Run folders: <project>/runs/<stamp>_<env>_<kind>/ with plan.json and summary.json. A run is the
// only thing apply reads; assertRunFresh refuses an old run or one whose sources changed.
import fs from 'node:fs';
import path from 'node:path';
import { writeJson } from '../config/project.mjs';

export function newRunDir(projectDir, env, kind = 'plan') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runId = `${stamp}_${env}_${kind}`;
  const dir = path.join(path.resolve(projectDir), 'runs', runId);
  fs.mkdirSync(dir, { recursive: true });
  return { runId, dir };
}

const short = (v) => { const s = String(v ?? ''); return s.length > 70 ? s.slice(0, 67) + '…' : s; };
/** One line per change-set step, for show and reports. */
export const describeOp = (o) => ({
  create: () => `create "${o.name}" under ${o.parentPath || o.parent}`,
  copy: () => `copy ${o.sourcePath || o.id} as "${o.name}" under ${o.parentPath || o.toParent}${o.deep === false ? '' : ' (with children)'}`,
  update: () => o.fields.map((f) => `${f.name} on ${o.path || o.id || o.ref}: "${short(f.from)}" → "${short(f.to)}"`).join('; '),
  rename: () => `rename ${o.path || o.id}: "${o.from}" → "${o.to}"`,
  move: () => `move ${o.path || o.id} from ${o.fromParentPath || o.fromParent} to ${o.toParentPath || o.toParent}`,
  delete: () => `delete ${o.path} (recycle bin)`,
}[o.op] || (() => o.op))();

/** Runs of kind "items" hold change sets; show, summaries and reports read them through this page-shaped view. */
export const pageViews = (run) => run.pages || (run.changeSets || []).map((cs) => ({
  key: cs.key, pageId: cs.key, title: cs.title, path: cs.path || null, itemId: cs.itemId || null, status: cs.status, reasons: cs.reasons || [],
  ops: cs.ops ? { creates: cs.ops.filter((o) => o.op === 'create' || o.op === 'copy').map((o) => ({ name: o.name })), updates: cs.ops.filter((o) => o.op === 'update').flatMap((o) => o.fields), layout: null } : null,
  changes: (cs.ops || []).map((o) => (cs.layout && o.op === 'update' && o.fields.every((f) => f.name === '__Final Renderings')
    ? `layout of ${o.path || o.id}: ${(cs.layout.before || []).join(' → ') || '(empty)'}  ⇒  ${(cs.layout.after || []).join(' → ')}` : describeOp(o))), pending: [], kind: 'items',
  diff: { components: cs.layout ? { before: cs.layout.before || [], after: cs.layout.after || [] } : undefined,
    fields: (cs.ops || []).filter((o) => o.op === 'update').flatMap((o) => o.fields.filter((f) => !(cs.layout && f.name === '__Final Renderings')).map((f) => ({ ref: o.path || o.id || o.ref, field: f.name, from: f.from ?? '', to: f.to }))) },
  layout: cs.layout ? { after: cs.layout.after || [] } : undefined,
}));

export function summarize(run) {
  const counts = { ready: 0, 'up-to-date': 0, 'needs-review': 0, 'no-match': 0 };
  let creates = 0, updates = 0, layouts = 0;
  const pendingByCategory = {};
  const pages = pageViews(run);
  for (const p of pages) {
    counts[p.status] = (counts[p.status] ?? 0) + 1;
    creates += p.ops?.creates?.length || 0; updates += p.ops?.updates?.length || 0; layouts += p.ops?.layout ? 1 : 0;
    for (const x of p.pending || []) pendingByCategory[x.category] = (pendingByCategory[x.category] || 0) + 1;
  }
  return { runId: run.runId, env: run.env, createdAt: run.createdAt, ...(run.kind ? { kind: run.kind, operation: run.operation?.name } : {}), pages: pages.length, counts, creates, updates, layouts, pendingByCategory };
}

export function writeRun(dir, run) {
  writeJson(path.join(dir, 'plan.json'), run);
  const summary = summarize(run);
  writeJson(path.join(dir, 'summary.json'), summary);
  return summary;
}

export function loadRun(projectDir, runId) {
  const file = path.join(path.resolve(projectDir), 'runs', runId, 'plan.json');
  if (!fs.existsSync(file)) throw new Error(`No run ${runId} under ${path.join(projectDir, 'runs')}`);
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  run.dir = path.dirname(file);
  return run;
}

export function assertRunFresh(run, { maxAgeHours = 12, sources = [] }) {
  const age = (Date.now() - new Date(run.createdAt).getTime()) / 3600e3;
  if (!(age <= maxAgeHours)) throw new Error(`Run is older than ${maxAgeHours} hours (${age.toFixed(1)} h); make a new dry run`);
  const now = new Map(sources.map((s) => [s.file, s]));
  for (const s of run.sources || []) {
    if (String(s.file).startsWith('sitecore:')) continue; // Sitecore-as-source: the page fingerprint is the drift check
    const cur = now.get(s.file);
    if (!cur || s.sha256 == null) throw new Error(`Source ${s.file} is not registered in the sources manifest; register it and make a new dry run`);
    if (cur.status === 'missing') throw new Error(`Source ${s.file} is missing since the dry run`);
    if (cur.sha256 !== s.sha256) throw new Error(`Source ${s.file} changed since the dry run; make a new dry run`);
  }
}
