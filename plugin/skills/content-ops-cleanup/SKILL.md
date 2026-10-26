---
name: content-ops-cleanup
description: Find and remove leftover items (old Data folders, test copies, parked pages, backup nodes) safely - scan the tree, find every reference, plan deletes that refuse referenced items, delete to the recycle bin with a journal, prove zero references, undo if needed. Use when someone says clean up, delete the old items, remove the test pages, what references this, is it safe to delete.
---

# Clean up leftover items

Deletes are the most expensive mistake to undo, so every step before `delete apply` is read-only and
everything deleted goes to the recycle bin with a journal.

## Steps

1. `node <bin> scan --env <env> [--root <path>]`: a read-only snapshot of the subtree (tree and field values).
   Minutes for a whole tenant; say so. Note the `file`.
2. Agree the candidates with the user: item paths. Then `node <bin> refs --scan <file> --targets <a>,<b>`.
   For each: `external` references (from path, field, how). Anything referenced from outside its own subtree
   must be relinked or unlinked first; list the referrers in plain words.
3. `node <bin> delete plan --scan <file> --paths <a>,<b>`. Read `deletable` (with subtree sizes) and `blocked`
   (with referrers). The plan refuses Home and anything outside the home path by itself.
4. Restate: environment, host, prod yes/no, how many items and how many descendants, what stays blocked.
   Ask for the OK in the user's own words naming the environment and the items. On prod, one item first.
5. `node <bin> delete apply --plan <plan file> --confirm <env> [--prod]`. Each item is re-read first and skipped if
   its path, children or last-updated changed since the plan. Read `deleted`, `skipped`, `failed`, `journal`.
6. Prove it: a fresh `scan` and `refs` on the deleted paths' former referrers should show nothing left; the items
   themselves are gone from the tree.
7. Say plainly: items are in the recycle bin, nothing is published. The site keeps showing them until the
   parent is published; that is content-ops-verify's publish step, with its own OK.

## Undo

`node <bin> delete undo --journal <journal file> --confirm <env> [--prod]` restores every deleted root from
the recycle bin. Read `restored` and `problems`.

## Never

Delete permanently, delete Home, delete outside the home path, delete something `refs` shows is referenced from
outside, or re-run a failed delete without reading the journal.
