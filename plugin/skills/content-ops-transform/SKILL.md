---
name: content-ops-transform
description: Sitecore-to-Sitecore bulk changes - export existing pages to content JSON, apply named rich-text rules (strip images from a host, unwrap an anchor, rewrite hrefs, replace text) or edit the content by hand, then dry run and apply through the normal gates. Use when someone says bulk update, change this on every page, strip the old images, remove that link everywhere, rewrite legacy URLs, update existing pages from Sitecore itself.
---

# Transform existing pages

The source is Sitecore. Export turns pages into content JSON that plans as `up-to-date`; you change the
content; plan shows exactly what differs; apply writes it with the journal, read-back and rollback.

## Steps

1. Agree the page set. Get item paths (from a scan, a list, or the user). Read-only until step 5.
2. `node <bin> export --env <env> --paths <a>,<b>`. Read `written`, `notes` (shared datasources and unknown
   renderings are listed, not exported; they are never changed by this flow) and `missing`.
3. Choose the change:
   - **Named rules**: write a rules file with the user, for example
     `[{ "rule": "strip-images", "components": ["richText"], "fields": ["text"], "hostPattern": "/-/media/" },
       { "rule": "unwrap-anchors", "components": ["richText"], "fields": ["text"], "text": "<anchor text>" },
       { "rule": "rewrite-hrefs", "components": ["richText"], "fields": ["text"], "rules": [{ "match": "^https://old\\.example/(.*)$", "replace": "/$1" }] }]`
     then `node <bin> transform --rules <file>`. Read `files`, `changes`, and `work/transform-log.json`.
     Every changed field now carries a `confirm` flag naming the rule.
   - **Hand edits**: edit `work/<page>.json` with the user watching (or let them edit) and explain each field changed.
4. `node <bin> plan --env <env> --content work/`. `show --run <id> --page <key>` for a sample: the field table is the
   before/after diff the user must read. Pages with no change come back `up-to-date`.
5. Hand over to content-ops-apply (restate, OK in their words, canary on prod, verify). Then content-ops-verify for
   publish.

## Rules

- Never edit `sources/`; this flow has no source files, Sitecore is the source.
- Shared datasources are out of scope (notes say so). Changing one changes every page: a developer does that deliberately.
- A transform that changes hundreds of fields still goes page by page through apply; the failure budget stops it early.
- Log a learning when a rule needed a hand fix: the rule is probably too narrow or too wide.
