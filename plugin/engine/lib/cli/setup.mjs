// `setup connect --env <e>`: the usual setup - key file, sign in, read the home page, minimal project.json
// (connect.mjs). `setup --answers <file>`: write .content-ops/ from a non-interactive answers file (the skill asks the
// questions). `setup questions` prints the answer schema. `setup join`: a colleague's first run on a repo that
// already has .content-ops/ - make the credentials folder, empty placeholders, and report what is still missing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './args.mjs';
import { validateProject, writeJson, loadProject } from '../config/project.mjs';
import { execFileSync } from 'node:child_process';
import { parseEnvFile, resolveEnv, EnvError } from '../client/env.mjs';
import { ensureKnowledge } from '../knowledge/store.mjs';
import { connectCommand, keyFileTemplate } from './connect.mjs';

export const QUESTIONS = {
  name: 'Short project name, used for ~/.content-ops/<name>/<env>.env (required)',
  siteRoot: 'Sitecore item path of the site root, e.g. /sitecore/content/<Tenant>/<Site> (required)',
  homePath: 'Item path of the Home item (required)',
  language: 'Content language, default en',
  environments: 'List of { name, siteUrl }: name matches the credentials file (dev, qa, prod); siteUrl is the rendering host for live checks (optional). At least one environment is required',
  blueprintRoot: 'Optional. Item path holding one blueprint page per page template; default <homePath>/_blueprints. Without it, page types are learned from existing pages when a task first needs them',
  repoRoot: 'Path to the head app repo, for component code paths (optional)',
  placeholders: '{ hero, main } placeholder paths when the blueprint cannot tell them apart (optional)',
  contacts: 'Who to ask: { dev: "<name>", content: "<name>" } (optional; the skills print these instead of guessing a person)',
};

export async function setupCommand(argv, deps = {}) {
  const { _, flags } = parseArgs(argv);
  const projectDir = path.resolve(deps.projectDir || process.cwd());
  const print = deps.print !== false;
  if (_[0] === 'questions') { if (print) console.log(JSON.stringify(QUESTIONS, null, 1)); return QUESTIONS; }
  if (_[0] === 'connect') return connectCommand(argv.slice(argv.indexOf('connect') + 1), deps);
  if (_[0] === 'join') return joinProject(projectDir, flags, deps, print);
  if (flags['from-env-local']) {
    const src = flags['from-env-local'] === true ? null : path.resolve(flags['from-env-local']);
    const envName = flags.env && flags.env !== true ? String(flags.env) : null;
    if (!src || !envName) throw new Error('usage: content-ops setup --from-env-local <path to .env.local> --env <name> [--force] [--prod]');
    const cfg = loadProject(projectDir);
    if (!cfg.project.environments.some((e) => e.name === envName)) throw new Error(`"${envName}" is not an environment in project.json (${cfg.project.environments.map((e) => e.name).join(', ')})`);
    if (!fs.existsSync(src)) throw new Error(`No file at ${src}`);
    let d = path.dirname(src), git = null; for (;;) { if (fs.existsSync(path.join(d, '.git'))) { git = d; break; } const up = path.dirname(d); if (up === d) break; d = up; }
    if (!git) throw new Error(`${src} is not inside a git working tree; .env.local always is, so this looks like the wrong path`);
    const v = parseEnvFile(src);
    const missing = ['SITECORE_API_HOST', 'SITECORE_CLIENT_ID', 'SITECORE_CLIENT_SECRET'].filter((k) => !v[k]);
    if (missing.length) throw new Error(`${path.basename(src)} is missing ${missing.join(', ')}`);
    const isProd = /prod|prd/i.test(envName) || /prod|prd/i.test(v.SITECORE_API_HOST);
    if (isProd && !flags.prod) throw new Error(`"${envName}" is production. Add --prod only if you mean to give this machine production credentials.`);
    const home = deps.home || os.homedir();
    const target = path.join(home, '.content-ops', cfg.project.name, `${envName}.env`);
    if (fs.existsSync(target) && !flags.force) throw new Error(`${target} already exists; add --force to replace it`);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, `SITECORE_API_HOST=${v.SITECORE_API_HOST}\nSITECORE_CLIENT_ID=${v.SITECORE_CLIENT_ID}\nSITECORE_CLIENT_SECRET=${v.SITECORE_CLIENT_SECRET}\n`, { mode: 0o600 });
    fs.chmodSync(target, 0o600);
    const host = (() => { try { return new URL(/^https?:\/\//i.test(v.SITECORE_API_HOST) ? v.SITECORE_API_HOST : `https://${v.SITECORE_API_HOST}`).host; } catch { return v.SITECORE_API_HOST; } })();
    const out = { wrote: target, host, clientIdPrefix: `${v.SITECORE_CLIENT_ID.slice(0, 4)}…`, isProd, next: [`Run: content-ops check --project ${cfg.project.name} --env ${envName}`] };
    if (print) console.log(JSON.stringify(out, null, 1));
    return out;
  }
  if (!flags.answers || flags.answers === true) throw new Error('usage: content-ops setup --answers <file.json> | content-ops setup questions | content-ops setup --from-env-local <path> --env <name> [--force] [--prod]');
  if (fs.existsSync(path.join(projectDir, '.content-ops', 'project.json')) && !flags.force) throw new Error('This project is already set up (.content-ops/project.json exists). To start using it on this machine run "content-ops setup join". To replace the project config add --force.');
  const answers = JSON.parse(fs.readFileSync(path.resolve(flags.answers), 'utf8'));
  const project = { name: answers.name, siteRoot: answers.siteRoot, homePath: answers.homePath, language: answers.language || 'en', environments: answers.environments, blueprintRoot: answers.blueprintRoot || `${String(answers.homePath || '').replace(/\/$/, '')}/_blueprints`, repoRoot: answers.repoRoot || null, placeholders: answers.placeholders || null, ...(answers.contacts !== undefined ? { contacts: answers.contacts } : {}) };
  const errors = validateProject(project);
  if (errors.length) throw new Error(`Answers are incomplete:\n- ${errors.join('\n- ')}`);
  const cfgDir = path.join(projectDir, '.content-ops');
  writeJson(path.join(cfgDir, 'project.json'), project);
  ensureKnowledge(projectDir); // rule overrides live in knowledge/rules.json with provenance; defaults stay in code
  if (project.language !== 'en') writeJson(path.join(cfgDir, 'knowledge', 'rules.json'), { language: { value: project.language, provenance: 'project', since: new Date().toISOString().slice(0, 10), why: 'setup answer' } });
  if (!fs.existsSync(path.join(cfgDir, 'decisions.json'))) writeJson(path.join(cfgDir, 'decisions.json'), []);
  if (!fs.existsSync(path.join(cfgDir, 'overrides.json'))) writeJson(path.join(cfgDir, 'overrides.json'), {});
  if (!fs.existsSync(path.join(cfgDir, 'sources.json'))) writeJson(path.join(cfgDir, 'sources.json'), { sources: [] });
  for (const d of ['sources', 'work', 'runs']) fs.mkdirSync(path.join(projectDir, d), { recursive: true });
  const home = deps.home || os.homedir();
  const out = {
    wrote: ['.content-ops/project.json', '.content-ops/knowledge/', '.content-ops/decisions.json', '.content-ops/overrides.json', '.content-ops/sources.json'],
    next: [
      `A developer creates ${path.join(home, '.content-ops', project.name, '<env>.env')} for each environment (outside any repo).`,
      `Run: content-ops setup connect --env ${project.environments[0].name}  (signs in and reads the home page)`,
      'Add sources/, work/ and runs/ to .gitignore if they are not already.',
    ],
  };
  if (print) console.log(JSON.stringify(out, null, 1));
  return out;
}

const ENGINE_BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'content-ops.mjs');
const KEYS = ['SITECORE_API_HOST', 'SITECORE_CLIENT_ID', 'SITECORE_CLIENT_SECRET'];
const PROD = /prod|prd/i;
const placeholder = keyFileTemplate;

function envStatus(file, name, project, home) {
  if (!fs.existsSync(file)) return null;
  try { resolveEnv({ name, project, home }); return 'ok'; }
  catch (e) {
    if (!(e instanceof EnvError)) throw e;
    if (e.code === 'incomplete') { const v = parseEnvFile(file); return KEYS.every((k) => !v[k]) ? 'empty' : 'incomplete'; }
    return e.code;
  }
}

function ignored(projectDir, dir) {
  try { execFileSync('git', ['check-ignore', '-q', `${dir}.probe`], { cwd: projectDir, stdio: 'ignore' }); return true; }
  catch (e) { if (e.status === 1) return false; throw e; }
}

function joinProject(projectDir, flags, deps, print) {
  if (!fs.existsSync(path.join(projectDir, '.content-ops', 'project.json'))) throw new Error(`${projectDir} is not set up for content ops yet (no .content-ops/project.json). Pull the latest repo first; if it is still missing, a developer says "set up content ops here" once and commits .content-ops/.`);
  const cfg = loadProject(projectDir);
  const name = cfg.project.name;
  const home = deps.home || os.homedir();
  const dir = path.join(home, '.content-ops', name);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700);
  const environments = cfg.project.environments.map((e) => {
    const file = path.join(dir, `${e.name}.env`);
    const isProd = PROD.test(e.name);
    let status = envStatus(file, e.name, name, home);
    if (!status) {
      if (isProd && !flags.prod) status = 'skipped-production';
      else { fs.writeFileSync(file, placeholder(name, e.name), { mode: 0o600 }); fs.chmodSync(file, 0o600); status = 'placeholder-created'; }
    }
    return { name: e.name, isProd, file, status };
  });
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const c = cfg.catalog;
  const catalog = c ? { pageTypes: Object.keys(c.pageTypes || {}).length, components: Object.keys(c.components || {}).length, generatedAt: c.generatedAt || null } : null;
  let gitignore = null;
  try { const missing = ['sources/', 'work/', 'runs/'].filter((d) => !ignored(projectDir, d)); gitignore = { ok: !missing.length, missing }; } catch { gitignore = null; }
  const next = [];
  if (nodeMajor < 22) next.push(`Node ${process.versions.node} is too old; install Node 22 or newer from nodejs.org, then restart Claude Code.`);
  const fill = environments.filter((e) => ['placeholder-created', 'empty', 'incomplete'].includes(e.status));
  if (fill.length) next.push(`Open ${fill.map((e) => e.file).join(' and ')} in a text editor, paste the three values your developer gives you after the = signs, and save. Developers can instead run: content-ops setup --from-env-local <path to .env.local> --env <name> --force`);
  const skipped = environments.filter((e) => e.status === 'skipped-production');
  if (skipped.length) next.push(`No production file was made. Only people the project lead names get one; a developer runs "content-ops setup join --prod" for them.`);
  if (environments.some((e) => e.status === 'inside-repo')) next.push('A credentials path is inside a git working tree and will be refused. Move it out of the repo.');
  if (gitignore && !gitignore.ok) next.push(`Add ${gitignore.missing.join(', ')} to the repo's .gitignore (a developer commits it); these hold client files, plans and journals.`);
  const first = environments.find((e) => e.status === 'ok') || environments[0];
  next.push(`${first.status === 'ok' ? 'Run' : 'When a file is filled, run'}: content-ops setup connect --env ${first.name}  (signs in and reads the home page)`);
  const out = { project: name, credentialsDir: dir, environments, engine: { path: ENGINE_BIN, node: process.versions.node, nodeOk: nodeMajor >= 22 }, catalog, gitignore, next };
  if (print) console.log(JSON.stringify(out, null, 1));
  return out;
}
