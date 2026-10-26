# Verification: proving it is live

Three layers, each answers a different question.

| Layer | Answers | How |
|---|---|---|
| CM read-back | was it written as planned? | automatic in `apply`; `verify --run` later |
| Edge | was it published? | a read-only check against the Experience Edge endpoint for the changed items |
| Rendering host | does the site show it? | `live-check --paths ... --expect <text>` |

**Reference project:** every run was CM-verified; publishes were checked on Edge (field values and layout) before
the live site; the live check looked for new copy present and old copy gone.

**Pitfalls**
- The rendering host caches (ISR): a page can be right on Edge and stale on the site for minutes. Retry, or use a
  changed-case URL on preview hosts to skip the cache.
- A preview behind a password needs the team's preview credentials; never paste them into chat.
- Edge checks need the environment's Edge context id; keep it in the credentials file, not in the repo.
