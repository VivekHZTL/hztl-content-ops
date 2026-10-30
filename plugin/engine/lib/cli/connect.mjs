// `setup connect --env <name> [--project <name>] [--site <name>] [--prod]`: the whole setup for someone who only has
// credentials. Finds or makes the key file, signs in, lists the sites, reads the site's home page, and writes the
// smallest .content-ops/project.json that lets every other command run. Read-only on Sitecore. No catalog, no
// blueprints, no repo needed; those are built later, only when a task asks for them. Prints JSON, never a secret.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { writeJson } from '../config/project.mjs';
import { resolveEnv, describeEnv, EnvError } from '../client/env.mjs';
import { createClient } from '../client/authoring.mjs';

const KEYS = ['SITECORE_API_HOST', 'SITECORE_CLIENT_ID', 'SITECORE_CLIENT_SECRET'];
const PROD = /prod|prd/i;
const SHARED = /^shared$/i;

export const keyFileTemplate = (project, env) => `# Content Ops key file: project "${project}", environment "${env}".
# Fill the values after the = signs, save, then tell Claude "check the connection".
# Get them from the project's developer or the Sitecore Cloud Portal (an automation client for this environment).
# Never paste them into Claude chat.
#
# Required: the CM host (e.g. https://xmc-....sitecorecloud.io), then the automation client id and secret.
${KEYS.map((k) => `${k}=`).join('\n')}
#
# Optional: the Experience Edge context id, for checking published content on Edge.
SITECORE_EDGE_CONTEXT_ID=
`;

export const openCommand = (file, platform = process.platform) =>
  platform === 'win32' ? `notepad "${file}"` : platform === 'darwin' ? `open -e "${file}"` : `"\${EDITOR:-nano}" "${file}"`;

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const sameDir = (a, b) => path.relative(path.resolve(a), path.resolve(b)) === '';
const within = (child, root) => { const rel = path.relative(path.resolve(root), path.resolve(child)); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };

// Which project folder under ~/.content-ops holds a key file for this environment, when only one does.
function guessProject(home, env) {
  const root = path.join(home, '.content-ops');
  if (!fs.existsSync(root)) return { candidates: [] };
  const candidates = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())
    .map((d) => d.name).filter((n) => fs.existsSync(path.join(root, n, `${env}.env`)) || fs.existsSync(path.join(root, n, `${env}.env.txt`)));
  return { name: candidates.length === 1 ? candidates[0] : null, candidates };
}

function plainError(message) {
  if (/Token request failed/.test(message)) return 'Sitecore did not accept the client id and secret. Check they are for this environment and were copied whole, with no spaces.';
  if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/.test(message)) return 'The host name in SITECORE_API_HOST could not be found. Check it, and that this computer is online (VPN if your company needs one).';
  if (/ECONNREFUSED|ETIMEDOUT|fetch failed|aborted|timeout/i.test(message)) return 'The CM host did not answer. Check the host name and your network or VPN, then try again.';
  if (/HTTP 401|HTTP 403|not authorized|Unauthorized/i.test(message)) return 'Signed in, but this client may not read content. Ask the developer for an automation client with content access.';
  return 'Sitecore returned an error. The message below is safe to share with the developer.';
}

async function listSites(client) {
  try {
    const d = await client.query('query{ solutionSites(input:{includeNonSxaSites:true}){ name rootItem{ path } startItem{ path } } }');
    const sites = (d?.solutionSites || []).filter((s) => s?.rootItem?.path)
      .map((s) => ({ name: s.name, root: s.rootItem.path, home: s.startItem?.path || `${s.rootItem.path}/Home` }));
    if (sites.length) return sites;
  } catch { /* older or non-SXA instances: fall back to looking for Home items */ }
  const kids = async (p) => (await client.query('query($p:String!){ item(where:{path:$p}){ children(first:200){ nodes{ name path hasChildren } } } }', { p }))?.item?.children?.nodes || [];
  const sites = [];
  for (const a of await kids('/sitecore/content')) {
    if (/^home$/i.test(a.name)) { sites.push({ name: a.name, root: '/sitecore/content', home: a.path }); continue; }
    if (!a.hasChildren) continue;
    const b = await kids(a.path);
    const home = b.find((x) => /^home$/i.test(x.name));
    if (home) { sites.push({ name: a.name, root: a.path, home: home.path }); continue; }
    for (const c of b.filter((x) => x.hasChildren)) { const h = (await kids(c.path)).find((x) => /^home$/i.test(x.name)); if (h) sites.push({ name: c.name, root: c.path, home: h.path }); }
  }
  return sites;
}

const HOME_Q = `query($p:String!,$l:String!){ item(where:{path:$p, language:$l}){ itemId name displayName path template{ name }
  updated: field(name:"__Updated"){ value } title: field(name:"Title"){ value }
  children(first:100){ pageInfo{ hasNextPage } nodes{ name } } } }`;

async function readHome(client, homePath, language) {
  const it = (await client.query(HOME_Q, { p: homePath, l: language }))?.item;
  if (!it) return null;
  const u = it.updated?.value || '';
  const updated = /^\d{8}T/.test(u) ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` : u || null;
  const kids = it.children?.nodes || [];
  return {
    name: it.name, displayName: it.displayName || it.name, path: it.path, template: it.template?.name || null,
    title: it.title?.value || null, updated,
    childPages: it.children?.pageInfo?.hasNextPage ? `${kids.length}+` : kids.length, firstChildren: kids.slice(0, 8).map((k) => k.name),
  };
}

export async function connectCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const projectDir = path.resolve(deps.projectDir || process.cwd());
  const home = deps.home || os.homedir();
  const platform = deps.platform || process.platform;
  const print = deps.print !== false;
  const done = (o) => { if (print) console.log(JSON.stringify(o, null, 1)); return o; };
  const env = flags.env && flags.env !== true ? String(flags.env) : null;
  if (!env) throw new Error('usage: content-ops setup connect --env <dev|qa|prod|…> [--project <name>] [--site <name>] [--prod]');

  if (sameDir(projectDir, home) || within(projectDir, path.join(home, '.content-ops'))) {
    return done({ status: 'wrong-folder', projectDir, say: `Claude Code is open in ${projectDir}. Make a folder for this project's work (for example Documents\\<project> on Windows or Documents/<project> on a Mac), open Claude Code in it, and ask again. Key files stay in ${path.join(home, '.content-ops')}; work files go in the project folder.` });
  }

  const cfgFile = path.join(projectDir, '.content-ops', 'project.json');
  const existing = readJson(cfgFile);
  const guess = guessProject(home, env);
  const project = (flags.project && flags.project !== true ? String(flags.project) : null) || existing?.name || guess.name;
  if (!project) {
    return done({ status: 'need-project-name', candidates: guess.candidates, say: guess.candidates.length ? `More than one project has a ${env} key file (${guess.candidates.join(', ')}). Which one is this?` : 'What short name should this project use (lower case, no spaces, e.g. the client name)? It names the key file folder.' });
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(project)) throw new Error(`"${project}" is not a usable project name: letters, numbers, dot, dash or underscore, no spaces`);

  const isProdName = PROD.test(env);
  const dir = path.join(home, '.content-ops', project);
  const file = path.join(dir, `${env}.env`);
  const base = { project, env: { name: env, isProd: isProdName, file } };

  // 1. The key file
  if (!fs.existsSync(file)) {
    if (fs.existsSync(`${file}.txt`)) {
      return done({ ...base, status: 'key-file-misnamed', say: `The key file was saved as ${env}.env.txt (Notepad adds .txt). Rename it to ${env}.env: in File Explorer turn on View > File name extensions, then rename. Then ask again.` });
    }
    if (isProdName && !flags.prod) {
      return done({ ...base, status: 'needs-prod-ok', say: `"${env}" is production. I make a production key file only when you say production yourself; ask again naming production.` });
    }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, keyFileTemplate(project, env), { mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch { /* Windows keeps its own permissions */ }
    return done({ ...base, status: 'key-file-created', open: openCommand(file, platform), say: `I made an empty key file at ${file}. Open it in a text editor, paste the three values your developer gave you after the = signs (host, client id, client secret), save, and tell me "check the connection". Please do not paste them here.` });
  }
  let e;
  try { e = resolveEnv({ name: env, project, home, repoRoots: [projectDir] }); }
  catch (err) {
    if (!(err instanceof EnvError)) throw err;
    if (err.code === 'incomplete') return done({ ...base, status: 'key-file-incomplete', missing: err.message.replace(/^.* is missing /, '').split(', '), open: openCommand(file, platform), say: `The key file is missing ${err.message.replace(/^.* is missing /, '')}. Open it, fill the values after the = signs, save, and ask again.` });
    if (err.code === 'inside-repo') return done({ ...base, status: 'key-file-inside-repo', say: `The key file is inside a code folder, where it could be shared by mistake. Move it to ${file}.` });
    throw err;
  }
  base.env = describeEnv(e);
  if (e.isProd && !isProdName && !flags.prod) {
    return done({ ...base, status: 'needs-prod-ok', say: `The host ${e.host} looks like production although the environment is called "${env}". Say production yourself if that is right and ask again.` });
  }

  // 2. Sign in and find the site
  const language = existing?.language || 'en';
  const client = createClient(e, { fetchImpl: deps.fetchImpl });
  let sites;
  try { sites = await listSites(client); }
  catch (err) { return done({ ...base, status: 'connection-failed', error: err.message, say: plainError(err.message) }); }
  const wanted = flags.site && flags.site !== true ? String(flags.site).toLowerCase() : null;
  let site = wanted ? sites.find((s) => s.name.toLowerCase() === wanted || s.root.toLowerCase() === wanted || s.home.toLowerCase() === wanted) : null;
  if (!site && existing?.siteRoot) site = sites.find((s) => s.root === existing.siteRoot) || { name: path.posix.basename(existing.siteRoot), root: existing.siteRoot, home: existing.homePath };
  if (!site) { const real = sites.filter((s) => !SHARED.test(s.name)); if (real.length === 1) site = real[0]; }
  if (!site) {
    return done({ ...base, status: sites.length ? 'choose-site' : 'no-site-found', connection: 'ok', sites, say: sites.length ? `Connected to ${e.host}. It has ${sites.length} sites: ${sites.map((s) => s.name).join(', ')}. Which one do you work on?` : `Connected to ${e.host}, but no site with a Home item was found. Ask the developer for the site's item path and run again with --site <path to the Home item>.` });
  }

  // 3. Read something real: the home page
  let homeItem;
  try { homeItem = await readHome(client, site.home, language); }
  catch (err) { return done({ ...base, status: 'connection-failed', error: err.message, say: plainError(err.message) }); }
  if (!homeItem) return done({ ...base, status: 'home-not-found', connection: 'ok', site, sites, say: `Connected, but there is no item at ${site.home} in language "${language}".` });

  // 4. The smallest project config that lets every command run
  const wrote = [];
  if (!existing) {
    writeJson(cfgFile, { name: project, siteRoot: site.root, homePath: site.home, language, environments: [{ name: env }] });
    wrote.push('.content-ops/project.json');
  } else {
    const envs = Array.isArray(existing.environments) ? existing.environments : [];
    if (!envs.some((x) => x?.name === env) || existing.name !== project) {
      writeJson(cfgFile, { ...existing, name: existing.name || project, environments: envs.some((x) => x?.name === env) ? envs : [...envs, { name: env }] });
      wrote.push('.content-ops/project.json (added environment)');
    }
  }
  const mismatch = existing?.siteRoot && existing.siteRoot !== site.root ? `project.json points at ${existing.siteRoot}, not ${site.root}; nothing was changed.` : null;
  const prodWord = e.isProd ? ' (PRODUCTION: reading only; any change still needs your OK naming production)' : '';
  return done({
    ...base, status: 'connected', connection: 'ok', site, otherSites: sites.filter((s) => s.root !== site.root).map((s) => s.name), home: homeItem, wrote, mismatch,
    say: `Connected to ${e.host}${prodWord}. I read the home page of ${site.name}: "${homeItem.displayName}" at ${homeItem.path}${homeItem.updated ? `, last updated ${homeItem.updated}` : ''}, with ${homeItem.childPages} pages directly under it${homeItem.firstChildren.length ? ` (${homeItem.firstChildren.slice(0, 5).join(', ')}${homeItem.firstChildren.length > 5 ? ', …' : ''})` : ''}.`,
  });
}
