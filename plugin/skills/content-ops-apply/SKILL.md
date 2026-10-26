---
name: content-ops-apply
description: The write step - apply a dry run's ready pages to Sitecore, or create page shells for content marked create. Use only after a plan exists and the user says apply, write, run it, go ahead, create the pages, naming the environment. Journaled, read back, auto-rolled back; never publishes.
---

# Apply (write)

Pre-condition: a run from content-ops-plan made in this session, under 12 hours old, sources unchanged.

## Before the write

1. Restate from the run summary: environment name, host, prod yes/no, number of `ready` pages,
   creates/updates/layouts. For prod, also: "canary first: one page".
2. Ask for the OK. It must come from the user in this chat, in their own words, naming the environment
   and the scope (all ready pages, or which pages). If it does not, ask again; do not proceed on
   "yes" alone when the environment is ambiguous.
3. Do not add `--confirm` or `--prod` to a command the user did not approve for that environment.

## The write

- Dev/qa: `node <bin> apply --run <runId> --confirm <env> [--pages a,b]`.
- Prod: first `node <bin> apply --run <runId> --confirm <env> --prod --pages <one key>`; ask the user to
  open that page in Pages and say it looks right; then the rest with `--pages …` or without.
- Page shells (content with `target.mode: "create"` that planned as `no-match`):
  `node <bin> create --run <runId> --confirm <env> [--prod]`, then a fresh `plan` (they are updates now), then apply.
- The hook will show a WRITE prompt restating the command; the user approves it.

## After the write

1. Read the JSON: `applyId`, `counts` (`done`, `skipped`, `stale`, `rolled-back`, `rollback-incomplete`, `failed`),
   `stoppedEarly`, `failures`.
2. `node <bin> verify --run <runId> --apply <applyId>`: every written page must come back `up-to-date`.
   A page that does not is a finding: show its reasons and stop writing.
3. `node <bin> report --run <runId> --apply <applyId>` writes the run report (Written / Not written / Still pending /
   Re-check) and `node <bin> report --combined --env <env>` the one report per environment with every page ever
   written. Publish both as artifacts; republish the combined one to the same link every time.
4. Report: done / stale / rolled back / failed with one line each for anything not done; the verify
   result; a suggestion to check two pages in Pages; "nothing is published".

## If something fails

Do not re-run. `stale` means someone edited the page after the dry run: new plan. `rolled-back` means
the engine undid that page: read the error. `rollback-incomplete`: stop and show the problems list; a
developer looks. Log a learning.
