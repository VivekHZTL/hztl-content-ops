# DAM images (Bynder and similar)

**When:** image fields must point at a DAM asset, with alt text, instead of the media library.

**Reference project:** every hero and deck image came from a DAM map (spreadsheet of names → asset records); images
missing from the map were collected and turned into records with a small local helper, then added to the map.

**Steps**
1. `snapshot` one item whose image is already right; copy the exact field value shape (the DAM JSON or the
   `<image ...>` XML) and where alt text lives (an override attribute or a separate field).
2. Keep a project map of asset name → value in `sources/` (registered), and read it from the operation.
3. Images not in the map: flag `missing-image`, list them for the client, never invent an asset.
4. Set values with `set-field` (one image everywhere) or a project operation (per-page images).

**Pitfalls**
- Alt text from the deck wins over the DAM default; record that as a rule.
- Large originals (4K) are fine in the DAM; check the rendering host serves a resized version.
- Do not mix media-library and DAM values on one template without a decision.
