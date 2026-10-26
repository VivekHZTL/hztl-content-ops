# Session run-sheet (facilitator), ninety minutes

One trainer, up to eight authors, each on their own laptop with the kit or their own project folder open in Claude Code. Dev or qa credentials only, handed out in person. Prod is never in the room.

Before the room fills: `content-ops check --project <name> --env dev` on your own machine must say `connection: ok`. Have the rollout page and the deck open. Have the catalog built and committed in the kit project (`content-ops catalog build --env dev`; blueprints optional).

Every block below has the same shape: what you type, what the room watches for, what to do if the output differs, one Do, one Don't, and the slide numbers.

## 1. Open, place, type (0–10 min)

You type: nothing yet. Everyone unzips (or opens their folder), opens it in Claude Code, places the env file at the path you read out.
Expected: Claude Code shows the folder. `START-HERE.md` is visible.
If it differs: a wrong path for the env file is the usual cause; read the path again, slowly, and check for a stray space.
Do: say out loud that the env file never goes inside the project folder.
Don't: let anyone paste the env file's contents into chat.
Slides: 1–4 (title, no more manual authoring, your job moves up, driver’s seat).

## 2. Ask first, read-only (10–20 min)

You type: **check the connection and tell me what page types and components we have**
Behind it: `content-ops check --project <name> --env dev`, then `content-ops catalog show`.
Expected: `credentials: ok`, `connection: ok`, then a table of page types and components. No confirmation prompt appeared.
If it differs: `credentials: missing` means the env file path is wrong; `credentials: incomplete` means a line in the file was mistyped (three keys, no quotes needed); `connection: failed` means the host or the tenant is wrong, show the message, it never contains the secret. Move on with the catalog only; it needs no connection.
Do: point out that nothing asked for permission because nothing wrote.
Don't: explain GraphQL. "It asked Sitecore a question" is enough.
Slides: 5–7 (it knows your project, just say it, ask it anything).

## 3. The sheet we hand clients (20–35 min)

You type: **make me an intake sheet for <page type> pages**
Behind it: `content-ops template --page-type <key>`.
Expected: a spreadsheet in `sources/`, two tabs, columns that are exactly the fields of that page type, a README tab. Claude says `mappedExact` equals the column count.
If it differs: a `skipped` entry is a component with no fields, that is fine. An error about field names means the catalog needs a developer; show the error, use the prepared template in the kit.
Do: open the sheet and read the README tab aloud. This is the client's instruction sheet.
Don't: type content into the template file itself.
Slides: 9 (reports and sheets).

## 4. Plan, then apply (35–55 min)

You type: fill two rows with made-up content in a copy of the sheet, using the slugs of two **existing** dev pages the trainer names (a slug that does not exist plans as `no-match` and nothing is written), drop it in `sources/`, then **plan it**
Behind it: `content-ops intake --page-type <key> --parent-path <path>`, `content-ops plan --env dev --content work/`.
Expected: a dry-run report. Pages `ready`, the field changes listed, nothing written. A `no-match` page means the slug is wrong; fix the slug and plan again.
You type: **apply this on dev**
Expected: Claude restates the environment name, the host, prod no, and the page count in chat, then the short approval prompt appears (environment and prod only). You answer in your own words: *yes, apply the 2 pages on dev*.
Behind it: `content-ops apply --run <id> --confirm dev`.
If it differs: a `needs-review` page is the tool refusing to guess; read the reason together. If the prompt does not appear, stop and say so; that is a bug, not a shortcut.
Do: read the confirm prompt line by line. This is the one prompt that matters.
Don't: type `--confirm` or `--prod` yourself, ever.
Slides: 8 (mass updates: plan, apply, verify, undo).

## 5. Verify, undo (55–65 min)

You type: **verify**
Behind it: `content-ops verify --run <id>`.
Expected: every written page `up-to-date`.
You type: **undo the <slug> page on dev** (one page per undo; name it)
Behind it: `content-ops undo --run <id> --apply <id> --page <key> --confirm dev`, after the same kind of prompt.
Expected: the page restored to the journaled values; the output lists anything it left alone under `problems`. Then **verify** again to see it.
If it differs: a page not `up-to-date` means someone else edited it in between; show the drift, do not force anything.
Do: show that undo asked first too.
Don't: skip verify to save time. It is the proof.
Slides: 8 again.

## 6. Questions beat typing (65–75 min)

You type: **which <page type> pages have an empty SEO title? give me a report**
Behind it: `content-ops scan --env dev`, then an analysis Claude writes from the scan file (a field missing from a page's fields is empty).
Expected: a list with paths and counts, no write, and a short report page Claude writes and opens as an artifact.
If it differs: a slow scan on a big site is normal; narrow it with `--root <path>`.
Do: ask the room what else they would ask. Collect three.
Don't: let the demo become a bulk fix. Analysis today, fixes another day.
Slides: 7 (ask it anything).

## 7. More places words come from (75–85 min)

Use whichever connector is working on your machine. Skip the demo and show only the slide if neither is.
Figma variant. You type: **pull the copy from this frame into an intake sheet** with the frame link.
Expected: Claude reads the frame text and fills the template columns it can match, flagging the rest.
Jira variant. You type: **list the open content tickets for this sprint and which pages they touch**.
Expected: a table from Jira, no Sitecore call.
If it differs: a connector that asks to sign in is the person's own account; never sign in for them.
Do: say that connectors are sources, and sources always go through the same plan step.
Don't: write to Figma or Jira in the session.
Slides: 5 (Figma and Jira).

## 8. How to read an answer (85–90 min)

You type: nothing. Show the dry-run report from block 4 again.
Expected: the room can point at a flag, a needs-review reason and an "I am not sure" line without help.
If it differs: someone cannot tell a flag from an error; go back to block 4's report and read one flag line together.
Point at: a flag (what the client must answer), a `needs-review` reason (what the tool refused), a line where Claude says it is not sure.
Say: your job from tomorrow is to read these, decide, and ask good questions. The typing is done.
Do: hand out the take-home card and the rollout page link.
Don't: end with a list of commands. End on the three rules and the driver’s-seat line.
Slides: 10–11 (three rules, let’s see it).

## If the room gets ahead

Extra sentences that are safe at any point: *what does this flag mean*, *show me the plan for just the first page*, *what would undo do right now*, *what have we learned on this project* (`content-ops lessons list --last 10`).
