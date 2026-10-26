// Writes many pages with a fixed number in flight. Each page goes through applyPage exactly as
// alone (re-read + stale check, journal, write, read back, auto-rollback). Pages are independent:
// each writes only its own item and its own Data folder.
//
// One failure counter is shared by all workers. When it reaches maxFailures no new page is
// started; pages already in flight finish (and roll back on their own errors). Pages never
// started are returned as notStarted.
import { applyPage } from './page.mjs';
import { assertWritable } from './guards.mjs';

export async function applyMany({ cm, plans, runDir, applyId, site, confirm, prod = false, autoRollback = true, dataFolder = 'Data', concurrency = 4, maxFailures = 3, onResult = () => {}, applyFn = applyPage }) {
  assertWritable(cm, { confirm, prod });
  const results = [];
  const started = new Set();
  let next = 0, failures = 0, active = 0, maxActive = 0, stoppedEarly = null;
  async function worker() {
    for (;;) {
      if (stoppedEarly || next >= plans.length) return;
      const plan = plans[next++];
      started.add(plan.key);
      active++; maxActive = Math.max(maxActive, active);
      let r;
      try { r = await applyFn({ cm, plan, runDir, applyId, site, confirm, prod, autoRollback, dataFolder }); }
      catch (e) { r = { key: plan.key, itemId: plan.itemId, title: plan.title, status: 'failed', error: e.message }; }
      active--;
      results.push(r);
      if (!['done', 'skipped'].includes(r.status) && ++failures >= maxFailures && !stoppedEarly) stoppedEarly = `Stopped after ${failures} failures; pages in flight were allowed to finish`;
      onResult(r, results.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, plans.length)) }, worker));
  const notStarted = plans.filter((p) => !started.has(p.key)).map((p) => ({ key: p.key, itemId: p.itemId, title: p.title }));
  return { results, stoppedEarly, notStarted, maxActive };
}
