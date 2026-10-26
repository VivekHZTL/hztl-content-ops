// Read-only snapshot of one page and its local datasource tree, plus a fingerprint that ignores
// volatile system fields so a dry run can detect any content change before a write.
import crypto from 'node:crypto';

/** System fields that change on every save and must not affect the fingerprint; the two layout fields do count. */
export const VOLATILE = /^__(?!Renderings$|Final Renderings$)/;

async function tree(cm, id) {
  const it = await cm.getItem({ id });
  if (!it) return null;
  const kids = await Promise.all(it.children.map((c) => tree(cm, c.id))); // order kept
  return { ...it, children: kids.filter(Boolean) };
}

export async function snapshotPage(cm, pageId, { dataFolder = 'Data' } = {}) {
  const page = await cm.getItem({ id: pageId });
  if (!page) throw new Error(`Page ${pageId} not found`);
  const dataRef = page.children.find((c) => c.name === dataFolder);
  const data = dataRef ? await tree(cm, dataRef.id) : null;
  return { takenAt: new Date().toISOString(), env: cm.env, page, data };
}

export function fingerprint(snap) {
  const pick = (it) => it && ({ id: it.id, name: it.name, f: Object.fromEntries(Object.entries(it.fields).filter(([k]) => !VOLATILE.test(k)).map(([k, v]) => [k, v.value])), c: (it.children || []).map(pick) });
  const page = { ...pick({ ...snap.page, children: [] }), kids: snap.page.children.map((c) => c.name) };
  return crypto.createHash('sha256').update(JSON.stringify({ page, data: pick(snap.data) })).digest('hex').slice(0, 16);
}
