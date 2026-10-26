---
name: content-ops-setup
description: Setup of a Sitecore project for the content-ops engine. Two paths - JOIN a project that already has .content-ops/ (a colleague's first run, a new laptop: credentials folder, placeholder env files, what is missing) or FIRST-TIME setup by the tech team (answers file, project config, credentials, role, catalog, connection check). Use when someone says set up content ops, set up content ops for this project, join this project, I got the repo, new laptop, onboard this repo, new project, build the catalog, credentials, env file, or when check reports missing configuration.
---

# Project setup

## 0. Which path? Look first

Check whether `.content-ops/project.json` exists in the folder Claude Code is open in.

- **It exists → JOIN (anyone, about five minutes).** The project is already set up; do not ask the setup
  questions and never run `setup --answers` (it refuses without `--force`, and `--force` would overwrite the team's
  committed config). Say: "This project is already set up. I'll get your computer ready for it."
  1. If the repo is a git clone, offer the sync-repo skill first so `.content-ops/` is the latest.
  2. Run `node <bin> setup join` (add `--prod` only when a developer says this person gets production).
     It makes `~/.content-ops/<name>/` and an empty placeholder `<env>.env` per non-production environment, never
     overwrites a filled file, and prints JSON: `environments[].status`, `engine`, `catalog`,
     `gitignore`, `next`.
  3. Relay it as a short table (environment, file, status) and the `next` lines in plain words. Status words:
     `ok` ready; `placeholder-created` / `empty` waiting for the three values; `incomplete` one value missing;
     `skipped-production` on purpose.
  4. Filling a file: the person opens it in a text editor (on a Mac `open -e <file>`; on Windows Notepad) and pastes
     the values after the `=` signs. You never open, read or print it, and never ask them to paste values into chat.
     A developer can instead say "copy the credentials from my .env.local for dev" (step 2 below, with `--force` since
     the placeholder exists).
  5. Then `node <bin> check --project <name> --env <env>` for each filled file. Done when `credentials: ok` and
     `connection: ok`. Then hand over to the content-ops skill: "Try: what page types do we have?"
  If `gitignore.missing` is not empty or `catalog` is null, say which developer task is left; an author does not fix it.

- **It does not exist → FIRST-TIME setup below (tech team, about one hour).** If the person expected it to exist,
  ask them to pull the latest repo or get a fresh copy before starting a new setup.

# First-time setup (tech team, about one hour)

Outcome: the `.content-ops` folder exists in the project repo, each environment has a credentials file outside
any repo, `check` is green, and `catalog.json` describes the project's page types and components.

## 1. Answers

Run `node <bin> setup questions` and ask the developer each question in plain words. Write the answers
to a file outside the repo or in the scratch folder, e.g. `/tmp/<project>-answers.json`:

```json
{ "name": "<short project name>", "siteRoot": "/sitecore/content/<Tenant>/<Site>", "homePath": "/sitecore/content/<Tenant>/<Site>/Home",
  "language": "en", "environments": [{ "name": "dev", "siteUrl": "https://dev.<site>" }, { "name": "qa", "siteUrl": "https://qa.<site>" }, { "name": "prod", "siteUrl": "https://www.<site>" }],
  "blueprintRoot": "/sitecore/content/<Tenant>/<Site>/Home/_blueprints", "repoRoot": "headapps/<app>", "placeholders": null }
```

Include `contacts` (`{ "dev": "<name>", "content": "<name>" }`): the skills name these people when an author is stuck.
Then `node <bin> setup --answers <file>`. Read back the `next` lines and relay them.

## 2. Credentials, by hand, never through Claude

The developer creates one file per environment at `~/.content-ops/<name>/<env>.env` with
`SITECORE_API_HOST`, `SITECORE_CLIENT_ID`, `SITECORE_CLIENT_SECRET` (environment automation client of
that environment). You do not create, open, read or print these files. Say exactly where they go and
what keys they need. Authors usually get `dev.env` and `qa.env`; `prod.env` goes to whoever the project lead decides. Anyone with `prod.env` can write to production: the engine needs `--prod`, which you add only when the person named production, and the prompt says PRODUCTION.

Or, if the developer points you at the head app's `.env.local`: `node <bin> setup --from-env-local <path> --env <name>`.
Say first: "I will copy three settings from that file into a safe place outside the project. I will not show
them to you or to anyone." The command prints only the host and the first four characters of the client id.
Prod needs `--prod` and a developer. Never open or read the file yourself.

Then `node <bin> check --project <name> --env dev`. Expect `credentials: ok` and `connection: ok`. If
`connection` fails, the message is safe to show; the secret is never in it.

## 3. Engine

The engine ships inside the plugin (`${CLAUDE_PLUGIN_ROOT}/engine/bin/content-ops.mjs`); there is no path or
role to set. Access is controlled by which credentials files a developer hands out.

## 4. Blueprint pages (optional)

If `blueprintRoot` holds one page per page template with every allowed component placed once, the catalog is
complete on day one. If it does not exist, `catalog build` discovers one real page per template from the site
(the page using the most components) and builds from those; the JSON says `source: discovered` and lists them.
Tell the developer: components no page uses yet are missing until `catalog refresh` after the site grows, or
until they add the blueprint folder.

## 5. Catalog

First time: `node <bin> catalog build --env dev`. After a template change: `node <bin> catalog refresh --env dev`;
it never deletes. Read `summary.added`, `summary.missing`, `summary.changed`; for each, the developer looks and
runs `node <bin> catalog verify <key>`. `node <bin> catalog show` prints every component with its status.

`node <bin> catalog build --env dev`. Read the JSON: page types, component count, placeholders, `errors`.
Any error (orphan child placeholder, a component placed both top-level and nested) means a blueprint fix.
Then open `.content-ops/catalog.json` once and summarise: page types and their component order, components
with children, which are themed. For each page type the project will create pages for, the developer adds
`"pageTypes": { "<key>": { "branchId": "<guid>" } }` to `project.json` when a branch exists, then rebuilds.

## 6. Repo hygiene

`sources/`, `work/`, `runs/` must be git-ignored. Check `.gitignore`; propose the three lines if missing
(the developer commits them).

Report: a table of what exists now (config files, envs with `check` status, catalog counts) and what is
still missing.
