# set-field

Set, or regex-replace, one field on many items, by a list of paths or by walking a root item (optionally only
one template). Works on pages, datasources and records under Data, anywhere under the site root.

## When to use

- Fill one image field everywhere it is empty (a hero background on every landing page).
- Normalise a value (add `+1` in front of phone numbers) on pages and on department records.
- Set a checkbox on a list of pages (hide them from the sitemap).

## Inputs (args)

| Arg | Meaning |
|---|---|
| `paths` | item paths to change, or use `root` |
| `root` | walk this item and everything under it |
| `template` | only items of this template, by name or id |
| `field` | field name (required) |
| `value` | the new value |
| `replace` | `{ "pattern": "^(\\d)", "flags": "", "with": "+1 $1" }` instead of `value` |
| `onlyEmpty` | `true`: only where the field is empty |
| `limit` | stop walking after this many items (default 5000) |

## Worked example

```bash
content-ops op plan set-field --env dev --args '{"root":"<site>/Data/Departments","template":"Department","field":"Phone","replace":{"pattern":"^(?!\\+1)","with":"+1 "}}'
content-ops show --run <runId>
content-ops apply --run <runId> --confirm dev
content-ops verify --run <runId>
```

## What it learned

- On the reference project, 249 location pages and 282 department records needed `+1`; the records live under Data, outside Home,
  so they also need publishing from the site root (the engine allows that).
- Image fields hold the DAM JSON or `<image mediaid=...>`; copy the exact value from one good item with `snapshot`
  before setting it everywhere.
- Hiding a page is a field change; also check nothing links to it (`refs`) and whether it needs a redirect.
