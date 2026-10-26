// Read-only snapshot of a whole subtree. Phase 1 walks the tree breadth-first (names, templates,
// paths) with bounded concurrency. Phase 2 reads every item's non-standard, non-empty field values
// in batches of aliased item() queries. Returns data; the caller decides where to save it.
import { normId } from '../cm/ids.mjs';

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

const CH = `query($id:ID,$after:String){ item(where:{itemId:$id}){ children(first:500, after:$after){ pageInfo{hasNextPage endCursor}
  nodes{ itemId name path hasChildren template{ templateId name } } } } }`;
const ROOT_Q = `query($p:String){ item(where:{path:$p}){ itemId name path hasChildren template{templateId name} } }`;
const fieldsQuery = (ids, language) => `query{ ${ids.map((id, k) => `i${k}: item(where:{itemId:"${id}", language:"${language}"}){ itemId version
  fields(ownFields:false, excludeStandardFields:false, first:500){ nodes{ name value containsStandardValue } } }`).join('\n')} }`;

export async function scanTenant({ client, root, language = 'en', concurrency = 12, fieldBatch = 15, fieldConcurrency = 6, onProgress = () => {} }) {
  const r = (await client.query(ROOT_Q, { p: root })).item;
  if (!r) throw new Error(`Root not found: ${root}`);
  const tree = [{ id: normId(r.itemId), name: r.name, path: r.path, parentId: '', templateId: normId(r.template.templateId), templateName: r.template.name }];
  let frontier = r.hasChildren ? [tree[0].id] : [];
  while (frontier.length) {
    const next = [];
    await pool(frontier, concurrency, async (pid) => {
      let after = null;
      do {
        const c = (await client.query(CH, { id: pid, after })).item.children;
        for (const n of c.nodes) {
          tree.push({ id: normId(n.itemId), name: n.name, path: n.path, parentId: pid, templateId: normId(n.template.templateId), templateName: n.template.name });
          if (n.hasChildren) next.push(normId(n.itemId));
        }
        after = c.pageInfo.hasNextPage ? c.pageInfo.endCursor : null;
      } while (after);
    });
    frontier = next;
    onProgress({ phase: 'tree', items: tree.length });
  }
  const fields = {};
  const batches = [];
  for (let i = 0; i < tree.length; i += fieldBatch) batches.push(tree.slice(i, i + fieldBatch).map((t) => t.id));
  let done = 0;
  await pool(batches, fieldConcurrency, async (ids) => {
    const d = await client.query(fieldsQuery(ids, language));
    ids.forEach((id, k) => {
      const it = d[`i${k}`];
      const f = {};
      for (const n of it?.fields?.nodes || []) if (!n.containsStandardValue && n.value) f[n.name] = n.value;
      fields[id] = { version: it?.version ?? 0, f };
    });
    done += ids.length;
    onProgress({ phase: 'fields', items: done, total: tree.length });
  });
  return { tree, fields };
}
