// Sitecore Authoring GraphQL client.
// Reads retry on network errors, 429 and 5xx with a 60 s limit per request. Writes never retry:
// a write that timed out may still have landed, and the apply journal plus read-back handle that.
// query() refuses mutations. mutate() refuses unless the client was created with allowWrites, and
// refuses publish mutations unless allowPublish. The secret never appears in an error message.
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

export function createClient(env, { allowWrites = false, allowPublish = false, fetchImpl = fetch, sleep = wait } = {}) {
  let tok = null;
  async function token() {
    if (tok && tok.exp > Date.now() + 60_000) return tok.value;
    const r = await fetchImpl(`${env.authorityUrl}/oauth/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.clientId, client_secret: env.clientSecret, audience: env.audienceUrl }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) throw new Error(`Token request failed for ${env.name} (${r.status})`);
    tok = { value: j.access_token, exp: Date.now() + (j.expires_in || 300) * 1000 };
    return tok.value;
  }
  async function exec(query, variables, { isRead = false } = {}) {
    for (let attempt = 1; ; attempt++) {
      const bearer = await token(); // a token failure is a credentials problem, never retried as a network error
      let r;
      try {
        r = await fetchImpl(env.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + bearer }, body: JSON.stringify({ query, variables }), ...(isRead ? { signal: AbortSignal.timeout(60_000) } : {}) });
      } catch (e) {
        if (isRead && attempt < 4) { await sleep(1500 * attempt); continue; }
        throw e;
      }
      if (isRead && (r.status === 429 || r.status >= 500) && attempt < 4) { await sleep(800 * attempt); continue; }
      const j = await r.json().catch(() => ({ errors: [{ message: `HTTP ${r.status}` }] }));
      if (r.status >= 400 && !j.errors?.length) throw new Error(`HTTP ${r.status}`);
      if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join('; '));
      return j.data;
    }
  }
  return {
    env: env.name, host: env.host, isProd: env.isProd, writable: allowWrites,
    query(q, vars = {}) {
      if (/^\s*mutation\b/i.test(q)) return Promise.reject(new Error('Read client: mutations go through mutate()'));
      return exec(q, vars, { isRead: true });
    },
    mutate(q, vars = {}) {
      if (!allowWrites) return Promise.reject(new Error('Writes are disabled for this client (dry run)'));
      if (!allowPublish && /publishItem|publishLanguageSpecificItems/i.test(q)) return Promise.reject(new Error('This client never publishes'));
      return exec(q, vars);
    },
  };
}
