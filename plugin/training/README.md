# Training

The entry path is one live session, not a ladder.

1. **Before the session**: `00-before-the-session.md` (Claude 101, two short videos, install the app, try one sentence).
2. **The session**: ninety minutes, eight sentences. Facilitator: `session-run-sheet.md`. Participants: the kit (`START-HERE.md`) or their own project folder, plus a dev or qa credentials file handed out in person.
3. **After**: `take-home-card.md` and the one-page guide, `../ROLLOUT.md`.

The deck lives in `deck/`; its `project/` files are the source.

Build a session kit from any set-up project: `node plugin/scripts/build-session-kit.mjs <project-dir> <out.zip>`. It never includes `.env*`, keys, `node_modules`, `runs/`, `work/`, client source files or anything a symlink points at, and it prints what it refused.

`reference/` holds the deeper material (levels 3 to 5). Levels 0 to 2 live in the project repo under `docs/content-ops-training/reference/`. `../prompts/team-prompts.md` has copy-paste prompts per phase.
