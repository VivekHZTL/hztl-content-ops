// `plan --env <name> --content <file|dir> [--pages a,b]`: read-only dry run → runs/<id>/
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need, requireCatalog } from './common.mjs';
import { snapshotPage } from '../snapshot/page.mjs';
import { planPage } from '../plan/page-plan.mjs';
import { newRunDir, writeRun } from '../plan/run.mjs';
import { listSources } from '../sources/manifest.mjs';

export function loadContent(target) {
  const p = path.resolve(target);
  const files = fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(p, f)) : [p];
  return files.map((f) => ({ file: f, content: JSON.parse(fs.readFileSync(f, 'utf8')) }));
}

export async function planCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const env = need(flags, 'env', 'content-ops plan --env <name> --content <file|dir> [--pages a,b]');
  const target = need(flags, 'content', 'content-ops plan --env <name> --content <file|dir> [--pages a,b]');
  const { catalog } = requireCatalog(ctx.cfg);
  const cm = ctx.cmFactory(env);
  const only = flags.pages && flags.pages !== true ? new Set(String(flags.pages).split(',')) : null;
  const registered = new Map(listSources(ctx.projectDir).map((s) => [s.file, s]));
  const pages = [];
  const sources = new Map();
  for (const { file, content } of loadContent(path.resolve(ctx.projectDir, target))) {
    const key = content.pageId || path.basename(file, '.json');
    if (only && !only.has(key)) continue;
    for (const s of content.sources || []) sources.set(s.file, { file: s.file, sha256: s.sha256 ?? registered.get(s.file)?.sha256 ?? null });
    const page = content.target?.path ? await cm.getItem({ path: content.target.path }) : null;
    if (!page) { pages.push({ key, pageId: content.pageId, path: content.target?.path, status: 'no-match', reasons: [`No item at ${content.target?.path || '(no target.path)'}`], pending: [], ops: null, sources: content.sources || [] }); continue; }
    const snap = await snapshotPage(cm, page.id, { dataFolder: ctx.cfg.rules.dataFolder });
    pages.push(planPage({ content, snap, catalog, rules: ctx.cfg.rules, key }));
  }
  const seen = new Map(); for (const pg of pages) seen.set(pg.key, (seen.get(pg.key) || 0) + 1);
  for (const pg of pages) if (seen.get(pg.key) > 1 && pg.status !== 'no-match') { pg.status = 'needs-review'; pg.reasons = [...(pg.reasons || []), `Duplicate page key "${pg.key}" in the content set`]; pg.ops = null; }
  const { runId, dir } = newRunDir(ctx.projectDir, env);
  const summary = writeRun(dir, { runId, env, project: ctx.cfg.project.name, createdAt: new Date().toISOString(), host: cm.host, isProd: !!cm.isProd, pages, sources: [...sources.values()] });
  return emit(ctx, { ...summary, dir });
}
