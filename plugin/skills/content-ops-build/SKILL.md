---
name: content-ops-build
description: When a Sitecore content task needs something no content-ops command already does - a shared datasource, records under Data, renaming or moving items, swapping a page's content, repointing references, redirects, unpublishing, a new sheet shape - work out the solution and build it as a governed operation (read-only build step that proposes change sets; the engine plans, applies with a journal, verifies and undoes). Use when someone describes a new kind of change, asks "can we do X across these pages", or a dry run says needs-review for a reason no rule covers. Never write to Sitecore outside the engine.
---

# Build what the task needs, under the same gates

The plugin does not limit what can be done in Sitecore. It decides how it is done: every write is planned,
confirmed, journaled, read back, undoable and published separately. When the ask needs something new, you build
it as an **operation** and the engine runs it like any built-in command.

## 1. Understand the ask

Restate it in one or two sentences with the success test ("348 article pages show the shared At a Glance block,
published, verified on the site"). Name the environment. If the scope is unclear, ask one question.

## 2. Look before building, in this order

1. Commands (`node "<bin>"` with no args prints them) and the page planner (decks, sheets → pages).
2. Project operations: `node "<bin>" op list`, then `op show <name>`. Extending one beats writing a new one.
3. Built-in operations (`set-field`, `attach-shared`) in the same list.
4. Playbooks: `${CLAUDE_PLUGIN_ROOT}/knowledge/playbooks/README.md`, then the one that matches.
5. Project lessons: `node "<bin>" lessons list`.
Say what you found and what you will reuse.

## 3. Probe the real items, read-only

`snapshot --path <item>` for one or two real examples, `scan --root <item>` for a tree, `refs` for references.
Copy exact field value shapes (links, images, layout `s:ds`) from a good item. Never guess a template id or a
field name.

## 4. Build or extend the operation

`node "<bin>" op new <name> --description "<what>" --when "<the ask that needs it>"`, then write
`.content-ops/operations/<name>/build.mjs`:

- `build(ctx)` reads (`ctx.cm.getItem`, `ctx.cm.query`, `ctx.readSource`) and **returns change sets**. It cannot
  write; every write method throws.
- A change set is the unit of apply and undo (usually one page or one item):
  `{ key, title, itemId?, path?, reasons?, ops: [...] }` with ops `create`, `update`, `rename`, `move`, `copy`,
  `delete` (recycle bin). `{{new:<ref>}}` in a value points at an item created earlier in the same set.
- Put a reason in `reasons` instead of guessing; the set is then held for review.
- Skip items that are already right; keep project facts (paths, template ids, shared item ids) in `args` or
  `.content-ops/knowledge/rules.json`, not in code.
- `ctx.helpers`: `layout` (parse, build, newEntry, placeholderFor, layoutGuards), `ids`, `values`, `xlsx`,
  `docxToText`, `htmlToBlocks`, `parseCsv`. Node built-ins only, no packages.

## 5. Dry run, pilot, scale

`op plan <name> --env <env> --args '<json>'` → `show --run <id>` and read the changes with the person. Then the
normal gates: `apply --run <id> --pages <one key> --confirm <env>` for a pilot, `verify`, check the page, then the
rest, `publish` as its own yes, `live-check`. Undo is `undo --run <id> --apply <applyId> --page <key>`.

## 6. Record so the next person starts ahead

- Fill the operation's `README.md`: inputs, a worked example, and "What it learned" (every pitfall you hit).
- `lessons add` for anything a future run must know; `decide` for choices someone made.
- If the operation would work on any Sitecore project with no edits beyond `args`, say so and add a promotion note
  (`lessons add --applies all`); a developer moves it into the plugin by pull request.

| What | Where |
|---|---|
| Project facts | `project.json`, `knowledge/rules.json`, operation `args` |
| A reusable procedure | `.content-ops/operations/<name>/` (committed) |
| Something learned | `knowledge/lessons.md`, the operation README |
| A pattern for every project | promotion note → plugin playbook or operation |
| A person's preference | your memory, never project facts |

## Never

- Write to Sitecore from a script, `curl` or a raw mutation outside the engine.
- Skip the dry run or the pilot because the change "is simple".
- Copy another project's ids or hosts into this one.
