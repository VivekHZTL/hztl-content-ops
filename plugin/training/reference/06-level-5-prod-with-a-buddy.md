> Deeper material. Start with `00-before-the-session.md`, the live session, and the rollout page.

# Level 5: production, with a buddy (2 hours plus a real batch)

Production is the live website. The rules are the same as dev, plus three more: a developer sits with
you the first time, one page goes first, and publishing is a separate yes.

Before you start: a developer put `prod.env` on your machine (you will not see its contents), a fresh
dry run on production exists, and the client has signed off the content.

## The sequence

1. `Use the content-ops skill. Run check for production.` Read: host, isProd true, credentials ok.
2. Dry run on production. Read every gate. Anything `needs-review` stays out.
3. Canary: `Yes, apply page <key> from run <runId> on production as the canary.`
   Open the page in Pages with your buddy. Read every component. Only then:
4. `Looks right. Apply the rest of run <runId> on production.` Read the counts and the verify line.
5. Publish, as its own step: `Dry-run the publish for run <runId> on production and show me the roots.`
   Then: `Yes, publish run <runId> on production.`
6. Live check after a few minutes: `Live-check these paths on production: /a, /b.`
   A 404 with "cached 404" in the note is not missing content; wait and retry.
7. Log one learning with Claude: what surprised you, if anything.

## Do / Don't

| Do | Don't |
|---|---|
| Say "production" in every write | Say "yes" to a pop-up that names a different environment |
| Canary first, always | Apply the batch before you looked at the canary |
| Publish linked pages before the pages that link to them | Request a brand-new page on the site before it is published |
| Stop on the first surprise and show the evidence | Re-run a failed write |

## Check for level 5

A real production batch done with your buddy watching: canary, batch, verify, publish, live check, learning
logged. After that you run production batches with the buddy on call, not in the room.
