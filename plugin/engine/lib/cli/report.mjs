// `report --run <id> [--apply <id>]` → runs/<id>/report.html (+ run-report-<applyId>.html per results file)
// `report --combined --env <e>` → runs/combined-<env>.html. Re-rendered from saved files only.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { context, emit } from './common.mjs';
import { loadRun } from '../plan/run.mjs';
import { renderDryRun, renderRun, renderCombined } from '../report/render.mjs';

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const resultsIn = (dir, applyId) => fs.readdirSync(dir).filter((f) => /^results-.*\.json$/.test(f) && (!applyId || f === `results-${applyId}.json`)).sort().map((f) => { const r = readJson(path.join(dir, f)); const v = path.join(dir, `verify-${r.applyId}.json`); if (fs.existsSync(v)) r.recheck = readJson(v); return r; });

export async function reportCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const files = [];
  if (flags.combined) {
    const env = flags.env && flags.env !== true ? flags.env : null;
    if (!env) throw new Error('usage: content-ops report --combined --env <name>');
    const runsDir = path.join(ctx.projectDir, 'runs');
    const entries = [];
    for (const d of fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : []) {
      const pf = path.join(runsDir, d, 'plan.json'); if (!fs.existsSync(pf)) continue;
      const run = readJson(pf); if (run.env !== env) continue;
      const results = resultsIn(path.join(runsDir, d)); if (!results.length) continue;
      const undone = new Set(); const jdir = path.join(runsDir, d, 'journal');
      for (const jf of fs.existsSync(jdir) ? fs.readdirSync(jdir) : []) { try { const j = readJson(path.join(jdir, jf)); if (j.manualRollback) undone.add(`${j.applyId}|${j.key}`); } catch {} }
      entries.push({ run, results, undone });
    }
    const out = path.join(runsDir, `combined-${env}.html`);
    fs.mkdirSync(runsDir, { recursive: true }); fs.writeFileSync(out, renderCombined(entries));
    files.push(path.relative(ctx.projectDir, out));
    return emit(ctx, { env, runs: entries.length, files });
  }
  if (!flags.run || flags.run === true) throw new Error('usage: content-ops report --run <id> [--apply <id>] | content-ops report --combined --env <name>');
  const run = loadRun(ctx.projectDir, flags.run);
  const dry = path.join(run.dir, 'report.html'); fs.writeFileSync(dry, renderDryRun(run)); files.push(path.relative(ctx.projectDir, dry));
  for (const res of resultsIn(run.dir, flags.apply && flags.apply !== true ? flags.apply : null)) { const f = path.join(run.dir, `run-report-${res.applyId}.html`); fs.writeFileSync(f, renderRun(run, res)); files.push(path.relative(ctx.projectDir, f)); }
  return emit(ctx, { runId: run.runId, env: run.env, files });
}
