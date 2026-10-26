---
name: content-ops-verify
description: Prove and finish a content run - re-verify written pages, publish them to Experience Edge after a separate OK, check the live site, or undo one page from its journal. Use when someone says verify, is it right, check live, publish, go live, undo, roll back, restore.
---

# Verify, publish, live-check, undo

## Verify (read-only)

`node <bin> verify --run <runId> [--apply <applyId>]`. Expect `upToDate` = pages checked. For any page
not up to date, show `reasons` and `fieldsOff`. Nothing else until that is explained.

## Publish (write, its own OK)

1. `node <bin> publish --run <runId> [--apply <applyId>] --confirm <env> --dry`: lists the roots (page,
   created items, updated items) and `skippedUndone`. Every root must be under the home path; the
   engine refuses otherwise.
2. Restate: environment name, host (from `check`), prod yes/no, number of roots. Ask for the OK in the
   user's own words, naming "publish" and the environment.
3. `node <bin> publish --run <runId> [--apply <applyId>] --confirm <env> [--prod]`. Read `ops`, `failed`, `log`.
4. Order rule when pages link to each other: publish linked pages before the pages that link to them.
   Never request a brand-new route on the site before it is published; a cached 404 outlives the publish.

## Live check (read-only)

After publishing and a couple of minutes: `node <bin> live-check --env <env> --paths /a,/b [--expect "<h1 text>"]`.
Read `status`, `h1`, `expected`, `cache`, `note`. A 404 with cache HIT and a large age is the cached-404
case, not missing content; say so and retry later rather than republishing.

## Relink (read-only on Sitecore, edits work/)

When target pages that were missing at intake now exist: `node <bin> relink --env <env> --sitemap <file>`.
It resolves only links flagged `link-pending` (or with a Page ID and no id) and drops their flag; everything else
in `work/*.json` stays as it was. Read `resolved` and `stillPending`, then a new dry run and apply for the pages that changed.

## History (read-only)

`node <bin> history --env <env> [--page <key>]`: every page written on that environment, by run and apply, with
its status and whether it was undone later.

## Undo (write, its own OK)

Per page, from its journal. First restate: environment name, host, prod yes/no, the page key and what the
run wrote to it (`node <bin> show --run <runId> --page <key>`). Then, after the user names the page and
the environment in their own words: `node <bin> undo --run <runId> --apply <applyId> --page <key> --confirm <env> [--prod]`. Only values that still hold what the run wrote are
restored; anything edited since is left alone and listed in `problems`. Report `restored` and `problems`.
An undone page needs publishing again if it had been published.
