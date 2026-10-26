// `undo --run <id> --apply <applyId> --page <key> --confirm <env> [--prod]`
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';
import { loadRun } from '../plan/run.mjs';
import { assertWritable } from '../apply/guards.mjs';
import { rollbackPage } from '../apply/undo.mjs';

export async function undoCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const usage = 'content-ops undo --run <id> --apply <applyId> --page <key> --confirm <env> [--prod]';
  const run = loadRun(ctx.projectDir, need(flags, 'run', usage));
  const applyId = need(flags, 'apply', usage); const key = need(flags, 'page', usage);
  const cm = ctx.cmFactory(run.env, { allowWrites: true });
  assertWritable(cm, { confirm: flags.confirm === true ? '' : flags.confirm, prod: !!flags.prod });
  const problems = await rollbackPage({ cm, runDir: run.dir, applyId, key });
  return emit(ctx, { runId: run.runId, applyId, key, restored: problems.length === 0, problems });
}
