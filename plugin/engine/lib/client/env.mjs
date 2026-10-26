// Environment resolution. Credentials live in one file per environment OUTSIDE any repo:
//   ~/.content-ops/<project>/<env>.env
// This module never prints a secret and refuses a credentials file inside a repo root it is told about.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROD = /prod|prd/i;

export class EnvError extends Error { constructor(code, message) { super(message); this.code = code; } }

export function parseEnvFile(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const k = line.slice(0, line.indexOf('=')).trim();
    let v = line.slice(line.indexOf('=') + 1).trim();
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0]) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const PACKAGE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..'); // the plugin folder (engine/lib/client → plugin)
const inGitTree = (file) => { let d = path.dirname(path.resolve(file)); for (;;) { if (fs.existsSync(path.join(d, '.git'))) return d; const up = path.dirname(d); if (up === d) return null; d = up; } };
const inside = (file, root) => { const rel = path.relative(path.resolve(root), path.resolve(file)); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel); };

export function resolveEnv({ name, project, file, home = os.homedir(), repoRoots = [] }) {
  if (!name) throw new EnvError('missing-name', 'An environment name is required');
  const f = file ? path.resolve(file) : path.join(home, '.content-ops', project || '', `${name}.env`);
  if (!fs.existsSync(f)) throw new EnvError('missing-file', `No credentials file for "${name}" at ${f}. A developer creates it outside any repo.`);
  for (const r of [PACKAGE_ROOT, ...repoRoots]) if (inside(f, r)) throw new EnvError('inside-repo', `Refusing credentials file inside a repo: ${f}`);
  const git = inGitTree(f);
  if (git) throw new EnvError('inside-repo', `Refusing credentials file inside a git working tree (${git}): ${f}`);
  const v = parseEnvFile(f);
  const missing = ['SITECORE_API_HOST', 'SITECORE_CLIENT_ID', 'SITECORE_CLIENT_SECRET'].filter((k) => !v[k]);
  if (missing.length) throw new EnvError('incomplete', `${f} is missing ${missing.join(', ')}`);
  const hostUrl = new URL(/^https?:\/\//i.test(v.SITECORE_API_HOST) ? v.SITECORE_API_HOST : `https://${v.SITECORE_API_HOST}`);
  const base = `${hostUrl.protocol}//${hostUrl.host}`;
  return {
    name, file: f, host: hostUrl.host, endpoint: `${base}/sitecore/api/authoring/graphql/v1`,
    isProd: PROD.test(name) || PROD.test(hostUrl.host),
    clientId: v.SITECORE_CLIENT_ID, clientSecret: v.SITECORE_CLIENT_SECRET,
    authorityUrl: (v.SITECORE_AUTHORITY_URL || 'https://auth.sitecorecloud.io').replace(/\/$/, ''),
    audienceUrl: v.SITECORE_AUDIENCE_URL || 'https://api.sitecorecloud.io',
    edgeContextId: v.SITECORE_EDGE_CONTEXT_ID || null,
  };
}

/** The printable part of an environment: never the client id or secret. */
export const describeEnv = (e) => ({ name: e.name, host: e.host, isProd: e.isProd, file: e.file });
