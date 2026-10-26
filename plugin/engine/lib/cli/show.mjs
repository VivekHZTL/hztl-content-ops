// `show --run <id> [--status a,b] [--page key] [--pending]`: compact view so nobody reads plan.json.
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';
import { loadRun, summarize, pageViews } from '../plan/run.mjs';

export async function showCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const run = loadRun(ctx.projectDir, need(flags, 'run', 'content-ops show --run <id> [--status a,b] [--page key] [--pending]'));
  let pages = pageViews(run);
  if (flags.status && flags.status !== true) { const set = new Set(String(flags.status).split(',')); pages = pages.filter((p) => set.has(p.status)); }
  if (flags.page && flags.page !== true) pages = pages.filter((p) => p.key === flags.page || p.pageId === flags.page);
  const view = pages.map((p) => ({ key: p.key, pageId: p.pageId, path: p.path, status: p.status, reasons: p.reasons || [], creates: p.ops?.creates?.map((c) => c.name) || [], updates: p.ops?.updates?.length || 0, layout: p.ops?.layout ? { before: p.diff?.components?.before, after: p.layout?.after } : null, pending: flags.pending || flags.page ? p.pending : (p.pending || []).length, ...(p.changes ? { changes: p.changes } : {}) }));
  return emit(ctx, { ...summarize(run), pages: view });
}
