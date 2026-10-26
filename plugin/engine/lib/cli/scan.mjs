// `scan --env <e> [--root <path>]`: read-only subtree snapshot → runs/scans/<ts>_<env>.json
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';
import { scanTenant } from '../snapshot/tenant.mjs';
import { writeJson } from '../config/project.mjs';

export async function scanCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const env = need(flags, 'env', 'content-ops scan --env <name> [--root <item path>]');
  const root = flags.root && flags.root !== true ? flags.root : ctx.cfg.project.siteRoot; // the whole site, so references outside Home are seen
  const cm = ctx.cmFactory(env);
  const { tree, fields } = await scanTenant({ client: cm.client, root, language: ctx.cfg.rules.language });
  const rel = path.join('runs', 'scans', `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${env}.json`);
  writeJson(path.join(ctx.projectDir, rel), { env, root, at: new Date().toISOString(), tree, fields });
  return emit(ctx, { env, root, items: tree.length, file: rel });
}
