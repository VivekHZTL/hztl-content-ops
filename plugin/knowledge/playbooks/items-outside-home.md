# Items outside Home

**When:** the change is on records that are not pages: department records under Data, settings, redirect maps,
shared folders.

**Reference project:** `+1` added to 282 department phone records under Data/Departments, published with subitems
and checked on Edge; redirect-map items for retired pages.

**Steps**
1. `scan --root <item>` or `snapshot` to see the real tree and field names (they often differ from the page fields).
2. `op plan set-field` for one field; a project operation for anything richer (`create`, `update`, `move`).
3. Pilot one record, verify, then the rest.
4. Publish from the site root. Records with children (a department with its contacts) may need `--with-subitems`.

**Maps to:** change-set ops on any item under the site root; publish roots come from the journal.

**Pitfalls**
- Some record types feed other systems on publish (search, listings, a locations sync). Find out before publishing.
- Templates under Data may share field names with pages but mean something else; read one record first.
