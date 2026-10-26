# Install and use Content Ops

One plugin per machine (the engine ships inside it). One `.content-ops/` folder per project. One credentials file per project per environment.

## Once per machine (developer or author)

1. Claude Code, git and Node 22 or newer.
2. Register the plugin from the public repo (no GitHub account needed):

   ```bash
   claude plugin marketplace add VivekHZTL/hztl-content-ops
   claude plugin install sitecore-content-ops@hztl-content-ops
   ```

   Offline or no git access: unzip a copy, then `claude plugin marketplace add ./` from inside that folder (keep it; updates install from it).
   Working on the plugin itself: clone the repo and add the clone's path instead, so your edits are what you run.


Restart Claude Code. In any folder, typing `/content-ops` or saying "content ops" now routes to the skills.

## Once per project (developer, about ten minutes)

In Claude Code, open the project repo and say:

1. **"set up content ops here"** → `.content-ops/project.json` and `knowledge/` are created from your answers (site root, home path, environment names, contacts).
2. **"copy the credentials from my .env.local for dev"** → `~/.content-ops/<project>/dev.env`, mode 600, never printed. Repeat for qa. Prod only with `--prod`, by a developer.
3. **"check the connection"** → `credentials: ok`, `connection: ok`.
4. **"build the catalog"** → page types, components and fields, read from one real page per template on the site. A `Home/_blueprints` folder (one page per template, every component once) is optional and makes the catalog complete on day one.
5. Commit `.content-ops/` (including `knowledge/`). Git-ignore `sources/`, `work/`, `runs/`.

## Once per person on a project that is already set up (anyone, five minutes)

Get the repo (clone, pull, or unzip), open it in Claude Code and say **"set up content ops for this project"**.
The setup skill sees `.content-ops/` is already there and joins instead of starting over: it runs
`content-ops setup join`, which makes `~/.content-ops/<project>/` with an empty placeholder `<env>.env` for each
non-production environment and lists what is still missing (engine path, catalog, .gitignore). Paste the three
values your developer gives you into the placeholder in a text editor (never into chat), save, and say
**"check the connection"**. Production placeholders only with `setup join --prod`, run by a developer.

## Many projects

- The engine and the plugin are installed once. Nothing project-specific lives in them.
- Each project repo has its own `.content-ops/` with its own name, catalog and knowledge. The name is what keys `~/.content-ops/<name>/`.
- Credentials never collide: `~/.content-ops/projecta/dev.env`, `~/.content-ops/projectb/dev.env`.
- Switching projects is opening a different folder in Claude Code. The skills read `.content-ops/project.json` from the folder you are in and never remember another project's facts.
- Lessons a project learns stay in its `knowledge/`. `content-ops lessons export` bundles the shareable ones; a developer folds them into the plugin by pull request so every project benefits.

## Daily use (authors)

Plain English in Claude Code, in the project folder. The eight sentences from the session:

1. check the connection and tell me what page types we have
2. make me an intake sheet for <page type> pages
3. plan it
4. apply this on dev
5. verify
6. undo the <slug> page on dev
7. which pages have <problem>? give me a report
8. what does this flag mean

Every Sitecore write asks first and restates environment and prod. Production needs a production credentials file; with it, the prompt says PRODUCTION and asks again.

## Windows

Same steps. Paths use your user folder (`C:\Users\<you>\.content-ops\…`). Claude Code on Windows needs Git Bash installed; the plugin’s two hooks are plain shell scripts and run under it. Not yet tested on Windows by the team; the first Windows user should say "check the connection" in a set-up project and report.

## Update the engine

Run `claude plugin marketplace update hztl-content-ops` and `claude plugin update sitecore-content-ops@hztl-content-ops`, and restart Claude Code. The engine updates with the plugin. Run `npm test` in the repo if you want proof.

## More

- One-page guide for colleagues: `plugin/ROLLOUT.md`.
- Training: `plugin/training/` (prerequisites, run-sheet, take-home card, deck source). Kit: `node plugin/scripts/build-session-kit.mjs <project-dir> <out.zip>`.
- Every command: `node plugin/engine/bin/content-ops.mjs` prints the usage; `README.md` has the table.
