---
name: content-ops-review
description: Review one authored page against its source content - copy verbatim, links, images, flags, components in order - and report every difference with a locator. Use when someone says review this page, compare with the deck, is the copy exact, check what was written, QA the page.
---

# Review a page

Read-only. Compare three things: the source content JSON (`work/<pageId>.json`), what the run planned
(`show --run --page`), and what is on the CM now (`verify`).

1. `node <bin> show --run <runId> --page <key>`: components before/after, creates, update count, pending.
2. `node <bin> verify --run <runId> --apply <applyId>` and read this page's entry: `up-to-date` or reasons.
3. `node <bin> snapshot --env <env> --path <item path>`: a read-only snapshot file of the page and its Data items,
   so the written values can be compared verbatim.
4. Dispatch the `content-reviewer` agent with: the content JSON path, the snapshot file path, the `show`
   output for the page, and the `fieldsOff` list. It returns a table: field, source value (trimmed), written value, same/different,
   locator. It never writes.
5. Links: every link in the content is `{ text, url | id }`; `id` means resolved to a page, `url` with
   a `link-pending` flag means the target page did not exist at plan time; list those for a relink after
   the target is built.
6. Images: `missing-image` flags mean no DAM record yet; list them for the client.
7. Flags `new-adapter` (content read by an unreviewed project reader) and pending `unverified-component` (component
   changed on the blueprint since the catalog was confirmed) go to the developers, in plain words.

Report: a table with one row per difference (field, expected, found, locator), then the flags still open
on this page grouped by owner, then "verified up to date: yes/no". No differences and up to date: say
so in one line and list what was not checked (rendered look, Pages preview, published state).
