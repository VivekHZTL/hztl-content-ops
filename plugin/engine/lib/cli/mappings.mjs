// `mappings list` | `mappings forget <fingerprint>`: the confirmed sheet shapes this project remembers.
import { parseArgs } from './args.mjs';
import { context, emit } from './common.mjs';
import { listMappings, forgetMapping } from '../knowledge/mappings.mjs';

export async function mappingsCommand(argv, deps = {}) {
  const { _ } = parseArgs(argv);
  const ctx = context(deps);
  if (_[0] === 'list') return emit(ctx, { mappings: listMappings(ctx.projectDir).map((m) => ({ fingerprint: m.fingerprint, kind: m.kind || 'sheet', tab: m.tab, sourceFile: m.sourceFile, confirmedAt: m.confirmedAt, provenance: m.provenance, columns: Object.values(m.profile?.columns || {}).filter((c) => c.target && c.target !== 'ignore').length, headers: m.headers })) });
  if (_[0] === 'forget' && _[1]) return emit(ctx, { fingerprint: _[1], forgotten: forgetMapping(ctx.projectDir, _[1]) });
  throw new Error('usage: content-ops mappings list | mappings forget <fingerprint>');
}
