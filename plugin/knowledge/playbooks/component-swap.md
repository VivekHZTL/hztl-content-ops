# Swap or remove components

**When:** a page should use a different rendering (a hero type changes), or unused components must go even though
their datasources hold values.

**Reference project:** 36 heroes swapped to a Page Title rendering with their copy carried over; 8 unused
placeholder components removed from 57 story pages and 399 orphaned datasources deleted.

**Steps**
1. `snapshot` a few pages; decide what "unused" means (still holds branch defaults? empty? hidden?) and write it down.
2. A project operation edits the layout with `helpers.layout` (parse, change entries, build) and emits one
   `update __Final Renderings` per page, plus `create`/`update` for the new datasource when copy carries over.
3. Pilot, verify on the rendering host, then the rest; delete the old datasources with the cleanup skill.

**Pitfalls**
- The page planner only removes components with no own values (`removeMissingComponents`); anything else needs an
  explicit operation and a decision.
- Carry copy field by field; titles often live in different field names on the two renderings.
