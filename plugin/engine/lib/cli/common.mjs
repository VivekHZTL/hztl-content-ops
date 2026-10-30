// Shared plumbing for commands: load the project, make a CM for an env, print JSON.
import os from 'node:os';
import path from 'node:path';
import { loadProject, writeJson } from '../config/project.mjs';
import { resolveEnv } from '../client/env.mjs';
import { createClient } from '../client/authoring.mjs';
import { cmFromClient } from '../cm/adapter.mjs';
import { catalogToSite, validateCatalog } from '../catalog/schema.mjs';
import { buildProjectCatalog } from '../catalog/project.mjs';

export function context(deps = {}) {
  const projectDir = path.resolve(deps.projectDir || process.cwd());
  const home = deps.home || os.homedir();
  const cfg = loadProject(projectDir);
  const cmFactory = deps.cmFactory || ((envName, { allowWrites = false, allowPublish = false } = {}) => {
    const env = resolveEnv({ name: envName, project: cfg.project.name, home, repoRoots: [projectDir] });
    return cmFromClient(createClient(env, { allowWrites, allowPublish, fetchImpl: deps.fetchImpl }), { language: cfg.rules.language });
  });
  return { projectDir, home, cfg, cmFactory, deps, print: deps.print !== false };
}

// The catalog is optional: a command that needs one and finds none builds it from Sitecore on the spot (read-only
// on Sitecore, writes .content-ops/catalog.json) and says so in its output. Only without an environment to read
// from does it stop, and then it asks for one instead of sending anyone to set a catalog up first.
export async function ensureCatalog(ctx, env) {
  if (!ctx.cfg.catalog) {
    if (!env || env === true) throw new Error('This step needs to know the site\'s page types and components, and there is no catalog yet. Add --env <name> and it is read from Sitecore automatically.');
    const catalog = await buildProjectCatalog(ctx, env, ctx.deps || {}, { quick: true });
    writeJson(path.join(ctx.cfg.cfgDir, 'catalog.json'), catalog);
    ctx.cfg.catalog = catalog;
    ctx.catalogNote = `No catalog yet, so it was read from ${env} just now (${Object.keys(catalog.pageTypes).length} page types, ${Object.keys(catalog.components).length} components${catalog.source === 'discovered' ? ', from a quick look at existing pages' : ''}) and saved to .content-ops/catalog.json.${catalog.source === 'discovered' ? ` A component no sampled page uses is not in it yet; "catalog refresh --env ${env}" does a full pass.` : ''}`;
  }
  const errors = validateCatalog(ctx.cfg.catalog);
  if (errors.length) throw new Error(`catalog.json is invalid:\n- ${errors.join('\n- ')}`);
  return { catalog: ctx.cfg.catalog, site: catalogToSite(ctx.cfg.catalog) };
}

export function emit(ctx, obj) { if (ctx.catalogNote && obj && typeof obj === 'object' && !Array.isArray(obj)) obj = { catalogBuilt: ctx.catalogNote, ...obj }; if (ctx.print) console.log(JSON.stringify(obj, null, 1)); return obj; }
export const need = (flags, k, usage) => { if (!flags[k] || flags[k] === true) throw new Error(`usage: ${usage}`); return flags[k]; };
