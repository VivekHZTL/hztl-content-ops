---
description: Intake, mapping check and dry run for ONE source (a deck, a workbook row set, or a legacy page), then stop for approval
argument-hint: <source file in sources/ | legacy URL> env=<name> [page-type=<key>] [parent=<item path>]
---

Load the `content-ops` skill and follow its ground rules. Arguments: $ARGUMENTS

1. Read the source argument. A file under `sources/`: register it if `sources verify` does not list it.
   A legacy URL: ask the user to save the page's HTML into `sources/` (fetching the live site has rules
   that content-ops-verify explains) and stop until they have.
2. Read `env=`; without it ask which environment and wait. Read `page-type=` and `parent=`; without them ask.
3. Run content-ops-intake for that one source (`--sources` pointing at a folder holding only it, or
   `--pages` on the plan). If intake stops with a proposed profile or section map, run content-ops-map and
   rerun intake.
4. Run content-ops-plan on the produced content. Present counts, gates and pending items with locators.
5. Stop. Do not apply, create, publish or undo, even if the arguments ask. Wait for the user's OK in their
   own words, naming the environment and the pages; then content-ops-apply takes over.
