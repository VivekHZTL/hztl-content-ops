// `history --env <e> [--page <key>]`: every page written on an environment, from apply journals, oldest first.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';

export async function historyCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const env = need(flags, 'env', 'content-ops history --env <name> [--page <key>]');
  const runsDir = path.join(ctx.projectDir, 'runs');
  const entries = [];
  for (const d of fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : []) {
    const jdir = path.join(runsDir, d, 'journal'); if (!fs.existsSync(jdir)) continue;
    for (const f of fs.readdirSync(jdir)) {
      if (!f.endsWith('.json') || f.startsWith('create-')) continue;
      let j; try { j = JSON.parse(fs.readFileSync(path.join(jdir, f), 'utf8')); } catch { continue; }
      if (j.env !== env || !j.status) continue;
      if (flags.page && flags.page !== true && j.key !== flags.page) continue;
      entries.push({ key: j.key, itemId: j.itemId, env: j.env, runId: d, applyId: j.applyId, status: j.status, finishedAt: j.finishedAt || j.startedAt || null, manualRollback: !!j.manualRollback });
    }
  }
  entries.sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)));
  return emit(ctx, { env, entries });
}
