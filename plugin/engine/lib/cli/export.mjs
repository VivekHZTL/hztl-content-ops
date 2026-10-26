// `export --env <e> --paths a,b [--out work/]`: existing pages → content JSON (read-only).
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need, requireCatalog } from './common.mjs';
import { snapshotPage } from '../snapshot/page.mjs';
import { exportPage } from '../ingest/sitecore.mjs';
import { writeJson } from '../config/project.mjs';

export async function exportCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const usage = 'content-ops export --env <name> --paths <item path>[,<item path>] [--out work/]';
  const env = need(flags, 'env', usage);
  const paths = String(need(flags, 'paths', usage)).split(',').map((p) => p.trim()).filter(Boolean);
  const { catalog } = requireCatalog(ctx.cfg);
  const cm = ctx.cmFactory(env);
  const outDir = path.resolve(ctx.projectDir, flags.out && flags.out !== true ? flags.out : 'work');
  const written = [], notes = [], missing = [];
  for (const p of paths) {
    const page = await cm.getItem({ path: p });
    if (!page) { missing.push(p); continue; }
    const snap = await snapshotPage(cm, page.id, { dataFolder: ctx.cfg.rules.dataFolder });
    const content = exportPage({ snap, catalog, rules: ctx.cfg.rules });
    const file = path.join(outDir, `${page.name.replace(/[^A-Za-z0-9._-]+/g, '-')}.json`);
    writeJson(file, content); written.push(path.relative(ctx.projectDir, file));
    for (const n of content.notes) notes.push({ page: page.name, ...n });
  }
  return emit(ctx, { env, written, notes, missing });
}
