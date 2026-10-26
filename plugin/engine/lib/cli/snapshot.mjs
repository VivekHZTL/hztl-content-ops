// `snapshot --env <e> --path <item path> [--out file]`: read-only page + Data snapshot for review. Prints a
// summary (page, template, Data item count, components in layout order) and the file it wrote under runs/snapshots/.
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';
import { snapshotPage } from '../snapshot/page.mjs';
import { parseLayout, describe } from '../layout/layout.mjs';
import { catalogToSite } from '../catalog/schema.mjs';
import { writeJson } from '../config/project.mjs';

export async function snapshotCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const usage = 'content-ops snapshot --env <name> --path <item path> [--out file]';
  const env = need(flags, 'env', usage); const itemPath = need(flags, 'path', usage);
  const cm = ctx.cmFactory(env);
  const page = await cm.getItem({ path: itemPath });
  if (!page) throw new Error(`No item at ${itemPath} on ${env}`);
  const snap = await snapshotPage(cm, page.id, { dataFolder: ctx.cfg.rules.dataFolder });
  const count = (n) => (n ? 1 + (n.children || []).reduce((a, c) => a + count(c), 0) : 0);
  let components = [];
  if (ctx.cfg.catalog) { const site = catalogToSite(ctx.cfg.catalog); components = describe(parseLayout(page.fields['__Final Renderings']?.value || '', site).entries, site); }
  const rel = flags.out && flags.out !== true ? String(flags.out) : path.join('runs', 'snapshots', `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${env}_${page.name}.json`);
  writeJson(path.join(ctx.projectDir, rel), snap);
  return emit(ctx, { env, file: rel, page: { id: page.id, name: page.name, path: page.path, template: page.templateName }, dataItems: snap.data ? count(snap.data) - 1 : 0, components });
}
