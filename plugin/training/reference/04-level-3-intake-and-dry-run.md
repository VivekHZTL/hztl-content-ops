> Deeper material. Start with `00-before-the-session.md`, the live session, and the rollout page.

# Level 3: intake and dry run (4 hours, practice copy only)

You will take real files, turn them into content the tool understands, and rehearse the changes without
writing anything. Nothing in this level changes Sitecore.

Before you start: the plugin is installed (a developer did `claude plugin install`), the repo is synced
(`/sync-repo` or "sync the repo"), `.content-ops/` exists in the project, and a developer put your
`dev.env` in place. Check with: `Use the content-ops skill. Run check for dev.`

## Part 1: words you will meet (20 min)

| Word | Means |
|---|---|
| Source | A file content comes from: deck, workbook, sheet, old web page |
| Intake | Reading all sources and listing what is there, what is missing, what to ask |
| Profile | The table that says which workbook column goes into which component field |
| Section map | The table that says which deck heading is which component, and which label is which field |
| Plan, dry run | A rehearsal: every change the tool would make, written to a report. Nothing changes. |
| Pending | Something the tool could not place or decide. Each pending line says what to do next. |
| Needs review | A page the tool refuses to touch, with the reason. |
| Locator | Where a value came from: `'Clinics'!C3`, `deck line 85` |

## Part 2: register sources (20 min)

1. Download the workbook or decks you were given into `sources/`.
2. Type: `Use the content-ops skill. Register the files in sources/ with the note "<where from, version>", then verify them.`
3. Read the answer. Each file has a short code (the hash). That code is how the tool knows the version.

Do: re-register after every new download. Don't: paste a SharePoint link and expect it to work.

## Part 3: intake and mapping (90 min)

1. Type: `Use the content-ops skill. Run intake for page type <key> under <parent path>. Read only.`
   (A developer tells you the page type key and the parent path the first time.)
2. First time, it stops and shows a proposed mapping. Go through it with Claude, one column or one heading
   at a time. Say "yes", or say which component and field it should be. Unknown headings stay "other" and
   become a question for the developers.
3. Claude saves the confirmed mapping and records your confirmation as a decision. Then it reruns intake.
4. Read the inventory: pages, components used, flags, and questions by owner. The client questions are
   yours to send; the developer questions go to the team channel.

Do: answer each question with the locator so the client can find the cell. Don't: fix copy yourself.

### Exercise 3A

Using the two fixture files from the plugin repo (`test/fixtures/workbook2.xlsx`, `test/fixtures/deck.docx`)
copied into `sources/`: run intake, confirm the proposed profile and section map, and produce the inventory.
Pass (shape, not exact numbers: your project's catalog decides how many columns map): pages appear in `work/`,
there is a `missing-url` client question that cites a sheet cell, and an `unmapped` developer question about
"Mystery Block". If the proposed mapping maps nothing, that is a finding about the catalog, not about you.

## Part 4: dry run (60 min)

1. Type: `Use the content-ops skill. Plan on dev for everything in work/. Show me the counts, the needs-review pages with reasons, and every pending item with its locator. Nothing is written.`
2. Read the four counts: ready, up-to-date, needs-review, no-match. Then the gates.
3. Ask: `Show me page <key> from that run.` Read the components before and after, and the number of field updates.

### Exercise 3B

Plan the three pages from 3A. Expected: the pages whose target path does not exist on dev are `no-match`
(that is correct: they do not exist yet). Say which pending categories you see and what each means.

## Check for level 3

You can explain, in your own words: what a locator is, why intake stopped the first time, what
`needs-review` means, and why nothing was written. Then open `05-level-4-writes-on-your-env.md`.
