// `op list | op show <name> | op new <name> --description <text> [--when <text>] | op plan <name> --env <e> [--args <json>|--args-file <f>]`
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';
import { listOperations, findOperation, planOperation } from '../ops/run.mjs';
import { writeJson } from '../config/project.mjs';

const USAGE = 'content-ops op list | op show <name> | op new <name> --description <text> [--when <text>] | op plan <name> --env <name> [--args <json> | --args-file <file>]';

const BUILD_TEMPLATE = (name) => `// Operation "${name}". build(ctx) is READ-ONLY: it reads Sitecore and sources and returns change sets.
// The engine plans them (before-state, staleness), and only \`content-ops apply\` writes, with a journal and undo.
// ctx: { env, args, project, catalog, site, rules, cm (getItem, query), readSource(rel), log(msg), helpers }
// A change set: { key, title, itemId?, path?, reasons?: [], ops: [ { op: 'create'|'update'|'rename'|'move'|'copy'|'delete', ... } ] }
export default async function build(ctx) {
  const changeSets = [];
  // 1. Find the items this operation is about (ctx.cm.getItem({ path }) / ({ id })).
  // 2. Decide what should change; skip items already right.
  // 3. Push one change set per independent unit (usually one page or one item).
  return { changeSets, notes: [] };
}
`;
const README_TEMPLATE = (name, description, when) => `# ${name}

${description}

## When to use

${when || 'Describe the ask that led to this operation.'}

## Inputs (args)

| Arg | Meaning |
|---|---|

## Worked example

\`\`\`bash
content-ops op plan ${name} --env dev --args '{}'
\`\`\`

## What it learned

- (pitfalls found while building or running it)
`;

export async function opCommand(argv, deps = {}) {
  const { _, flags } = parseArgs(argv);
  const ctx = context(deps);
  const sub = _[0];
  if (sub === 'list') return emit(ctx, { operations: listOperations(ctx.projectDir) });
  if (sub === 'show') {
    const op = findOperation(ctx.projectDir, _[1]);
    const readme = path.join(op.dir, 'README.md');
    return emit(ctx, { ...op, readme: fs.existsSync(readme) ? fs.readFileSync(readme, 'utf8') : null });
  }
  if (sub === 'new') {
    const name = _[1];
    if (!name) throw new Error(`usage: ${USAGE}`);
    const description = need(flags, 'description', USAGE);
    const dir = path.join(ctx.projectDir, '.content-ops', 'operations', name);
    try { findOperation(ctx.projectDir, name); throw Object.assign(new Error(`Operation "${name}" already exists; extend it instead of starting another`), { exists: true }); } catch (e) { if (e.exists) throw e; if (!/^No operation/.test(e.message)) throw e; }
    fs.mkdirSync(dir, { recursive: true });
    writeJson(path.join(dir, 'operation.json'), { name, description, when: flags.when && flags.when !== true ? flags.when : '', inputs: {}, version: 1, provenance: { project: ctx.cfg.project.name, created: new Date().toISOString().slice(0, 10) } });
    fs.writeFileSync(path.join(dir, 'build.mjs'), BUILD_TEMPLATE(name));
    fs.writeFileSync(path.join(dir, 'README.md'), README_TEMPLATE(name, description, flags.when && flags.when !== true ? flags.when : ''));
    return emit(ctx, { created: path.relative(ctx.projectDir, dir), files: ['operation.json', 'build.mjs', 'README.md'] });
  }
  if (sub === 'plan') {
    const name = _[1];
    if (!name) throw new Error(`usage: ${USAGE}`);
    const env = need(flags, 'env', USAGE);
    let args = {};
    if (flags['args-file'] && flags['args-file'] !== true) args = JSON.parse(fs.readFileSync(path.resolve(ctx.projectDir, flags['args-file']), 'utf8'));
    else if (flags.args && flags.args !== true) args = JSON.parse(flags.args);
    const cm = ctx.cmFactory(env);
    const out = await planOperation({ ctx, name, env, args, cm });
    return emit(ctx, { runId: out.runId, operation: name, env, counts: out.counts, needsReview: out.needsReview, notes: out.notes, next: out.counts.ready ? [`content-ops show --run ${out.runId}`, `content-ops apply --run ${out.runId} --confirm ${env}${cm.isProd ? ' --prod' : ''}`] : ['Nothing ready to write.'] });
  }
  throw new Error(`usage: ${USAGE}`);
}
