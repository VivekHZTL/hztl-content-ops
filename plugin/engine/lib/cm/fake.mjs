// In-memory stand-in for the item adapter (lib/cm/adapter.mjs). Seeded from a page snapshot so
// tests exercise the same shapes the CM returns. Ships in lib/ so plugin tests can use it too.
import crypto from 'node:crypto';
import { normId } from './ids.mjs';

export function fakeCm({ items = {}, failOn = null, env = 'fake', language = 'en' } = {}) {
  const db = structuredClone(items); // id → { id, name, path, templateId, templateName, parentId, version, fields }
  const log = [];
  const recycleBin = new Map();
  const childrenOf = (id) => Object.values(db).filter((x) => x.parentId === id).map((x) => ({ id: x.id, name: x.name, templateName: x.templateName }));
  const maybeFail = (op, arg) => { if (failOn && failOn(op, arg, db)) throw new Error(`Injected failure on ${op}`); };
  return {
    env, host: 'fake.local', isProd: false, writable: true, language, db, log,
    async getItem({ id, path }) {
      const it = id ? db[normId(id)] : Object.values(db).find((x) => x.path === path);
      return it ? structuredClone({ ...it, children: childrenOf(it.id) }) : null;
    },
    async createItem({ parentId, name, templateId, fields = [] }) {
      maybeFail('create', { parentId, name });
      const id = crypto.randomUUID().replace(/-/g, '');
      const parent = db[normId(parentId)];
      if (!parent) throw new Error(`Parent ${parentId} not found`);
      db[id] = { id, name, path: `${parent.path}/${name}`, templateId: normId(templateId), templateName: 'created', parentId: parent.id, version: 1, fields: Object.fromEntries(fields.map((f) => [f.name, { value: f.value, std: false }])) };
      log.push(['create', id, name]);
      return id;
    },
    async updateItem({ id, fields }) {
      maybeFail('update', { id, fields });
      const it = db[normId(id)];
      if (!it) throw new Error(`Item ${id} not found`);
      for (const f of fields) it.fields[f.name] = f.reset ? { value: '', std: true } : { value: f.value, std: false };
      log.push(['update', normId(id), fields.map((f) => f.name)]);
    },
    async createItemFromBranch({ parentId, name, branchId, fields = [] }) {
      maybeFail('createFromBranch', { parentId, name });
      const parent = db[normId(parentId)];
      if (!parent) throw new Error(`Parent ${parentId} not found`);
      log.push(['createFromBranch', parent.id, name]);
      // the item appears one tick later, like a job
      setTimeout(() => { const id = crypto.randomUUID().replace(/-/g, ''); db[id] = { id, name, path: `${parent.path}/${name}`, templateId: 'branch-' + normId(branchId), templateName: 'from branch', parentId: parent.id, version: 1, fields: Object.fromEntries(fields.map((x) => [x.name, { value: x.value, std: false }])) }; }, 0);
      return { jobName: 'job-1' };
    },
    async restoreArchivedItem({ id }) {
      const root = recycleBin.get(normId(id)); if (!root) throw new Error(`Not in the recycle bin: ${id}`);
      const restore = (x) => { db[x.id] = x; recycleBin.delete(x.id); for (const c of [...recycleBin.values()].filter((v) => v.parentId === x.id)) restore(c); };
      restore(root); log.push(['restore', normId(id)]);
    },
    async renameItem({ id, newName }) {
      maybeFail('rename', { id, newName });
      const it = db[normId(id)]; it.name = newName; it.path = it.path.replace(/[^/]+$/, newName);
      log.push(['rename', normId(id), newName]);
    },
    async moveItem({ id, toParentId }) {
      maybeFail('move', { id, toParentId });
      const it = db[normId(id)]; const to = db[normId(toParentId)];
      if (!it || !to) throw new Error(`Item or target not found: ${id} → ${toParentId}`);
      const repath = (x, base) => { x.path = `${base}/${x.name}`; for (const c of childrenOf(x.id)) repath(db[c.id], x.path); };
      it.parentId = to.id; repath(it, to.path);
      log.push(['move', it.id, to.id]);
    },
    async copyItem({ id, toParentId, name, deep = true }) {
      maybeFail('copy', { id, toParentId, name });
      const src = db[normId(id)]; const to = db[normId(toParentId)];
      if (!src || !to) throw new Error(`Item or target not found: ${id} → ${toParentId}`);
      const clone = (x, parent, nm) => {
        const nid = crypto.randomUUID().replace(/-/g, '');
        db[nid] = { ...structuredClone(x), id: nid, name: nm, path: `${parent.path}/${nm}`, parentId: parent.id };
        if (deep) for (const c of childrenOf(x.id).filter((c) => c.id !== nid)) clone(db[c.id], db[nid], c.name);
        return nid;
      };
      const nid = clone(src, to, name);
      log.push(['copy', src.id, nid]);
      return nid;
    },
    async deleteItem({ id }) {
      maybeFail('delete', { id });
      const kill = (x) => { for (const c of childrenOf(x)) kill(c.id); recycleBin.set(x, db[x]); delete db[x]; };
      kill(normId(id));
      log.push(['delete', normId(id)]);
    },
  };
}

/** Flatten a page snapshot ({ page, data }) into fake-cm items. */
export function itemsFromSnapshot(snap) {
  const items = {};
  const addTree = (n, parentId) => {
    items[n.id] = { id: n.id, name: n.name, path: n.path, templateId: n.templateId, templateName: n.templateName, parentId: parentId ?? n.parentId, version: 1, fields: n.fields };
    for (const c of n.children || []) addTree(c, n.id);
  };
  const { children, ...page } = snap.page;
  items[page.id] = { ...page };
  if (snap.data) addTree(snap.data, page.id);
  return items;
}
