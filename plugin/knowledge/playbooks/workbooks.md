# Workbooks

**When:** content comes in spreadsheets: many tabs, one row per page, columns per field.

**Reference project:** a location workbook with many tabs (one per service line), 281 pages kept in sync over
several revisions; rows keyed by slug, with new slugs replacing old ones; per-tab column shifts; "DO NOT AUTHOR" notes.

**Steps**
1. `intake` with a profile; confirm the mapping once per sheet shape (`content-ops-map`); it is remembered by header
   fingerprint.
2. Read every row, not just the dry-run counts: orphan rows, notes in cells and "do not author" markers are
   action items.
3. Keys: prefer a stable id or the final slug; when slugs change, key by the new slug and rename the page
   (`rename` op), keeping the item id.
4. Values that name things (amenities, services, states) must become item ids: build the lookup from Sitecore in
   the operation, and flag names that match nothing.
5. Loose values that map to several fields: "Mon–Fri, 9 am–5 pm" is a from and to time per day (14 fields, plus
   all-day and closed flags) on a typical location template; phone numbers need one format. Write the mapping once as
   a project rule or operation, show the split in the dry run, and flag anything ambiguous ("by appointment",
   "varies") instead of guessing.
6. Several tabs with different shapes: one profile per tab, or a project operation that reads each tab.

**Pitfalls**
- A column shifted on one tab breaks every row silently; check headers per tab.
- Placeholders like `[City]` in sheet copy must be filled from page fields or flagged, never published.
- Re-delivered sheets: register the new file, diff against the last run, and only write what changed.
