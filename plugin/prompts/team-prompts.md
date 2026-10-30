# Team prompts

Copy one, fill in every `<…>`, paste it into the Code tab at the project root. Approvals are always your
own words in the chat, naming the environment and the pages.

## 1. First time on a project (tech team)

> Use the content-ops skill. Connect me to `<env>`: make the key file if it is missing and tell me where it is
> (I will fill it myself), sign in, read the home page and tell me what you found. Read only until I say
> otherwise.

## 2. New files arrived

> Use the content-ops skill. I downloaded `<file names>` into sources/. Register them with the note
> "<version, sender, date>", verify the sources, then run intake for page type `<key>` under
> `<parent item path>`. If it proposes a profile or section map, walk me through confirming it column by
> column. Do not write to Sitecore.

## 3. Show me what would change

> Use the content-ops skill. Plan on `<env>` for everything in work/ (or only pages `<a, b>`). Give me the
> counts, every needs-review page with its reasons, every pending item with its sheet cell or deck line,
> and stop. Nothing is written.

## 4. Write it (only after you read the plan)

> Yes, apply the ready pages from run `<runId>` on `<env>`.

For production:

> Yes, apply page `<key>` from run `<runId>` on production as the canary.

then, after you looked at it in Pages:

> Looks right. Apply the rest of run `<runId>` on production.

## 5. Check it

> Use the content-ops skill. Verify run `<runId>` apply `<applyId>`, then review page `<key>` against its
> deck and give me the differences with locators.

## 6. Publish (its own OK)

> Use the content-ops skill. Dry-run the publish for run `<runId>` on `<env>` and show me the roots.

then:

> Yes, publish run `<runId>` on `<env>`.

## 7. Undo one page

> Yes, undo page `<key>` from run `<runId>` apply `<applyId>` on `<env>`.

## 8. Something looks wrong

> Stop all writes. Read only. Show me what the engine did for page `<key>` in run `<runId>`: the show output,
> the verify result, and the journal status. Do not re-run anything. Log what we find as a learning.

## 9. Strategy pass

> Use the content-ops skill. Give me the strategist pass on the current intake: placements for the legacy
> pages, component fit problems, SEO lengths, duplicates and gaps, as proposed decisions. Change nothing.
