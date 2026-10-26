// `sources register <file> [--note] [--by]`, `sources list`, `sources verify`
import { parseArgs } from './args.mjs';
import { context, emit } from './common.mjs';
import { registerSource, listSources, verifySources } from '../sources/manifest.mjs';

export async function sourcesCommand(argv, deps = {}) {
  const { _, flags } = parseArgs(argv);
  const ctx = context(deps);
  const sub = _[0];
  if (sub === 'register') { if (!_[1]) throw new Error('usage: content-ops sources register <file> [--note text] [--by name]'); return emit(ctx, registerSource({ projectDir: ctx.projectDir, file: _[1], note: flags.note === true ? '' : flags.note || '', by: flags.by === true ? '' : flags.by || '' })); }
  if (sub === 'list') return emit(ctx, { sources: listSources(ctx.projectDir) });
  if (sub === 'verify') return emit(ctx, { sources: verifySources(ctx.projectDir) });
  throw new Error('usage: content-ops sources register <file> | list | verify');
}
