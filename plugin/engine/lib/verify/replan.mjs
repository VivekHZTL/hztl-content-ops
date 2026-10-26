// Post-write verification: re-snapshot every written page and re-plan it from the same content; the
// expected result is 'up-to-date' (no ops). Anything else is a finding, not a success.
import { snapshotPage } from '../snapshot/page.mjs';
import { planPage } from '../plan/page-plan.mjs';

export async function verifyWritten({ cm, run, keys, catalog, rules, contentFor }) {
  const pages = [];
  for (const key of keys) {
    const planned = run.pages.find((p) => p.key === key);
    const content = contentFor(key) || planned?.content;
    if (!planned || !content) { pages.push({ key, status: 'no-content', reasons: ['No content recorded in the run for this page'] }); continue; }
    const snap = await snapshotPage(cm, planned.itemId, { dataFolder: rules.dataFolder });
    const re = planPage({ content, snap, catalog, rules, key });
    pages.push({ key, status: re.status, reasons: re.reasons, creates: re.ops?.creates?.length || 0, updates: re.ops?.updates?.length || 0, layout: !!re.ops?.layout, fieldsOff: (re.diff?.fields || []).map((f) => f.field) });
  }
  return { runId: run.runId, env: run.env, checked: pages.length, upToDate: pages.filter((p) => p.status === 'up-to-date').length, pages };
}
