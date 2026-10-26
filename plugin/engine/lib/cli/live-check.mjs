// `live-check --env <e> --paths /a,/b [--expect "text"] [--pause-ms 1000]`
// Fetches each path on the environment's site URL, one at a time with a pause, and reports status, the
// CDN cache headers (a 404 with a cache HIT and a large age is the cached-404 case, not a content fault),
// the h1 and whether the expected text is present. Read-only. Never request a route before it is published.
import { parseArgs } from './args.mjs';
import { context, emit, need } from './common.mjs';

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export async function liveCheckCommand(argv, deps = {}) {
  const { flags } = parseArgs(argv);
  const ctx = context(deps);
  const usage = 'content-ops live-check --env <name> --paths /a,/b [--expect "text"] [--pause-ms 1000]';
  const envName = need(flags, 'env', usage);
  const env = ctx.cfg.project.environments.find((e) => e.name === envName);
  if (!env?.siteUrl) throw new Error(`Environment "${envName}" has no siteUrl in project.json`);
  const paths = String(need(flags, 'paths', usage)).split(',').map((p) => p.trim()).filter(Boolean);
  const fetchImpl = deps.fetchImpl || fetch; const sleep = deps.sleep || wait;
  const pause = Math.max(0, parseInt(flags['pause-ms'], 10) || 1000);
  const expect = flags.expect && flags.expect !== true ? String(flags.expect) : null;
  const pages = [];
  for (const [i, p] of paths.entries()) {
    if (i) await sleep(pause);
    const url = env.siteUrl.replace(/\/$/, '') + (p.startsWith('/') ? p : '/' + p);
    let rec = { path: p, url };
    try {
      const r = await fetchImpl(url, { redirect: 'manual' });
      const hdr = (k) => (typeof r.headers?.get === 'function' ? r.headers.get(k) : r.headers?.[k]) ?? null;
      const body = r.status === 200 ? await r.text() : '';
      const h1 = strip(body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
      rec = { ...rec, status: r.status, cache: hdr('x-vercel-cache') || hdr('cf-cache-status') || null, age: hdr('age'), h1, expected: expect ? strip(body).includes(expect) : null };
      if (r.status === 404 && /HIT/i.test(rec.cache || '') && +(rec.age || 0) > 60) rec.note = 'Cached 404: the route was requested before it was published; it clears within an hour. Not a content fault.';
      else if (r.status === 200 && expect && !rec.expected) rec.note = `Expected text "${expect}" not found`;
    } catch (e) { rec = { ...rec, status: null, error: e.message }; }
    pages.push(rec);
  }
  return emit(ctx, { env: envName, siteUrl: env.siteUrl, checked: pages.length, ok: pages.filter((x) => x.status === 200 && (x.expected ?? true)).length, pages });
}
