// `content-ops check`: which environment, whether credentials exist, whether the CM answers. In a project folder it
// reads the site's home page, so "ok" means real content was read, not only that the host replied.
// Prints JSON. Never prints a secret.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveEnv, describeEnv, EnvError } from '../client/env.mjs';
import { createClient } from '../client/authoring.mjs';

const arg = (argv, k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export async function checkCommand(argv, { home = os.homedir(), fetchImpl = fetch, language, print = false, projectDir = process.cwd() } = {}) {
  const cfg = readJson(path.join(projectDir, '.content-ops', 'project.json'));
  const project = arg(argv, '--project') || cfg?.name; const name = arg(argv, '--env');
  if (!project || !name) throw new Error('usage: content-ops check --env <name> [--project <name>] [--offline]  (--project is read from .content-ops/project.json when there is one)');
  const homePath = cfg?.name === project ? cfg.homePath : null;
  language ||= (cfg?.name === project && cfg.language) || 'en';
  const out = { project, env: null, credentials: 'missing', connection: 'skipped' };
  let env;
  try { env = resolveEnv({ name, project, home }); out.credentials = 'ok'; out.env = describeEnv(env); }
  catch (e) {
    if (!(e instanceof EnvError)) throw e;
    out.credentials = e.code === 'incomplete' ? 'incomplete' : 'missing';
    out.env = { name, host: null, isProd: /prod|prd/i.test(name), file: path.join(home, '.content-ops', project, `${name}.env`) };
  }
  if (env && !argv.includes('--offline')) {
    try {
      const c = createClient(env, { fetchImpl });
      const d = await c.query('query($p:String!,$l:String!){ item(where:{path:$p, language:$l}){ name path } }', { p: homePath || '/sitecore', l: language });
      if (homePath) out.home = d?.item ? { name: d.item.name, path: d.item.path } : `not found at ${homePath}`;
      out.connection = 'ok';
    }
    catch (e) { out.connection = `failed: ${e.message}`; }
  }
  if (print) console.log(JSON.stringify(out, null, 1));
  return out;
}
