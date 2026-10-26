# Relink before delete

**When:** clean-up of old folders, test copies or parked pages that something still points at.

**Reference project:** a 34,601-item scan; 127 old Data folders and 392 test-copy items deleted safely; 101 items
relinked first; a register kept of links that could not be relinked (specialty tags with no replacement).

**Steps**
1. `scan` the site root; `delete plan --scan <file> --paths <candidates>`; read what is blocked and why.
2. For each blocked item, decide: relink to a replacement, remove the reference, or keep the item. Write the
   decisions to a sheet in `sources/`.
3. A project operation turns the sheet into `update` change sets on the referencing items.
4. Apply, verify, re-scan, re-plan the delete: it should no longer block. `delete apply` (recycle bin, journaled).

**Pitfalls**
- Name-based candidates (`Data-old`, `Copy of`, `test`) are a starting list, never a delete list.
- Keep a register of references you chose to drop, for the client.
