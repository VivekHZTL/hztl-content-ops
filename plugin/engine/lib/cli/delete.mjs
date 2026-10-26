// `delete plan --scan <file> --paths a,b` | `delete apply --plan <file> --confirm <env> [--prod]` | `delete undo --journal <file> --confirm <env> [--prod]`
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';
import { planDelete, applyDelete, undoDelete } from '../apply/delete.mjs';
import { writeJson } from '../config/project.mjs';

export async function deleteCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const _ = [argv[0]]; // the subcommand must come first, so the write-confirm hook can see `delete apply`
  const ctx = context(deps);
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const read = (f) => JSON.parse(fs.readFileSync(path.resolve(ctx.projectDir, f), 'utf8'));
  if (_[0] === 'plan') {
    const scan = read(need(flags, 'scan', 'content-ops delete plan --scan <file> --paths a,b'));
    const plan = planDelete({ scan, targets: String(need(flags, 'paths', 'content-ops delete plan --scan <file> --paths a,b')).split(',').map((s) => s.trim()).filter(Boolean), homePath: ctx.cfg.project.homePath, siteRoot: ctx.cfg.project.siteRoot });
    const rel = path.join('runs', 'deletes', `plan-${stamp()}_${plan.env}.json`);
    writeJson(path.join(ctx.projectDir, rel), plan);
    return emit(ctx, { file: rel, env: plan.env, deletable: plan.deletable.map((d) => ({ path: d.path, subtree: d.subtree })), blocked: plan.blocked.map((b) => ({ path: b.path, externalRefs: b.externalRefs })) });
  }
  if (_[0] === 'apply') {
    const plan = read(need(flags, 'plan', 'content-ops delete apply --plan <file> --confirm <env> [--prod]'));
    const confirm = flags.confirm === true ? '' : flags.confirm;
    if (!confirm) throw new Error(`Deletes need --confirm ${plan.env}`);
    const cm = ctx.cmFactory(plan.env, { allowWrites: true });
    const journalFile = path.join(ctx.projectDir, 'runs', 'deletes', `journal-${stamp()}_${plan.env}.json`);
    const out = await applyDelete({ cm, plan, journalFile, confirm, prod: !!flags.prod, maxAgeHours: ctx.cfg.rules.planMaxAgeHours, limit: flags.limit && flags.limit !== true ? Math.max(1, parseInt(flags.limit, 10) || 1) : null });
    return emit(ctx, { ...out, journal: path.relative(ctx.projectDir, journalFile), note: 'Items are in the recycle bin. A publish of the parent is still needed for Edge to drop them.' });
  }
  if (_[0] === 'undo') {
    const journal = read(need(flags, 'journal', 'content-ops delete undo --journal <file> --confirm <env> [--prod]'));
    const confirm = flags.confirm === true ? '' : flags.confirm;
    const cm = ctx.cmFactory(journal.env, { allowWrites: true });
    const out = await undoDelete({ cm, journal, confirm, prod: !!flags.prod });
    writeJson(path.resolve(ctx.projectDir, flags.journal), journal);
    return emit(ctx, out);
  }
  throw new Error('usage: content-ops delete plan --scan <file> --paths a,b | delete apply --plan <file> --confirm <env> [--prod] [--limit n] | delete undo --journal <file> --confirm <env> [--prod]');
}
