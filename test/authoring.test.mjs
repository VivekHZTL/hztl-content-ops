import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../plugin/engine/lib/client/authoring.mjs';

const env = { name: 'dev', host: 'h', endpoint: 'https://h/sitecore/api/authoring/graphql/v1', isProd: false, clientId: 'id', clientSecret: 'sec', authorityUrl: 'https://auth', audienceUrl: 'https://aud' };
const json = (body, status = 200) => ({ status, json: async () => body });
function fakeFetch(script) { const calls = []; const f = async (url, init) => { calls.push({ url, init }); const next = script.shift(); if (next instanceof Error) throw next; return next; }; f.calls = calls; return f; }
const sleep = async () => {};

test('query sends a bearer token and returns data', async () => {
  const fetchImpl = fakeFetch([json({ access_token: 't', expires_in: 3600 }), json({ data: { ok: 1 } })]);
  const c = createClient(env, { fetchImpl, sleep });
  assert.deepEqual(await c.query('query{ ok }'), { ok: 1 });
  assert.equal(fetchImpl.calls[1].init.headers.authorization, 'Bearer t');
  assert.equal(fetchImpl.calls[1].url, env.endpoint);
});
test('query retries on 503 then succeeds; mutate never retries', async () => {
  const fetchImpl = fakeFetch([json({ access_token: 't', expires_in: 3600 }), json({}, 503), json({ data: { ok: 2 } }), json({}, 503)]);
  const c = createClient(env, { fetchImpl, sleep, allowWrites: true });
  assert.deepEqual(await c.query('query{ ok }'), { ok: 2 });
  await assert.rejects(c.mutate('mutation{ x }'), /HTTP 503/);
  assert.equal(fetchImpl.calls.length, 4);
});
test('query refuses a mutation; read client refuses mutate; publish needs allowPublish', async () => {
  const c = createClient(env, { fetchImpl: fakeFetch([]), sleep });
  await assert.rejects(c.query('mutation{ x }'), /mutations go through mutate/);
  await assert.rejects(c.mutate('mutation{ x }'), /Writes are disabled/);
  const w = createClient(env, { fetchImpl: fakeFetch([]), sleep, allowWrites: true });
  await assert.rejects(w.mutate('mutation{ publishItem(input:{}) { operationId } }'), /never publishes/);
});
test('a token response without access_token names the env, not the secret', async () => {
  const c = createClient(env, { fetchImpl: fakeFetch([json({ error: 'bad' }, 401)]), sleep });
  await assert.rejects(c.query('query{ ok }'), (e) => /Token request failed for dev \(401\)/.test(e.message) && !/sec/.test(e.message));
});
test('GraphQL errors surface as one message', async () => {
  const c = createClient(env, { fetchImpl: fakeFetch([json({ access_token: 't', expires_in: 3600 }), json({ errors: [{ message: 'a' }, { message: 'b' }] })]), sleep });
  await assert.rejects(c.query('query{ ok }'), /a; b/);
});
