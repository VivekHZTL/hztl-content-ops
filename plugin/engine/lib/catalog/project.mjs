// Build the catalog for a project from Sitecore: from the blueprint folder when there is one, otherwise from one
// real page per template. Used by `catalog build|refresh` and, on the fly, by any command that needs a catalog.
import path from 'node:path';
import { buildCatalog } from './build.mjs';
import { scanRepoComponents, attachCodePaths } from './repo.mjs';
import { pickRepresentativePages, quickScan } from './discover.mjs';
import { scanTenant } from '../snapshot/tenant.mjs';

export async function buildProjectCatalog(ctx, env, deps = {}, { quick = false } = {}) {
  const cm = ctx.cmFactory(env);
  const hints = ctx.cfg.project.placeholders?.hero ? { hero: new RegExp(ctx.cfg.project.placeholders.hero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) } : undefined;
  const build = deps.buildCatalogImpl || buildCatalog;
  const opts = { cm, language: ctx.cfg.rules.language, ...(hints ? { placeholderHints: hints } : {}) };
  let discovered = null;
  const hasBlueprints = deps.buildCatalogImpl ? true : !!(await cm.getItem({ path: ctx.cfg.project.blueprintRoot }));
  if (!hasBlueprints) {
    // no blueprint folder: pick one representative page per template from the site itself
    const scan = await (deps.scanImpl || (quick ? quickScan : scanTenant))({ client: cm.client, root: ctx.cfg.project.homePath, language: ctx.cfg.rules.language });
    discovered = pickRepresentativePages(scan);
    if (!discovered.length) throw new Error(`No pages with a layout found under ${ctx.cfg.project.homePath}, and no blueprint folder at ${ctx.cfg.project.blueprintRoot}`);
  }
  const catalog = await build(discovered ? { ...opts, pageIds: discovered.map((d) => d.pageId) } : { ...opts, blueprintRoot: ctx.cfg.project.blueprintRoot });
  catalog.source = discovered ? 'discovered' : 'blueprints';
  if (discovered) catalog.discovered = discovered;
  if (ctx.cfg.project.placeholders?.main) catalog.placeholders.main = ctx.cfg.project.placeholders.main;
  if (ctx.cfg.project.placeholders?.hero) catalog.placeholders.hero = ctx.cfg.project.placeholders.hero;
  if (ctx.cfg.project.repoRoot) attachCodePaths(catalog, scanRepoComponents(path.resolve(ctx.projectDir, ctx.cfg.project.repoRoot)));
  return catalog;
}
