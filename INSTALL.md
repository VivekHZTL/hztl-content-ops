# Install and use Content Ops

One plugin per machine (the engine ships inside it). One key file per project per environment. That is all setup needs: no project code, catalog or blueprints.

## Once per machine (developer or author)

1. Claude Code and Node 22 or newer. On Windows also Git for Windows (Claude Code needs its Git Bash; the plugin's two safety hooks run under it).
2. Register the plugin from the public repo (no GitHub account needed):

   ```bash
   claude plugin marketplace add VivekHZTL/hztl-content-ops
   claude plugin install sitecore-content-ops@hztl-content-ops
   ```

   Offline or no git access: unzip a copy, then `claude plugin marketplace add ./` from inside that folder (keep it; updates install from it).
   Working on the plugin itself: clone the repo and add the clone's path instead, so your edits are what you run.


Restart Claude Code. In any folder, typing `/content-ops` or saying "content ops" now routes to the skills.

## Connect (anyone, a few minutes)

Open a folder for the project in Claude Code: the project repo if you have it, otherwise any folder
(`Documents\<project>` on Windows). Say **"set me up to connect on dev"** (or qa, or prod).

1. Claude runs `content-ops setup connect --env dev`. Without a key file it makes an empty one at
   `~/.content-ops/<project>/dev.env` (Windows: `C:\Users\<you>\.content-ops\<project>\dev.env`) and says where.
2. Open it in a text editor (Notepad on Windows), paste the values after the `=` signs, save, and say "done".
   Never paste them into chat.

   ```
   SITECORE_API_HOST=https://xmc-<tenant>-<env>.sitecorecloud.io
   SITECORE_CLIENT_ID=...
   SITECORE_CLIENT_SECRET=...
   SITECORE_EDGE_CONTEXT_ID=...   (optional)
   ```
3. Claude signs in, finds the site, reads its home page and tells you in plain words what it read. It writes
   `.content-ops/project.json` (project name, site root, home page, language, environment) and nothing else.
4. Ask for what you came to do. If you said it with the setup ("connect me to prod and list pages with no SEO
   title"), Claude goes straight on.

Production: a production key file is made only when you name production yourself. Reading is the same as on
dev; every production write says PRODUCTION and asks again.

The catalog (page types, components, fields) is not a setup step. The first command that needs it reads it from the
site, about a minute on a large site, read-only, and saves `.content-ops/catalog.json`. `catalog refresh --env <e>`
does a full pass later. A `Home/_blueprints` folder is optional.

## Optional, for the tech team

- **"copy the credentials from my .env.local for dev"** → `content-ops setup --from-env-local`, never printed.
  Prod only with `--prod`, by a developer.
- **Commit `.content-ops/`** (project name, site, knowledge, decisions) so colleagues share it; git-ignore
  `sources/`, `work/`, `runs/`. A colleague who gets the repo says "set me up to connect on dev" and the
  project's settings are reused; `content-ops setup join` makes empty key files for every non-production
  environment at once.
- **"set up content ops here"** with the setup questions (contacts, live-check site URLs, repo code paths).

## Many projects

- The engine and the plugin are installed once. Nothing project-specific lives in them.
- Each project folder has its own `.content-ops/` with its own name, knowledge and (once needed) catalog. The name is what keys `~/.content-ops/<name>/`.
- Credentials never collide: `~/.content-ops/projecta/dev.env`, `~/.content-ops/projectb/dev.env`.
- Switching projects is opening a different folder in Claude Code. The skills read `.content-ops/project.json` from the folder you are in and never remember another project's facts.
- Lessons a project learns stay in its `knowledge/`. `content-ops lessons export` bundles the shareable ones; a developer folds them into the plugin by pull request so every project benefits.

## Daily use (authors)

Plain English in Claude Code, in the project folder. The eight sentences from the session:

1. check the connection and tell me what page types we have (the first time, this builds the catalog)
2. make me an intake sheet for <page type> pages
3. plan it
4. apply this on dev
5. verify
6. undo the <slug> page on dev
7. which pages have <problem>? give me a report
8. what does this flag mean

Every Sitecore write asks first and restates environment and prod. Production needs a production credentials file; with it, the prompt says PRODUCTION and asks again.

## Windows

Same steps; the engine is Node, so paths and the home folder resolve the Windows way
(`C:\Users\<you>\.content-ops\…`). Notes:

- Claude Code on Windows needs Git for Windows; the plugin's two safety hooks are POSIX `sh` scripts and run
  through its Git Bash (`sh "<plugin>/scripts/…"`, so no executable bit is needed). `.gitattributes` keeps
  them LF even when git's `core.autocrlf` is on.
- Notepad may save the key file as `dev.env.txt` (setup connect spots it and says how to rename) or as UTF-16 /
  UTF-8 with BOM (the engine reads all of them).
- Run the `claude plugin …` install commands in Git Bash.
- Engine and hooks are tested on macOS; the Windows paths are covered by unit tests but not yet by a run on a
  Windows machine. The first Windows user: say "set me up to connect on dev" and report what it printed.

## Update the engine

Run `claude plugin marketplace update hztl-content-ops` and `claude plugin update sitecore-content-ops@hztl-content-ops`, and restart Claude Code. The engine updates with the plugin. Run `npm test` in the repo if you want proof.

## More

- One-page guide for colleagues: `plugin/ROLLOUT.md`.
- Training: `plugin/training/` (prerequisites, run-sheet, take-home card, deck source). Kit: `node plugin/scripts/build-session-kit.mjs <project-dir> <out.zip>`.
- Every command: `node plugin/engine/bin/content-ops.mjs` prints the usage; `README.md` has the table.
