// `catalog build --env <e>` (full overwrite) | `catalog refresh --env <e>` (diff; never deletes) |
// `catalog verify <key>` (dev confirms a status) | `catalog show` (page types and components with status).
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';
import { buildCatalog } from '../catalog/build.mjs';
import { scanRepoComponents, attachCodePaths } from '../catalog/repo.mjs';
import { validateCatalog } from '../catalog/schema.mjs';
import { diffCatalog, verifyComponent } from '../catalog/diff.mjs';
import { pickRepresentativePages } from '../catalog/discover.mjs';
import { scanTenant } from '../snapshot/tenant.mjs';
import { writeJson } from '../config/project.mjs';

const USAGE = 'content-ops catalog build --env <name> | catalog refresh --env <name> | catalog verify <componentKey> | catalog show';

async function fresh(ctx, env, deps) {
  const cm = ctx.cmFactory(env);
  const hints = ctx.cfg.project.placeholders?.hero ? { hero: new RegExp(ctx.cfg.project.placeholders.hero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) } : undefined;
  const build = deps.buildCatalogImpl || buildCatalog;
  const opts = { cm, language: ctx.cfg.rules.language, ...(hints ? { placeholderHints: hints } : {}) };
  let discovered = null;
  const hasBlueprints = deps.buildCatalogImpl ? true : !!(await cm.getItem({ path: ctx.cfg.project.blueprintRoot }));
  if (!hasBlueprints) {
    // no blueprint folder: pick one representative page per template from the site itself
    const scan = await (deps.scanImpl || scanTenant)({ client: cm.client, root: ctx.cfg.project.homePath, language: ctx.cfg.rules.language });
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
const file = (ctx) => path.join(ctx.cfg.cfgDir, 'catalog.json');
const counts = (catalog) => ({ pageTypes: Object.keys(catalog.pageTypes), components: Object.keys(catalog.components).length, placeholders: catalog.placeholders });

export async function catalogCommand(argv, deps = {}) {
  const { _, flags } = parseArgs(argv);
  const ctx = context(deps);
  if (_[0] === 'build') {
    const catalog = await fresh(ctx, need(flags, 'env', USAGE), deps);
    const errors = validateCatalog(catalog);
    writeJson(file(ctx), catalog);
    return emit(ctx, { file: '.content-ops/catalog.json', ...counts(catalog), errors, source: catalog.source, discovered: catalog.discovered || [], note: catalog.discovered ? `No blueprint folder at ${ctx.cfg.project.blueprintRoot}; the catalog was built from ${catalog.discovered.length} existing page(s), one per template, each the page using the most components. Components no page uses yet are not in it; run catalog refresh after the site grows, or add a blueprint folder.` : null });
  }
  if (_[0] === 'refresh') {
    const next = await fresh(ctx, need(flags, 'env', USAGE), deps);
    const { catalog, summary } = diffCatalog(ctx.cfg.catalog, next);
    const errors = validateCatalog(catalog);
    writeJson(file(ctx), catalog);
    return emit(ctx, { file: '.content-ops/catalog.json', ...counts(catalog), summary, errors, next: summary.added.length || summary.changed.length || summary.missing.length ? 'A developer reviews each added, changed or missing component and runs: content-ops catalog verify <key>' : null });
  }
  if (_[0] === 'verify' && _[1]) {
    if (!ctx.cfg.catalog) throw new Error('No .content-ops/catalog.json yet');
    const { catalog, action } = verifyComponent(ctx.cfg.catalog, _[1]);
    writeJson(file(ctx), catalog);
    return emit(ctx, { component: _[1], action });
  }
  if (_[0] === 'show') {
    if (!ctx.cfg.catalog) throw new Error('No .content-ops/catalog.json yet');
    const c = ctx.cfg.catalog;
    return emit(ctx, {
      generatedAt: c.generatedAt, env: c.env,
      pageTypes: Object.entries(c.pageTypes).map(([key, p]) => ({ key, name: p.name, status: p.status || 'ok', layout: p.layout, fields: (p.fields || []).map((f) => f.name) })),
      components: Object.entries(c.components).map(([key, x]) => ({ key, name: x.name, status: x.status || 'ok', ph: x.ph, parent: x.parent, children: x.children, themed: !!x.themed, fields: (x.fields || []).map((f) => `${f.name} (${f.type}${f.changedTo ? ` → ${f.changedTo}` : ''})`), missingSince: x.missingSince || null })),
    });
  }
  throw new Error(`usage: ${USAGE}`);
}
