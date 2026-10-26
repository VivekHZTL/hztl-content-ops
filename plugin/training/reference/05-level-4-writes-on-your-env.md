> Deeper material. Start with `00-before-the-session.md`, the live session, and the one-page guide (`ROLLOUT.md`).

# Level 4: writes on the practice copy (4 hours)

Now the tool writes. Only on the practice copy (dev), only pages the dry run marked ready, only after you
said so in your own words. Every write is written down first, read back, and can be undone.

Before you start: level 3 done, a fresh dry run from today, sources verified `ok`.

## Part 1: how a write works (20 min)

1. You say the environment and the pages. Claude restates: environment, host, prod yes/no, how many pages.
2. A pop-up appears before the command runs: "WRITE: content-ops apply on environment dev; prod: no".
   Read it. Accept only if it matches what you said.
3. For each page the tool re-reads it (skips as `stale` if someone changed it since the rehearsal), writes
   the journal, writes the items, reads everything back, and undoes the page by itself if anything is off.
4. Then it re-plans every written page. Expected answer: `up-to-date`.

Do: say the environment every time. Don't: say "yes" to a pop-up you did not expect.

## Part 2: create shells (30 min)

Pages that do not exist yet need a shell first. Only content marked `create` gets one.

Type: `Yes, create the page shells from run <runId> on dev.` Then: `Plan again on dev.` The new pages are now updates.

## Part 3: apply (60 min)

Type: `Yes, apply the ready pages from run <runId> on dev.`

Read the result: done, stale, rolled back, failed. Then the verify line: "up to date: N of N". Open two of
the pages in Pages and look.

### Exercise 4A

Apply the ready pages from your level-3 run (after creating shells), on a practice branch of the site a developer
names so fixture pages do not land among real ones. Pass: every page `done`, verify says all up to date, and you
can name one item the run created.

## Part 4: review and undo (60 min)

1. `Use the content-ops skill. Review page <key> against its deck.` Read the difference table. Expected: no
   differences except flags that were already pending.
2. Make a small change to one field in Pages yourself (a word in a heading). Then:
   `Yes, undo page <key> from run <runId> apply <applyId> on dev.`
   Read `problems`: your edited field is reported as changed since the run and left alone. That is the rule.

### Exercise 4B

Undo one page you did not edit. Pass: `restored: true`, no problems, and a fresh verify shows the page is
no longer up to date (because the content is back to how it was before).

## Check for level 4

You can explain: why a page comes back `stale`, what "rolled back" means, why undo left your hand edit alone,
and why nothing is published yet. Then open `06-level-5-prod-with-a-buddy.md`.
