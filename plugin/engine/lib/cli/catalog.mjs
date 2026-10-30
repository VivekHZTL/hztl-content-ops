// `catalog build --env <e>` (full overwrite) | `catalog refresh --env <e>` (diff; never deletes) |
// `catalog verify <key>` (dev confirms a status) | `catalog show` (page types and components with status).
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need, ensureCatalog } from './common.mjs';
import { validateCatalog } from '../catalog/schema.mjs';
import { diffCatalog, verifyComponent } from '../catalog/diff.mjs';
import { buildProjectCatalog as fresh } from '../catalog/project.mjs';
import { writeJson } from '../config/project.mjs';

const USAGE = 'content-ops catalog build --env <name> | catalog refresh --env <name> | catalog verify <componentKey> | catalog show';

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
    const { catalog: c } = await ensureCatalog(ctx, flags.env); // first ask builds it from that environment
    return emit(ctx, {
      generatedAt: c.generatedAt, env: c.env,
      pageTypes: Object.entries(c.pageTypes).map(([key, p]) => ({ key, name: p.name, status: p.status || 'ok', layout: p.layout, fields: (p.fields || []).map((f) => f.name) })),
      components: Object.entries(c.components).map(([key, x]) => ({ key, name: x.name, status: x.status || 'ok', ph: x.ph, parent: x.parent, children: x.children, themed: !!x.themed, fields: (x.fields || []).map((f) => `${f.name} (${f.type}${f.changedTo ? ` → ${f.changedTo}` : ''})`), missingSince: x.missingSince || null })),
    });
  }
  throw new Error(`usage: ${USAGE}`);
}
