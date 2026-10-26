// Thin adapter over the Authoring GraphQL client. Plan/apply code only talks to this interface,
// so tests swap in the in-memory fake (lib/cm/fake.mjs).
//
// Item shape returned by getItem:
//   { id, name, path, templateId, templateName, parentId, version,
//     fields: { name: { value, std } },   // std = the value comes from standard values
//     children: [{ id, name, templateName }] }
import { normId, braced } from './ids.mjs';

const ITEM_Q = `query($id:ID,$path:String,$after:String,$language:String!){ item(where:{itemId:$id,path:$path,language:$language}){
  itemId name path version parent{itemId} template{templateId name}
  fields(ownFields:false, excludeStandardFields:false, first:500){ nodes{ name value containsStandardValue } }
  children(first:500, after:$after){ pageInfo{hasNextPage endCursor} nodes{ itemId name template{name} } } } }`;

export function cmFromClient(client, { language = 'en' } = {}) {
  async function getItem({ id, path }) {
    const d = await client.query(ITEM_Q, { id: id ? normId(id) : null, path: path || null, language });
    const it = d?.item;
    if (!it) return null;
    const children = [...it.children.nodes];
    let page = it.children.pageInfo;
    while (page.hasNextPage) {
      const more = (await client.query(ITEM_Q, { id: normId(it.itemId), after: page.endCursor, language })).item.children;
      children.push(...more.nodes); page = more.pageInfo;
    }
    return {
      id: normId(it.itemId), name: it.name, path: it.path, version: it.version,
      templateId: normId(it.template.templateId), templateName: it.template.name, parentId: normId(it.parent?.itemId),
      fields: Object.fromEntries(it.fields.nodes.map((f) => [f.name, { value: f.value ?? '', std: !!f.containsStandardValue }])),
      children: children.map((c) => ({ id: normId(c.itemId), name: c.name, templateName: c.template.name })),
    };
  }
  return {
    env: client.env, host: client.host, isProd: client.isProd, writable: client.writable, language, client,
    getItem,
    async createItem({ parentId, name, templateId, fields = [] }) {
      const d = await client.mutate(`mutation($i:CreateItemInput!){ createItem(input:$i){ item{ itemId name } } }`,
        { i: { parent: normId(parentId), name, templateId: braced(templateId), language, fields } });
      return normId(d.createItem.item.itemId);
    },
    async updateItem({ id, fields }) {
      // fields: [{ name, value }] or [{ name, reset: true }]
      await client.mutate(`mutation($i:UpdateItemInput!){ updateItem(input:$i){ item{ itemId } } }`, { i: { itemId: normId(id), language, fields } });
    },
    async createItemFromBranch({ parentId, name, branchId, fields = [] }) {
      // Returns a job, not the item: the caller waits for the item to appear and never sends a second job.
      const d = await client.mutate(`mutation($i:CreateItemFromBranchInput!){ createItemFromBranch(input:$i){ job{ name done status{ jobState exceptions } } } }`,
        { i: { branchId: braced(branchId), name, parent: normId(parentId), language, fields } });
      const job = d.createItemFromBranch?.job;
      if (job?.status?.exceptions?.length) throw new Error(`createItemFromBranch job ${job.name}: ${job.status.exceptions.join('; ')}`);
      return { jobName: job?.name || null };
    },
    async renameItem({ id, newName }) {
      await client.mutate(`mutation($i:RenameItemInput!){ renameItem(input:$i){ item{ itemId name } } }`, { i: { itemId: normId(id), newName } });
    },
    async restoreArchivedItem({ id }) {
      // Restore from the recycle bin (the inverse of deleteItem with permanently:false). The API restores by the
      // recycle-bin entry's archivalId, not the item id, so look it up first (newest entries come first).
      const want = normId(id); let archivalId = null;
      for (let page = 0; page < 200 && !archivalId; page++) {
        const list = (await client.query(`query($page:Int){ archivedItems(archiveName:"recyclebin", pageIndex:$page, pageSize:100){ archivalId itemId } }`, { page }))?.archivedItems || [];
        archivalId = list.find((a) => normId(a.itemId) === want)?.archivalId || null;
        if (list.length < 100) break;
      }
      if (!archivalId) throw new Error(`Item ${id} is not in the recycle bin (already restored, or emptied)`);
      const d = await client.mutate(`mutation($i:RestoreArchivedItemInput!){ restoreArchivedItem(input:$i){ successful } }`, { i: { archivalId, archiveName: 'recyclebin' } });
      if (d?.restoreArchivedItem?.successful === false) throw new Error(`Restore of ${id} was refused by Sitecore`);
    },
    async moveItem({ id, toParentId, sortOrder }) {
      const i = { itemId: normId(id), targetParentId: normId(toParentId) };
      if (sortOrder != null) i.sortOrder = sortOrder;
      await client.mutate(`mutation($i:MoveItemInput!){ moveItem(input:$i){ item{ itemId } } }`, { i });
    },
    async copyItem({ id, toParentId, name, deep = true }) {
      const d = await client.mutate(`mutation($i:CopyItemInput!){ copyItem(input:$i){ item{ itemId } } }`,
        { i: { itemId: normId(id), targetParentId: normId(toParentId), copyItemName: name, deepCopy: !!deep } });
      return normId(d.copyItem.item.itemId);
    },
    async deleteItem({ id }) {
      // Recycle bin, never permanent.
      await client.mutate(`mutation($i:DeleteItemInput!){ deleteItem(input:$i){ successful } }`, { i: { itemId: normId(id), permanently: false } });
    },
  };
}
