// Shared plumbing for commands: load the project, make a CM for an env, print JSON.
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../config/project.mjs';
import { resolveEnv } from '../client/env.mjs';
import { createClient } from '../client/authoring.mjs';
import { cmFromClient } from '../cm/adapter.mjs';
import { catalogToSite, validateCatalog } from '../catalog/schema.mjs';

export function context(deps = {}) {
  const projectDir = path.resolve(deps.projectDir || process.cwd());
  const home = deps.home || os.homedir();
  const cfg = loadProject(projectDir);
  const cmFactory = deps.cmFactory || ((envName, { allowWrites = false, allowPublish = false } = {}) => {
    const env = resolveEnv({ name: envName, project: cfg.project.name, home, repoRoots: [projectDir] });
    return cmFromClient(createClient(env, { allowWrites, allowPublish, fetchImpl: deps.fetchImpl }), { language: cfg.rules.language });
  });
  return { projectDir, home, cfg, cmFactory, print: deps.print !== false };
}

export function requireCatalog(cfg) {
  if (!cfg.catalog) throw new Error('No .content-ops/catalog.json. Run "content-ops catalog build --env <name>" first.');
  const errors = validateCatalog(cfg.catalog);
  if (errors.length) throw new Error(`catalog.json is invalid:\n- ${errors.join('\n- ')}`);
  return { catalog: cfg.catalog, site: catalogToSite(cfg.catalog) };
}

export function emit(ctx, obj) { if (ctx.print) console.log(JSON.stringify(obj, null, 1)); return obj; }
export const need = (flags, k, usage) => { if (!flags[k] || flags[k] === true) throw new Error(`usage: ${usage}`); return flags[k]; };
