// `apply --run <id> --confirm <env> [--prod] [--pages a,b] [--concurrency n] [--max-failures n]`
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need, requireCatalog } from './common.mjs';
import { loadRun, assertRunFresh } from '../plan/run.mjs';
import { verifySources } from '../sources/manifest.mjs';
import { applyMany } from '../apply/many.mjs';
import { applyChangeSet } from '../items/apply.mjs';
import { writeJson } from '../config/project.mjs';

export async function applyCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const usage = 'content-ops apply --run <id> --confirm <env> [--prod] [--pages a,b] [--concurrency n]';
  const run = loadRun(ctx.projectDir, need(flags, 'run', usage));
  const confirm = flags.confirm === true ? '' : flags.confirm;
  if (!confirm) throw new Error(`Writes need --confirm ${run.env}. ${usage}`);
  if (confirm !== run.env) throw new Error(`--confirm "${confirm}" does not match the run's environment "${run.env}"`);
  assertRunFresh(run, { maxAgeHours: ctx.cfg.rules.planMaxAgeHours, sources: verifySources(ctx.projectDir) });
  const items = run.kind === 'items';
  const { site } = items ? { site: null } : requireCatalog(ctx.cfg);
  const cm = ctx.cmFactory(run.env, { allowWrites: true });
  const only = flags.pages && flags.pages !== true ? new Set(String(flags.pages).split(',')) : null;
  const plans = (items ? run.changeSets : run.pages).filter((p) => p.status === 'ready' && (!only || only.has(p.key) || only.has(p.pageId)));
  const applyId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = await applyMany({ cm, plans, runDir: run.dir, applyId, site, confirm, prod: !!flags.prod, dataFolder: ctx.cfg.rules.dataFolder, concurrency: Math.max(1, parseInt(flags.concurrency, 10) || 4), maxFailures: Math.max(1, parseInt(flags['max-failures'], 10) || 3), ...(items ? { applyFn: applyChangeSet } : {}) });
  const counts = {};
  for (const r of out.results) counts[r.status] = (counts[r.status] || 0) + 1;
  const results = { applyId, runId: run.runId, env: run.env, startedAt: applyId, results: out.results, notStarted: out.notStarted, stoppedEarly: out.stoppedEarly, counts };
  writeJson(path.join(run.dir, `results-${applyId}.json`), results);
  return emit(ctx, { applyId, runId: run.runId, env: run.env, selected: plans.length, counts, stoppedEarly: out.stoppedEarly, notStarted: out.notStarted.length, failures: out.results.filter((r) => !['done', 'skipped'].includes(r.status)).map((r) => ({ key: r.key, status: r.status, error: r.error })) });
}
