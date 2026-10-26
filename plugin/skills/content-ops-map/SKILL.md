---
name: content-ops-map
description: Confirm how source structure maps to Sitecore components - a workbook profile (column to component field) or a deck section map (heading alias to component, label to field). Use when intake wrote a proposed profile or section map, when someone asks which column goes where, why did this column get ignored, map this header, or wants to add an alias. Records confirmations as decisions.
---

# Mapping

The engine proposes; a person confirms. Nothing is written to Sitecore here.

## Workbook profile

1. Open `work/profile.proposed.json` (it is keyed by source file). For each column show a table:
   column, header, group, proposed target, confidence (`exact`, `fuzzy`, `none`), why.
2. Walk the `fuzzy` and `none` rows with the author. Targets they can choose: `key`, `page.<field>`,
   `component.<key>.<field>`, `child.<childKey>.<n>.<field>` (`n` = panel/card number, or `row` for one
   child per row), `pair` (the URL column for the link in the previous column), `note`, `ignore`.
   Use content-ops-inspect-code when a field name is unclear.
3. Save the confirmed profile as `.content-ops/profiles/<workbook-name>.json` (one profile object, or
   the map keyed by source file as written). Record the confirmation:
   `node <bin> decide --scope mapping --decision "<file>: <summary of changed columns>" --reason "<why: e.g. header wording, client email of <date>>" --who "<name>"`.
4. Rerun intake with `--profile <that file>`. That run remembers the sheet shape in
   `.content-ops/knowledge/mappings/`; `node <bin> mappings list` shows it, `node <bin> mappings forget <fingerprint>` drops a wrong one.

## Deck section map

1. Open `work/section-map.proposed.json`: `aliases` (heading → component), `fields`, `childFields`,
   `unmatched` (headings that matched nothing).
2. For each unmatched heading ask: which component is this, or is it genuinely new (then it stays
   `other` and goes to the developers as a question).
3. Save as `.content-ops/profiles/section-map.json`, record the decision, rerun intake with `--section-map`.

## Rules

- Never map a column to a field that is not in the catalog; the planner refuses it anyway.
- When explaining why a value was flagged, show the rule and its provenance from `node <bin> rules list`.
- A link needs two columns (text, URL) or a single URL; words in a URL column are flagged, not fixed.
- When two sources disagree on a mapping, keep both profiles; do not merge by hand.
