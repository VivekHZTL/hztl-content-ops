#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', '..', '.claude-plugin', 'plugin.json'), 'utf8'));
const [cmd, ...rest] = process.argv.slice(2);

const run = (mod, fn) => async () => { const m = await import(mod); return m[fn](rest, { print: true }); };
const commands = {
  '--version': () => console.log(pkg.version),
  check: async () => { const { checkCommand } = await import('../lib/cli/check.mjs'); return checkCommand(rest, { print: true }); },
  setup: run('../lib/cli/setup.mjs', 'setupCommand'),
  catalog: run('../lib/cli/catalog.mjs', 'catalogCommand'),
  sources: run('../lib/cli/sources.mjs', 'sourcesCommand'),
  plan: run('../lib/cli/plan.mjs', 'planCommand'),
  show: run('../lib/cli/show.mjs', 'showCommand'),
  apply: run('../lib/cli/apply.mjs', 'applyCommand'),
  verify: run('../lib/cli/verify.mjs', 'verifyCommand'),
  undo: run('../lib/cli/undo.mjs', 'undoCommand'),
  publish: run('../lib/cli/publish.mjs', 'publishCommand'),
  create: run('../lib/cli/create.mjs', 'createCommand'),
  intake: run('../lib/cli/intake.mjs', 'intakeCommand'),
  mappings: run('../lib/cli/mappings.mjs', 'mappingsCommand'),
  template: run('../lib/cli/template.mjs', 'templateCommand'),
  rules: run('../lib/cli/rules.mjs', 'rulesCommand'),
  lessons: run('../lib/cli/lessons.mjs', 'lessonsCommand'),
  decide: run('../lib/cli/decide.mjs', 'decideCommand'),
  'live-check': run('../lib/cli/live-check.mjs', 'liveCheckCommand'),
  snapshot: run('../lib/cli/snapshot.mjs', 'snapshotCommand'),
  report: run('../lib/cli/report.mjs', 'reportCommand'),
  history: run('../lib/cli/history.mjs', 'historyCommand'),
  export: run('../lib/cli/export.mjs', 'exportCommand'),
  transform: run('../lib/cli/transform.mjs', 'transformCommand'),
  relink: run('../lib/cli/relink.mjs', 'relinkCommand'),
  scan: run('../lib/cli/scan.mjs', 'scanCommand'),
  refs: run('../lib/cli/refs.mjs', 'refsCommand'),
  delete: run('../lib/cli/delete.mjs', 'deleteCommand'),
  op: run('../lib/cli/op.mjs', 'opCommand'),
};

if (!cmd || !commands[cmd]) {
  console.error(`usage: content-ops <command>\n  --version\n  check --project <name> --env <name> [--offline]\n  setup --answers <file> [--force] | setup questions | setup join [--prod] | setup --from-env-local <path> --env <name> [--force] [--prod]\n  catalog build --env <name> | catalog refresh --env <name> | catalog verify <key> | catalog show\n  sources register <file> [--note t] | list | verify\n  plan --env <name> --content <file|dir> [--pages a,b]\n  show --run <id> [--status a,b] [--page key] [--pending]\n  apply --run <id> --confirm <env> [--prod] [--pages a,b]\n  verify --run <id> [--apply <id>]\n  undo --run <id> --apply <id> --page <key> --confirm <env> [--prod]\n  publish --run <id> [--apply <id>] --confirm <env> [--prod] [--dry]\n  create --run <id> --confirm <env> [--prod]\n  intake [--sources dir] [--parent-path p] [--page-type k] [--profile f] [--section-map f] [--sitemap f] [--env e] [--out dir]\n  mappings list | mappings forget <fingerprint>\n  template --page-type <key> [--components a,b] [--children n] [--format xlsx|csv] [--out file]\n  rules list | rules set <key> <json> --why <text>\n  lessons add --area a --title t --body b [--applies this|all] | lessons list [--last n] | lessons check [--accept] | lessons export\n  decide --scope s --decision d --reason r --who w | decide list\n  live-check --env <name> --paths /a,/b [--expect text]\n  snapshot --env <name> --path <item path> [--out file]\n  report --run <id> [--apply <id>] | report --combined --env <name>\n  history --env <name> [--page key]\n  export --env <name> --paths a,b [--out work/]\n  transform --rules <file> [--content work/]\n  relink --env <name> --sitemap <file> [--content work/]\n  scan --env <name> [--root path]\n  refs --scan <file> --targets a,b\n  op list | op show <name> | op new <name> --description t | op plan <name> --env <name> [--args json]\n  delete plan --scan f --paths a,b | delete apply --plan f --confirm e [--prod] | delete undo --journal f --confirm e [--prod]`);
  process.exit(cmd ? 2 : 0);
}
try { await commands[cmd](); } catch (e) { console.error(e.message); process.exit(1); }
