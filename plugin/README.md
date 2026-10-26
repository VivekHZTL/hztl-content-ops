# sitecore-content-ops plugin

**Start here:** [ROLLOUT.md](ROLLOUT.md) is the one page a colleague reads before touching anything (what this is, where things live, ten minutes to first read, ten minutes to first safe write, roles, safety, how it learns, FAQ). The same page as a shareable artifact: https://claude.ai/artifact/K37VPs6Y6PohRvyvXn3zJD (private until shared). It is built from ROLLOUT.md by `node plugin/scripts/build-rollout.mjs`; a test keeps the two in step.

The author-facing part of `@hztl/content-ops`: skills that drive the engine CLI in plain words, two
read-only subagents, two slash commands, and hooks that keep authors inside the rules.

## Install

From the public repo (it is its own marketplace):

```bash
claude plugin marketplace add VivekHZTL/hztl-content-ops   # or a local clone's path when developing the plugin
claude plugin install sitecore-content-ops@hztl-content-ops
```

In the desktop app: **+ → Plugins**, add the marketplace, install `sitecore-content-ops`.

The engine ships inside the plugin at `engine/` and the skills run `${CLAUDE_PLUGIN_ROOT}/engine/bin/content-ops.mjs`.
Nothing to configure. `$CONTENT_OPS_BIN` is only a fallback for installs older than 0.1.2.

## Access

There are no roles. The control is which credentials files a developer puts on the machine. Authors get
`dev.env` and `qa.env`; `prod.env` is for a developer with a buddy. `setup --from-env-local` copies the three keys from a head app's `.env.local` into that folder (mode 600, never printed).

## Skills

| Skill | Role | Writes? |
|---|---|---|
| `content-ops` | router, ground rules, engine path | no |
| `content-ops-setup` | tech team project setup, catalog | config files only |
| `content-ops-sources` | register and verify source files | manifest only |
| `content-ops-intake` | sources → content JSON + inventory | work/ only |
| `content-ops-map` | confirm profiles and section maps | profiles, decisions |
| `content-ops-plan` | dry run and gates | runs/ only |
| `content-ops-apply` | gated apply and create | **Sitecore** |
| `content-ops-verify` | verify, live-check, publish, undo | **Sitecore** (publish, undo) |
| `content-ops-review` | one page vs its source | no |
| `content-ops-strategist` | suggestions as proposed decisions | decisions |
| `content-ops-inspect-code` | what a component accepts | no |
| `content-ops-template` | client intake sheet from the catalog | sources/ only |
| `content-ops-lessons` | lessons, remembered shapes, rule provenance, export | knowledge/ only |
| `content-ops-build` | build an operation when no command fits; playbooks | operations/ (Sitecore only via apply) |
| `sync-repo` | fetch + fast-forward only | git, forward only |

Agents: `deck-extractor` (LLM pass for decks the deterministic adapter cannot place), `content-reviewer`.
Commands: `/content-ops <words>`, `/migrate-page <source> env=<name>`.

## Operations and playbooks

When a task needs something no command does, Claude builds an operation in `.content-ops/operations/<name>/`
(`content-ops op new|plan|list|show`). Its build step only reads and returns change sets (`create`, `update`,
`rename`, `move`, `copy`, `delete`); the engine plans them, `apply` writes them with the journal, read-back and
auto-rollback, `verify`, `undo` and `publish` work as for pages. Built-in operations: `set-field`, `attach-shared`.
`knowledge/playbooks/` holds the patterns learned on the reference project.

## Hooks

- `safety-guard.sh` (PreToolUse Bash), for everyone: blocks Sitecore serialization push (exit 2 with the reason) and asks before recursive deletes (`rm -rf`, `find -delete`).
- `write-confirm.sh` (PreToolUse Bash): any `content-ops apply|publish|create|undo|delete apply|delete undo` becomes an explicit
  approval prompt that restates the environment and whether it is production; `setup --from-env-local` asks too, because it writes credentials outside the repo.

## Training

`training/` is one live session: `00-before-the-session.md`, `session-run-sheet.md`, `take-home-card.md`, `START-HERE.md` for the kit, and `deck/`. Build the kit with `node plugin/scripts/build-session-kit.mjs <project-dir> <out.zip>`. Deeper material (the old levels) is under `training/reference/` and the project repo's `docs/content-ops-training/reference/`.
`prompts/team-prompts.md` has copy-paste prompts per phase.

Phase E skills: `content-ops-transform` (export → rules or hand edits → plan → apply) and `content-ops-cleanup` (scan → refs → delete plan → apply → undo). The plan, apply and verify skills now publish HTML reports as artifacts, relink pending links, and show history.

Phase F1: `.content-ops/knowledge/` (remembered sheet shapes, project adapters, rule provenance, lessons), `catalog refresh|verify|show`, `template`, `mappings`, `rules`, `lessons`, `setup --from-env-local`, and `contacts` in `project.json`.
