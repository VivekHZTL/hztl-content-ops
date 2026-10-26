// Tiny argv parser: positionals in `_`, `--k v` and `--flag` in `flags`.
export function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v !== undefined && !v.startsWith('--')) { out.flags[k] = v; i++; } else out.flags[k] = true; }
    else out._.push(a);
  }
  return out;
}
