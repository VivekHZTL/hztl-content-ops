// `refs --scan <file> --targets <paths or ids, csv>`: who points at these items, from a saved scan.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';
import { buildRefIndex } from '../refs/index.mjs';
import { normId } from '../cm/ids.mjs';

export function resolveTargets(scan, targets) {
  const byPath = new Map(scan.tree.map((t) => [t.path.toLowerCase(), t]));
  return targets.map((t) => (/^\{?[0-9a-f-]{32,}\}?$/i.test(t) ? scan.tree.find((x) => x.id === normId(t)) : byPath.get(t.toLowerCase())) || null).map((it, i) => ({ target: targets[i], item: it }));
}
const subtreeOf = (scan, id) => { const kids = new Map(); for (const t of scan.tree) (kids.get(t.parentId) || kids.set(t.parentId, []).get(t.parentId)).push(t); const out = []; const walk = (x) => { out.push(x); for (const c of kids.get(x) || []) walk(c.id); }; walk(id); return out; };

export async function refsCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const usage = 'content-ops refs --scan <file> --targets <item path|id>[,...]';
  const scan = JSON.parse(fs.readFileSync(path.resolve(ctx.projectDir, need(flags, 'scan', usage)), 'utf8'));
  const list = resolveTargets(scan, String(need(flags, 'targets', usage)).split(',').map((s) => s.trim()).filter(Boolean));
  const byId = new Map(scan.tree.map((t) => [t.id, t]));
  const out = [];
  for (const { target, item } of list) {
    if (!item) { out.push({ target, found: false }); continue; }
    const subtree = new Set(subtreeOf(scan, item.id));
    const { refs } = buildRefIndex({ tree: scan.tree, fields: scan.fields, targets: subtree, homePath: ctx.cfg.project.homePath });
    const external = refs.filter((r) => !subtree.has(r.from)).map((r) => ({ from: byId.get(r.from)?.path || r.from, field: r.field, how: r.how, to: byId.get(r.target)?.path || r.target }));
    out.push({ target, found: true, path: item.path, id: item.id, subtree: subtree.size, internal: refs.length - external.length, external });
  }
  return emit(ctx, { scan: flags.scan, targets: out });
}
