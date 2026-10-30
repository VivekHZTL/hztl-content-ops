---
name: content-ops-intake
description: Turn the files in sources/ (workbooks, Word copy decks, legacy HTML, TSV lists) into content JSON and an inventory with questions grouped by owner. Use when someone says intake, inventory, what is in these decks, read the workbook, what is missing, questions for the client, or before a plan when work/ is empty or stale. Read-only; never touches Sitecore.
---

# Intake

Outcome: `work/<pageId>.json` per page, `work/inventory.json` with components used, flags by kind, and
questions for the client, the developers and us.

## Steps

1. Confirm sources are registered (`node <bin> sources verify`). Fix `changed`/`missing` first (content-ops-sources).
2. Ask which page type the sources describe (a key from `node "<bin>" catalog show --env <env>` `pageTypes`; it builds the catalog if there is none) and
   under which parent path new pages would sit. Defaults: ask; do not guess a parent path.
3. First run: `node <bin> intake --page-type <key> --parent-path <path>`. If the JSON has `proposed`
   entries, the run stopped on purpose: it wrote `work/profile.proposed.json` (workbooks) and/or
   `work/section-map.proposed.json` (decks). Hand them to content-ops-map for confirmation, then rerun
   with `--profile <confirmed file> --section-map <confirmed file>`. If `mappings[].reused` is true instead,
   say "this sheet shape was confirmed on <date> from <file>; no questions". The confirmed profile is remembered
   in `.content-ops/knowledge/mappings/`, so the same shape never asks twice.
4. Add `--sitemap <file>` when the client sitemap exists (xlsx with ID/Name/URL or a json) and
   `--env <name>` to resolve Page ID links against the practice environment (read-only).
5. Read `work/inventory.json`: `pages`, `byComponent`, `flags`, `questions` (owner, text, locator),
   `errors`, `proposed`, `mappings`, `adapters`.
6. A file no built-in reader accepts (`errors` says "no adapter"): look in `.content-ops/knowledge/adapters/`.
   If none fits and the format is regular (csv with odd delimiters, a JSON dump), write one there: an ESM file
   exporting `name`, `matches(file)` and `read(file, { catalog, rules })` returning `{ pages }` in content JSON,
   Node built-ins only. Then say: "I wrote a new reader at knowledge/adapters/<name>.mjs; a developer should
   look at it before we rely on it." Every page it produces is flagged `new-adapter` and will not be written
   until a developer removes the flag.

## Report (plain words)

- Pages produced, by source file.
- Components used, with counts.
- Flags by kind, one line each saying what the kind means (missing URL, placeholder copy, unmapped section…).
- Questions grouped: **client** (missing URLs, images, wrong Page IDs, suspect links), **developers**
  (unmapped sections, unsupported variants, pages not built yet), **us** (confirmations, dev notes).
  Quote the locator on every line.
- Errors (duplicate page ids, unreadable files).

## Do / Don't

- Do run intake again after any source changes; it is cheap and read-only.
- Do record confirmed mappings and client answers as decisions (`node <bin> decide …`).
- Do draft a lesson after any confirmation (content-ops-lessons).
- Don't fix copy, invent URLs, or drop a flagged value. Flags are the deliverable.
- Don't read `work/*.json` wholesale into the conversation; summarise from inventory and open one file when asked.
