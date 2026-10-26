// `relink --env <e> --sitemap <f> [--content work/]`: re-resolve links left pending (pid without id, or flagged
// link-pending) now that their target pages may exist. Writes files back; everything else untouched.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';
import { loadSitemap, resolveLinks } from '../ingest/sitemap.mjs';
import { writeJson } from '../config/project.mjs';

const isLink = (v) => v && typeof v === 'object' && !Array.isArray(v) && ('url' in v || 'pid' in v);

export async function relinkCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const usage = 'content-ops relink --env <name> --sitemap <file> [--content work/]';
  const env = need(flags, 'env', usage);
  const sitemap = loadSitemap(path.resolve(need(flags, 'sitemap', usage)));
  const cm = ctx.cmFactory(env);
  const dir = path.resolve(ctx.projectDir, flags.content && flags.content !== true ? flags.content : 'work');
  let resolved = 0, stillPending = 0; const files = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !['inventory.json', 'transform-log.json'].includes(x) && !x.includes('.proposed.'))) {
    const file = path.join(dir, f);
    let c; try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (!Array.isArray(c.components)) continue;
    // collect pending link paths
    const pendingPaths = new Set((c.flags || []).filter((x) => x.kind === 'link-pending').map((x) => x.path || Object.entries(c.locators || {}).find(([, loc]) => loc === x.where)?.[0] || x.where));
    const walk = (node, p) => { if (isLink(node)) { if (node.pid && !node.id) pendingPaths.add(p); return; } if (Array.isArray(node)) node.forEach((x, i) => walk(x, `${p}.${i}`)); else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${p}.${k}`); };
    walk(c.components, 'components'); walk(c.pageFields || {}, 'pageFields');
    if (!pendingPaths.size) continue;
    // build a minimal content holding only those links, resolve, then copy results back
    const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
    const set = (o, p, v) => { const ks = p.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = t[k]; t[ks.at(-1)] = v; };
    for (const p of [...pendingPaths]) if (!isLink(get(c, p))) pendingPaths.delete(p); // a flag whose path no longer holds a link
    if (!pendingPaths.size) continue;
    const probe = { components: [{ type: 'x', fields: Object.fromEntries([...pendingPaths].map((p, i) => [`l${i}`, structuredClone(get(c, p))])), children: [] }], flags: [], locators: Object.fromEntries([...pendingPaths].map((p, i) => [`components.0.fields.l${i}`, p])) };
    const out = await resolveLinks(probe, { sitemap, cm, homePath: ctx.cfg.project.homePath, ownHosts: ctx.cfg.project.ownHosts || [] });
    let changed = false;
    [...pendingPaths].forEach((p, i) => {
      const link = out.components[0].fields[`l${i}`];
      if (link.id) { set(c, p, link); resolved++; changed = true; const loc = c.locators?.[p] || p; c.flags = (c.flags || []).filter((x) => !(x.kind === 'link-pending' && (x.path ? x.path === p : x.where === loc))); }
      else stillPending++;
    });
    if (changed) { writeJson(file, c); files.push(path.relative(ctx.projectDir, file)); }
  }
  return emit(ctx, { env, resolved, stillPending, files });
}
