// Create a page shell the way an author's Insert menu does: from the page type's branch when one is
// known, else from its template. Waits for the item to appear; never sends a second job (PR 327 learning).
import { assertWritable } from './guards.mjs';

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function createPage({ cm, parentPath, name, pageType, catalog, fields = {}, confirm, prod = false, waitMs = 120000, pollMs = 2000, sleep = wait }) {
  assertWritable(cm, { confirm, prod });
  const def = catalog.pageTypes?.[pageType];
  if (!def) throw new Error(`Unknown page type "${pageType}"`);
  const parent = await cm.getItem({ path: parentPath });
  if (!parent) throw new Error(`Parent not found: ${parentPath}`);
  if (parent.children.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error(`${parentPath} already has a child named "${name}"; refusing to create a second one`);
  const fieldList = Object.entries(fields).map(([n, value]) => ({ name: n, value: String(value) }));
  const path = `${parentPath.replace(/\/$/, '')}/${name}`;
  if (def.branchId) {
    await cm.createItemFromBranch({ parentId: parent.id, name, branchId: def.branchId, fields: fieldList });
    const deadline = Date.now() + waitMs;
    for (;;) {
      const it = await cm.getItem({ path });
      if (it) return it;
      if (Date.now() > deadline) throw new Error(`${path} did not appear within ${waitMs / 1000}s after the branch job; do not send a second job, check the CM`);
      await sleep(pollMs);
    }
  }
  if (!def.templateId) throw new Error(`Page type "${pageType}" has neither branchId nor templateId`);
  const id = await cm.createItem({ parentId: parent.id, name, templateId: def.templateId, fields: fieldList });
  return cm.getItem({ id });
}
