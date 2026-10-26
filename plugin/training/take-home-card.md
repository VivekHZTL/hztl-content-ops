# Take-home card

Print both sides. Keep it next to the keyboard for the first two weeks.

## Front: the eight sentences, in order

1. **check the connection and tell me what page types we have** — read-only, nothing can go wrong.
2. **make me an intake sheet for <page type> pages** — the client's form comes from Sitecore, not from us.
3. **plan it** — the dry run. Read the report before anything else.
4. **apply this on dev** — the one prompt that matters. Read environment, host, prod no, page count. Then say yes in your own words.
5. **verify** — up-to-date is the proof.
6. **undo the <slug> page on dev** — one page per undo; the journal holds the old values. It asks first too.
7. **which pages have <problem>? give me a report** — questions beat typing.
8. **what does this flag mean** — flags are the client's homework, not yours.

What to do next, every time: read the whole answer, then type the next sentence. If anything on screen surprises you, say no and ask.

## Back: safety, flags, who to ask

Safety in eight lines:

1. Every Sitecore write asks first and restates environment, host, prod yes or no, and scope.
2. Production works only with a production credentials file. With it, every production write says PRODUCTION and asks again.
3. Every write is journaled before it happens and checked after; a mismatch rolls the page back.
4. Undo is one command per page from the journal. Say "undo that" after any apply.
5. Shared datasources are never edited. Unknown components are refused.
6. Client copy is never corrected. Problems become flags with a locator.
7. Credentials are never printed, read aloud or committed. Never paste them.
8. Publish is a separate ask. Nothing publishes as a side effect.

Three things you will see on reports:

- **A flag** (missing URL, placeholder, suspect link): a question for the client or the developers. The locator says exactly where. Not a mistake you fix by hand.
- **needs-review**: the tool refused to guess. Read the reason, fix the source or ask a developer, plan again.
- **pending**: held, not written. A placeholder token, a link to a page that does not exist yet, a component changed on the blueprint.

Who to ask: `contacts` in `.content-ops/project.json` names your project's developer and content lead. Ask Claude *who do I ask on this project* and it reads it for you.

Do: keep every sentence short and say the environment when you mean one.
Don't: type `--confirm` or `--prod`, open `.env` files, or say yes to a prompt that says PRODUCTION unless you meant production.
