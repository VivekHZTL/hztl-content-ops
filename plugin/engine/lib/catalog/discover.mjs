// Blueprints are optional. Given a tenant scan (tree + fields), pick one representative page per page
// template: the page whose Final Renderings uses the most distinct renderings. The catalog built from
// these may miss components no page uses yet; `catalog refresh` picks them up as pages grow.
const RID = /\ss:id="([^"]+)"/g;

export function pickRepresentativePages({ tree, fields }) {
  const byTemplate = new Map();
  for (const it of tree) {
    const xml = fields[it.id]?.f?.['__Final Renderings'];
    if (!xml) continue; // not a page with its own layout
    const ids = new Set([...xml.matchAll(RID)].map((m) => m[1].toLowerCase()));
    const cur = byTemplate.get(it.templateName) || { templateName: it.templateName, templateId: it.templateId, pageId: it.id, path: it.path, components: -1, pages: 0 };
    cur.pages += 1;
    if (ids.size > cur.components) { cur.components = ids.size; cur.pageId = it.id; cur.path = it.path; cur.templateId = it.templateId; }
    byTemplate.set(it.templateName, cur);
  }
  return [...byTemplate.values()].sort((a, b) => a.templateName.localeCompare(b.templateName));
}

// A quick, bounded look at the site for when a task needs the catalog right now: breadth-first from Home, only the
// first 100 children of each item (siblings mostly share a template), never into Data folders, and only each item's
// Final Renderings. Stops at maxItems or maxMs. Same { tree, fields } shape as scanTenant, so pickRepresentativePages
// takes either. A full `catalog build` or `catalog refresh` still walks everything.
const QCH = `query($id:ID,$l:String!){ item(where:{itemId:$id, language:$l}){ children(first:100){
  nodes{ itemId name path hasChildren template{ templateId name } fr: field(name:"__Final Renderings"){ value } } } } }`;
const QROOT = `query($p:String,$l:String!){ item(where:{path:$p, language:$l}){ itemId name path hasChildren template{ templateId name } fr: field(name:"__Final Renderings"){ value } } }`;
const nid = (s) => String(s || '').replace(/[{}-]/g, '').toLowerCase();

export async function quickScan({ client, root, language = 'en', maxItems = 1500, maxMs = 90_000, concurrency = 8, now = Date.now }) {
  const started = now();
  const r = (await client.query(QROOT, { p: root, l: language }))?.item;
  if (!r) throw new Error(`Root not found: ${root}`);
  const tree = []; const fields = {};
  const add = (n, parentId) => { const id = nid(n.itemId); tree.push({ id, name: n.name, path: n.path, parentId, templateId: nid(n.template?.templateId), templateName: n.template?.name }); fields[id] = { f: n.fr?.value ? { '__Final Renderings': n.fr.value } : {} }; return id; };
  let frontier = r.hasChildren ? [add(r, '')] : (add(r, ''), []);
  let complete = true;
  while (frontier.length) {
    if (tree.length >= maxItems || now() - started > maxMs) { complete = false; break; }
    const next = []; let i = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (i < frontier.length && tree.length < maxItems && now() - started <= maxMs) {
        const pid = frontier[i++];
        const nodes = (await client.query(QCH, { id: pid, l: language }))?.item?.children?.nodes || [];
        for (const n of nodes) { const id = add(n, pid); if (n.hasChildren && !/^data$/i.test(n.name)) next.push(id); }
      }
    }));
    frontier = next;
  }
  return { tree, fields, complete };
}
