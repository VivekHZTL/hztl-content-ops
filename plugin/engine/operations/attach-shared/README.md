# attach-shared

Point one top-level component on many pages at one shared datasource item, adding the component where a page
does not have it yet (after a component you name). Optionally repoint local copies of the block to the shared
item. If the shared item does not exist, the first run only creates it; apply, then plan again to attach.

## When to use

- One block of content on many pages from a single item (an "At a Glance" block on every article).
- Many pages each carry their own local copy of the same block, and the content team wants one item to edit.

## Inputs (args)

| Arg | Meaning |
|---|---|
| `pages` | page paths, or use `root` (+ `template`) |
| `component` | catalog component key (`content-ops catalog show`) |
| `shared` | `{ "path": "<site>/Data/Shared/At a Glance" }`, or `{ "parent", "name", "templateId", "fields" }` to create it |
| `after` | component key to insert after, when the page lacks the component |
| `replaceLocal` | `true` (default): repoint local copies to the shared item |

## Worked example

```bash
content-ops op plan attach-shared --env dev --args-file work/aag-args.json
content-ops apply --run <runId> --confirm dev
content-ops verify --run <runId>
content-ops publish --run <runId> --confirm dev
```

## What it learned

- On the reference project, 348 article pages got the same At a Glance item; 221 Find Care blocks moved from empty local copies to the
  shared item. Publishing must include the shared item under Data, so publish works from the site root.
- Repointing leaves the old local datasource items behind. Verify, then remove them with the cleanup skill
  (it refuses anything still referenced).
- Pages with personalization, more than one device, or renderings in the shared layout are held for review.
