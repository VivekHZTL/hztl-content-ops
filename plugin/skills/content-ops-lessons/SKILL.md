---
name: content-ops-lessons
description: Record and read what this project taught the tool - lessons, remembered sheet shapes, rule overrides - and bundle the shareable ones for the plugin owners. Use when someone says remember this, lesson, what have we learned, why does it map like that, note for next time, export lessons, or right after a confirmation, override or new reader was accepted. Writes project files only.
---

# Lessons

What the project learned lives in `.content-ops/knowledge/`: `lessons.md` (plain words), `mappings/`
(remembered sheet shapes), `rules.json` (why this project differs), `adapters/` (readers written for
odd client files). It is committed with the project. Nothing in it reaches other projects by itself.

## When to write a lesson

Right after: a person confirmed a proposed mapping; a flagged value was accepted as correct; a rule
override was set; a new adapter was written; something surprised you. Draft it, show it, append on yes:

`node <bin> lessons add --area <intake|map|plan|apply|verify|review> --title "<one line>" --body "<what happened, what it means, what to do next time>" --applies <this|all>`

`--applies all` only when the lesson has nothing client-specific in it. Plain words: no item ids, no
secrets, no client copy. The command refuses those.

## Reading

- `node <bin> lessons list --last 10` at the start of a session; say in one line what the project knows.
- `node <bin> mappings list`: remembered sheet shapes with their source file and date. `node <bin> mappings forget <fingerprint>` when a shape was confirmed wrong.
- `node <bin> rules list`: every rule with `provenance` (`default`, `project`, `merged`) and `why`.
  `node <bin> rules set <key> '<json>' --why "<reason>"` to change one for this project.
- `node <bin> lessons check` says whether `lessons.md` was edited by hand since the last add; after a review, `node <bin> lessons check --accept`.

## Sharing (developers)

`node <bin> lessons export` writes `.content-ops/export/lessons-<project>-<date>.md` with the lessons
marked for all projects, the headers of remembered shapes (never the data), and rule overrides. A
developer opens a pull request against the plugin repo with it. Nothing is merged automatically.

## Do / Don't

- Do write the lesson the same day; the locator and the reason fade fast.
- Don't rewrite old entries; add a new one that says what changed.
- Don't put GUIDs, hosts, or anything from an `.env` file in a lesson.
