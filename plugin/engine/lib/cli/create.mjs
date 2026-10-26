// `create --run <id> --confirm <env> [--prod]`: create page shells for no-match pages whose content says
// target.mode "create". Journaled. Afterwards the author runs plan again (now update) and apply.
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need, requireCatalog } from './common.mjs';
import { loadRun } from '../plan/run.mjs';
import { createPage } from '../apply/create-page.mjs';
import { assertWritable } from '../apply/guards.mjs';
import { writeJson } from '../config/project.mjs';

export async function createCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const usage = 'content-ops create --run <id> --confirm <env> [--prod]';
  const run = loadRun(ctx.projectDir, need(flags, 'run', usage));
  const confirm = flags.confirm === true ? '' : flags.confirm;
  if (!confirm) throw new Error(`Writes need --confirm ${run.env}. ${usage}`);
  if (confirm !== run.env) throw new Error(`--confirm "${confirm}" does not match the run's environment "${run.env}"`);
  const { catalog } = requireCatalog(ctx.cfg);
  const cm = ctx.cmFactory(run.env, { allowWrites: true });
  assertWritable(cm, { confirm, prod: !!flags.prod });
  const applyId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const journal = { runId: run.runId, env: run.env, applyId, kind: 'create', startedAt: new Date().toISOString(), pages: [] };
  const file = path.join(run.dir, 'journal', `create-${applyId}.json`);
  const save = () => writeJson(file, journal);
  const created = [], skipped = [], failed = [];
  for (const p of run.pages) {
    const c = p.content;
    if (p.status !== 'no-match' || c?.target?.mode !== 'create') { skipped.push({ key: p.key, why: p.status !== 'no-match' ? `status ${p.status}` : `mode ${c?.target?.mode || 'update'}` }); continue; }
    if (!c.pageType) { skipped.push({ key: p.key, why: 'no pageType in content' }); continue; }
    const parentPath = path.posix.dirname(c.target.path), name = path.posix.basename(c.target.path);
    const rec = { key: p.key, path: c.target.path, pageType: c.pageType, state: 'started' };
    journal.pages.push(rec); save();
    try { const it = await createPage({ cm, parentPath, name, pageType: c.pageType, catalog, fields: c.pageFields || {}, confirm, prod: !!flags.prod }); rec.id = it.id; rec.state = 'done'; created.push({ key: p.key, id: it.id, path: it.path }); }
    catch (e) { rec.state = 'failed'; rec.error = e.message; failed.push({ key: p.key, error: e.message }); }
    save();
  }
  journal.finishedAt = new Date().toISOString(); save();
  return emit(ctx, { runId: run.runId, env: run.env, applyId, created, skipped, failed, next: created.length ? `Run: content-ops plan --env ${run.env} --content work/ (the new pages are now update targets), then apply.` : null });
}
