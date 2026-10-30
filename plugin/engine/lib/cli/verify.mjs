// `verify --run <id> [--apply <applyId>]`: re-plan written pages from fresh snapshots; expect up-to-date.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need, ensureCatalog } from './common.mjs';
import { loadRun } from '../plan/run.mjs';
import { verifyWritten } from '../verify/replan.mjs';
import { verifyChangeSet } from '../items/apply.mjs';
import { normId } from '../cm/ids.mjs';

export async function verifyCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const run = loadRun(ctx.projectDir, need(flags, 'run', 'content-ops verify --run <id> [--apply <applyId>]'));
  const files = fs.readdirSync(run.dir).filter((f) => /^results-.*\.json$/.test(f) && (!flags.apply || flags.apply === true || f === `results-${flags.apply}.json`)).sort();
  if (!files.length) throw new Error(`No results in ${run.dir}${flags.apply ? ` for apply ${flags.apply}` : ''}`);
  // the re-check is saved next to the latest apply it covers, for the run report's Re-check tab
  const latest = JSON.parse(fs.readFileSync(path.join(run.dir, files[files.length - 1]), 'utf8')).applyId;
  const save = (o) => { fs.writeFileSync(path.join(run.dir, `verify-${latest}.json`), JSON.stringify({ ...o, checkedAt: new Date().toISOString() }, null, 1)); return o; };
  const done = new Set(); const created = {};
  for (const f of files) for (const r of JSON.parse(fs.readFileSync(path.join(run.dir, f), 'utf8')).results) if (r.status === 'done') { done.add(r.key); created[r.key] = r.created || {}; }
  const cm = ctx.cmFactory(run.env);
  if (run.kind === 'items') {
    const sets = [];
    for (const key of done) {
      const cs = run.changeSets.find((c) => c.key === key);
      const bad = await verifyChangeSet(cm, cs, { ...(cs.itemId ? { page: normId(cs.itemId) } : {}), ...(cs.bound || {}), ...created[key] });
      sets.push({ key, status: bad.length ? 'differs' : 'up-to-date', reasons: bad });
    }
    return emit(ctx, save({ runId: run.runId, env: run.env, checked: sets.length, upToDate: sets.filter((s) => s.status === 'up-to-date').length, pages: sets }));
  }
  const { catalog } = await ensureCatalog(ctx, run.env);
  const out0 = await verifyWritten({ cm, run, keys: [...done], catalog, rules: ctx.cfg.rules, contentFor: (key) => run.pages.find((p) => p.key === key)?.content });
  return emit(ctx, save(out0));
}
