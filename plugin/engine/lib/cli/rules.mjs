// `rules list` | `rules set <key> <json> --why <text>`: effective rules and where each came from.
import { parseArgs } from './args.mjs';
import { context, emit } from './common.mjs';
import { setRule } from '../knowledge/rules.mjs';

export async function rulesCommand(argv, deps = {}) {
  const { _, flags } = parseArgs(argv);
  const ctx = context(deps);
  if (_[0] === 'list') {
    const src = ctx.cfg.ruleSources;
    // top-level keys always; dotted leaves only when they differ in provenance from their top-level key
    const keys = Object.keys(src).filter((k) => !k.includes('.') || src[k].provenance !== (src[k.split('.')[0]]?.provenance ?? 'default'));
    const get = (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), ctx.cfg.rules);
    return emit(ctx, { rules: keys.sort().map((key) => ({ key, value: get(key), ...src[key] })) });
  }
  if (_[0] === 'set' && _[1] && _[2] !== undefined) {
    if (!flags.why || flags.why === true) throw new Error('rules set needs --why <text>: say why this project differs');
    let value; try { value = JSON.parse(_[2]); } catch { throw new Error(`The value must be JSON, e.g. '["COPY TK"]' or 24; got: ${_[2]}`); }
    return emit(ctx, setRule(ctx.projectDir, _[1], value, { why: flags.why }));
  }
  throw new Error('usage: content-ops rules list | rules set <key> <json> --why <text>');
}
