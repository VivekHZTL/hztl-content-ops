// Map rendering names to component source files in the head app, so the catalog can point at code.
import fs from 'node:fs';
import path from 'node:path';

export function scanRepoComponents(repoRoot, { dirs = ['src/components'] } = {}) {
  const out = {};
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      if (!/\.tsx$/.test(e.name) || /\.(stories|test|spec)\.tsx$/.test(e.name)) continue;
      out[e.name.replace(/\.tsx$/, '')] ||= path.relative(repoRoot, f).split(path.sep).join('/');
    }
  };
  for (const d of dirs) walk(path.join(repoRoot, d));
  return out;
}

export function attachCodePaths(catalog, map) {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  for (const c of Object.values(catalog.components || {})) c.codePath = lower[String(c.name || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase()] ?? null;
  return catalog;
}
