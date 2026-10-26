# Dedupe and repoint references

**When:** two items exist for one real thing (duplicate location pages, a copy left by an old migration).

**Reference project:** 12 duplicate location pages consolidated: keeper chosen, its empty fields filled from the
duplicate, 43 references repointed, duplicates moved to a backup folder, later deleted after a zero-reference scan.

**Steps**
1. `scan`, then `refs --targets <duplicate ids>` to list every field that points at the duplicates.
2. Choose the keeper by a written rule (authored content wins, then live URL, then the older item id).
3. A project operation emits: `update` keeper fields, `update` every referencing field (id swapped, in multilists
   keep order), `move` the duplicate to a backup folder.
4. Verify, publish the referencing items and the keeper, then delete the backups later with the cleanup skill.

**Pitfalls**
- References hide in rich text (`~/link.aspx?_id=`), general links (`id="{...}"`), multilists and layout `s:ds`.
- Moving (not deleting) first keeps undo cheap while people check the result.
