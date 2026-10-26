// `content-ops check`: which environment, whether credentials exist, whether the CM answers.
// Prints JSON. Never prints a secret.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveEnv, describeEnv, EnvError } from '../client/env.mjs';
import { createClient } from '../client/authoring.mjs';

const arg = (argv, k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };

export async function checkCommand(argv, { home = os.homedir(), fetchImpl = fetch, language = 'en', print = false } = {}) {
  const project = arg(argv, '--project'); const name = arg(argv, '--env');
  if (!project || !name) throw new Error('usage: content-ops check --project <name> --env <name> [--offline]');
  const out = { project, env: null, credentials: 'missing', connection: 'skipped' };
  let env;
  try { env = resolveEnv({ name, project, home }); out.credentials = 'ok'; out.env = describeEnv(env); }
  catch (e) {
    if (!(e instanceof EnvError)) throw e;
    out.credentials = e.code === 'incomplete' ? 'incomplete' : 'missing';
    out.env = { name, host: null, isProd: /prod|prd/i.test(name), file: path.join(home, '.content-ops', project, `${name}.env`) };
  }
  if (env && !argv.includes('--offline')) {
    try { const c = createClient(env, { fetchImpl }); await c.query(`query{ item(where:{path:"/sitecore", language:"${language}"}){ name } }`); out.connection = 'ok'; }
    catch (e) { out.connection = `failed: ${e.message}`; }
  }
  if (print) console.log(JSON.stringify(out, null, 1));
  return out;
}
