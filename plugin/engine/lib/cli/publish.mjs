// `publish --run <id> [--apply <applyId>] --confirm <env> [--prod] [--dry] [--with-subitems]`
// Roots come only from apply journals with status done: the page, items the run created, items it updated.
// Change-set runs add renamed, moved and copied items and the parent of a deleted item.
// Every root must be under the site root; one outside refuses the whole publish before any call.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';
import { loadRun } from '../plan/run.mjs';
import { publishItems } from '../publish/publish.mjs';
import { writeJson } from '../config/project.mjs';

export async function publishCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const usage = 'content-ops publish --run <id> [--apply <applyId>] --confirm <env> [--prod] [--dry] [--with-subitems]';
  const run = loadRun(ctx.projectDir, need(flags, 'run', usage));
  const confirm = flags.confirm === true ? '' : flags.confirm;
  if (!confirm) throw new Error(`Publishing needs --confirm ${run.env}. ${usage}`);
  if (confirm !== run.env) throw new Error(`--confirm "${confirm}" does not match the run's environment "${run.env}"`);
  const jdir = path.join(run.dir, 'journal');
  const files = fs.existsSync(jdir) ? fs.readdirSync(jdir).filter((f) => f.endsWith('.json') && (!flags.apply || flags.apply === true || f.startsWith(`${flags.apply}_`))) : [];
  const ids = new Map(); let skippedUndone = 0;
  for (const f of files) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(jdir, f), 'utf8')); } catch { continue; }
    if (j.status !== 'done' || j.env !== run.env) continue;
    if (j.manualRollback) { skippedUndone++; continue; }
    if (j.itemId) ids.set(j.itemId, { id: j.itemId, from: `${f} page` });
    for (const s of j.steps || []) {
      if ((s.op === 'create' || s.op === 'copy') && s.id) ids.set(s.id, { id: s.id, from: `${f} ${s.op === 'copy' ? 'copied' : 'created'} ${s.name}` });
      if (['update', 'rename', 'move'].includes(s.op) && s.id) ids.set(s.id, ids.get(s.id) || { id: s.id, from: `${f} ${s.op}d` });
      if (s.op === 'delete' && s.parentId) ids.set(s.parentId, ids.get(s.parentId) || { id: s.parentId, from: `${f} parent of deleted ${s.name}` });
    }
  }
  if (!ids.size) throw new Error(`No done journals${flags.apply ? ` for apply ${flags.apply}` : ''} under ${jdir}`);
  const cm = ctx.cmFactory(run.env, flags.dry ? {} : { allowWrites: true, allowPublish: true });
  const home = ctx.cfg.project.siteRoot.replace(/\/$/, '').toLowerCase();
  const roots = [];
  for (const r of ids.values()) { const it = await cm.getItem({ id: r.id }); roots.push({ id: r.id, path: it?.path || null, from: r.from }); }
  const missing = roots.filter((r) => !r.path);
  if (missing.length) throw new Error(`Refusing to publish: ${missing.length} root(s) not found on ${run.env} (deleted or undone?): ${missing.map((r) => `${r.id} (${r.from})`).join(', ')}`);
  const outside = roots.filter((r) => !(r.path.toLowerCase() + '/').startsWith(home + '/'));
  if (outside.length) throw new Error(`Refusing to publish: ${outside.length} root(s) outside the site root ${ctx.cfg.project.siteRoot}: ${outside.map((r) => r.path).join(', ')}`);
  if (flags.dry) return emit(ctx, { runId: run.runId, env: run.env, dry: true, roots, skippedUndone });
  let log;
  try { log = await publishItems({ client: cm.client, items: roots, scope: (i) => (i.path.toLowerCase() + '/').startsWith(home + '/'), confirm, prod: !!flags.prod, subItems: !!flags['with-subitems'], languages: [ctx.cfg.rules.language] }); }
  catch (e) { if (e.log) writeJson(path.join(run.dir, `publish-${e.log.startedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`), { ...e.log, roots, error: e.message }); throw e; }
  const file = path.join(run.dir, `publish-${log.startedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`);
  writeJson(file, { ...log, roots, skippedUndone });
  return emit(ctx, { runId: run.runId, env: run.env, roots: roots.length, skippedUndone, ops: log.ops.length, failed: log.ops.filter((o) => o.status?.isFailed).length, log: path.relative(ctx.projectDir, file) });
}
