// Alternate themes down the main content, keeping any pinned component on its theme and
// minimising equal neighbours. units: [{ fixed?: 'ThemesWhite' }]. Returns one theme per unit.
export function solveThemes(units, { alternate }) {
  const opts = alternate;
  const n = units.length; const memo = new Map();
  const dp = (i, prev) => {
    const k = i + '|' + prev; if (memo.has(k)) return memo.get(k);
    if (i === n) return { cost: 0, dev: 0, pick: [] };
    const u = units[i]; const choices = u.fixed !== undefined ? [u.fixed] : opts;
    const varIdx = units.slice(0, i).filter((x) => x.fixed === undefined).length;
    let b = null;
    for (const c of choices) {
      const r = dp(i + 1, c ?? prev);
      const cand = { cost: (c && prev && c === prev ? 1 : 0) + r.cost, dev: (u.fixed === undefined && c !== opts[varIdx % opts.length] ? 1 : 0) + r.dev, pick: [c, ...r.pick] };
      if (!b || cand.cost < b.cost || (cand.cost === b.cost && cand.dev < b.dev)) b = cand;
    }
    memo.set(k, b); return b;
  };
  return dp(0, null).pick;
}
