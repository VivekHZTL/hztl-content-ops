// `decide --scope s --decision d --reason r --who w [--enforced-by x]` | `decide list`
import { parseArgs } from './args.mjs';
import { context, emit } from './common.mjs';
import { addDecision, listDecisions } from '../decisions/register.mjs';

export async function decideCommand(argv, deps = {}) {
  const { _, flags } = parseArgs(argv);
  const ctx = context(deps);
  if (_[0] === 'list') return emit(ctx, { decisions: listDecisions(ctx.projectDir) });
  const need = ['scope', 'decision', 'reason', 'who'].filter((k) => !flags[k] || flags[k] === true);
  if (need.length) throw new Error(`usage: content-ops decide --scope <s> --decision <d> --reason <r> --who <w> [--enforced-by <x>] | content-ops decide list (missing: ${need.join(', ')})`);
  return emit(ctx, addDecision(ctx.projectDir, { scope: flags.scope, decision: flags.decision, reason: flags.reason, who: flags.who, enforcedBy: flags['enforced-by'] && flags['enforced-by'] !== true ? flags['enforced-by'] : null }));
}
