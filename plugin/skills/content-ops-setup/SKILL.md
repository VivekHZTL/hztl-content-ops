---
name: content-ops-setup
description: Connect Claude to a SitecoreAI environment with nothing but a key file - make or check ~/.content-ops/<project>/<env>.env, sign in, read the site's home page, write the smallest project config, then carry on with what was asked. Also joins a project that already has .content-ops/ and, for the tech team, optional extras (answers file, .env.local copy). Use when someone says set up, connect me to prod/dev/qa, set up content ops, join this project, I got the repo, new laptop, credentials, key file, env file, check the connection, or when a command says the key file or project config is missing.
---

# Setup: a key file, a connection check, then the real task

Setup is short on purpose. The person may have only credentials: no project code, no `.content-ops/`, no catalog,
no blueprints. That is enough. Do not ask them to set up a catalog or blueprints, and do not send them to a
developer for one. The catalog is built later, by itself, the first time a task needs page types or components.

Engine: `node "<bin>" …` (see the content-ops skill for `<bin>`). Every command prints JSON with a `say` line in
plain words; relay it.

## 1. Connect (everyone, a few minutes)

They say "set up for me to connect on prod" (or dev, qa, "connect me to Sitecore"). Work out the environment name
from their words (`prod`, `dev`, `qa`…). Then:

1. **Folder.** Claude Code must be open in a folder for this project's work (the project repo, or any folder such as
   `Documents\<project>` on Windows). If it is open in their home folder, `connect` answers `wrong-folder`; say what
   it says.
2. Run `node "<bin>" setup connect --env <env>`. Add `--project <name>` when you know the short project name
   (lower case, no spaces, often the client name). Add `--prod` only when the person said production themselves.
3. Act on `status`:

| status | what to do |
|---|---|
| `need-project-name` | Ask the question in `say` (or pick from `candidates` with them), rerun with `--project`. |
| `key-file-created` | An empty key file now exists at `env.file`. Offer to open it with the `open` command (Notepad on Windows). They paste the host, client id and client secret after the `=` signs and save. Say: please don't paste them here. Wait for "done", then rerun. |
| `key-file-incomplete` | Same, naming `missing`. |
| `key-file-misnamed` | Windows Notepad saved `dev.env.txt`; relay the rename steps in `say`. |
| `needs-prod-ok` | Production. Go on only if they named production themselves; then rerun with `--prod`. |
| `connection-failed` | Relay `say` and the `error` (it never holds a secret). Usually a wrong or mistyped value in the key file. |
| `choose-site` | Several sites. Ask which one they work on, rerun with `--site <name>`. |
| `connected` | Done. Relay `say`: the host, production yes/no, and the home page read (name, path, last updated, pages under it). |

You never create, open, read or print the key file contents yourself, and never ask anyone to paste values into
chat. Where the values come from: the project's developer, or the SitecoreAI Cloud Portal (an automation client for
that environment). `SITECORE_EDGE_CONTEXT_ID` is optional (only for checking published content on Edge).

`connect` only reads Sitecore. On first success it writes `.content-ops/project.json` with the project name, the
site root and home page it found, the language and the environment; a second environment is added to the same file.
Nothing else is required.

4. **Then do what they asked.** If the request was only "set me up", offer two or three things to try in plain
   words ("show me the pages under Home", "what page types do we have", "check this page for broken links").
   If it came with a task ("set me up on prod and find pages with an empty SEO title"), go straight to it.

Later, `node "<bin>" check --env <env>` re-checks a connection and reads the home page again.

## 2. The project already has `.content-ops/` (a colleague, a new laptop)

If `.content-ops/project.json` exists, the project is set up; never run `setup --answers` (it would overwrite the
team's config). Offer sync-repo first when it is a git clone. Then either run `setup connect --env <env>` as above
(it reuses the project's name and site), or `node "<bin>" setup join` to make empty key files for every
non-production environment at once (`--prod` only when a developer says this person gets production). Relay
`environments[].status` and `next` as a short table, then `setup connect` for each filled file.

## 3. Optional extras for the tech team

None of these are needed before anyone can work. Mention them only when someone asks.

- **Copy credentials from a head app `.env.local`:** `node "<bin>" setup --from-env-local <path> --env <name>`
  (`--force` when a placeholder exists, `--prod` for production with a developer). Say first: "I will copy three
  settings from that file into a safe place outside the project. I will not show them to you or to anyone." It
  prints only the host and the first four characters of the client id. Never open the file yourself.
- **Answers file (all settings at once):** `node "<bin>" setup questions`, ask in plain words, write the answers to a
  scratch file, `node "<bin>" setup --answers <file>`. Adds contacts, live-check site URLs, repo code paths,
  placeholder hints. `setup connect` afterwards checks it.
- **Catalog (page types and components):** built automatically the first time a task needs it, from the
  environment that task uses; the command output says `catalogBuilt` when that happens. To build or update it on
  purpose: `node "<bin>" catalog show --env <env>` (builds if missing), `catalog build --env <env>`, or after a
  template change `catalog refresh --env <env>` (never deletes; a developer reviews `summary.added`, `missing`,
  `changed` and runs `catalog verify <key>`). It learns from one real page per template; a blueprint folder
  (`<home>/_blueprints`, one page per template with every component once) is optional and only makes it complete
  sooner.
- **Repo hygiene:** in a git repo, `sources/`, `work/` and `runs/` should be git-ignored; propose the lines, the
  developer commits them.

## Windows

Same steps. Key files live in `C:\Users\<you>\.content-ops\<project>\<env>.env`. Open them with Notepad
(`notepad "<file>"`). Notepad may save as `.env.txt` (connect detects it) or in another encoding (the engine reads
UTF-8, UTF-8 with BOM and UTF-16). Claude Code on Windows runs the plugin's safety hooks through Git Bash, which
comes with Git for Windows.
