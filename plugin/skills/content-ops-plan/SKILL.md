---
name: content-ops-plan
description: Read-only dry run of content JSON against Sitecore - what would be created, updated or re-laid out, what is pending, what the engine refuses. Use when someone says plan, dry run, rehearse, what would change, show me before you write, pending, needs review, or before any apply. Never writes.
---

# Plan (dry run)

Outcome: a run folder `runs/<runId>/` with `plan.json`, `summary.json`, and a plain-words report. Nothing changes in Sitecore.

## Steps

1. `node <bin> check --project <name> --env <env>`: say the host and whether it is production.
2. `node <bin> sources verify`: all `ok`, or stop and send the author to content-ops-sources.
3. `node <bin> plan --env <env> --content work/ [--pages a,b]`. Read the JSON: `runId`, `counts`
   (`ready`, `up-to-date`, `needs-review`, `no-match`), `creates`, `updates`, `layouts`, `pendingByCategory`.
4. `node <bin> show --run <runId> --status needs-review,no-match` and
   `node <bin> show --run <runId> --pending`. Never open `plan.json`.
5. Spot-check one `ready` page: `node <bin> show --run <runId> --page <key>` and read its component
   before/after and update count.

## Gates to raise, in this order

- `needs-review` pages: list each with its reasons (unknown component, shared datasource, page type
  mismatch, flag do-not-author, a `new-adapter` flag meaning the content came through a reader written for this
  project that a developer has not reviewed yet, a component `missing` from the blueprint since a refresh,
  layout the engine will not touch). These are never written.
- `no-match` pages: no item at the target path. If the content says `mode: create`, that is content-ops-apply's
  `create` step; otherwise ask whether the path is right.
- Pending by category: `placeholder` (copy with [TBD]-style tokens, not written), `review` (datasource
  missing and replaced, component on the page not in the content), `no-field` (value with nowhere to go),
  `sources` (unregistered source), `unverified-component` (the component was added or changed on the blueprint
  since the catalog was confirmed; the page can still be written; a developer runs `catalog verify`). Quote the locator for each.
- Big removals or many layout changes: say how many pages change layout and why.

## Report

`node <bin> report --run <runId>` writes `runs/<runId>/report.html` (Pending & skipped with next steps and CSV,
Page diff, All pages, Sources). Publish that file as an artifact with the Artifact tool, as is, and give the link.

Counts in a short table; the gates as bullets with locators; the runId on its own line; then
"Nothing was written. To write the ready pages, say so with the environment and the pages." Stop.
