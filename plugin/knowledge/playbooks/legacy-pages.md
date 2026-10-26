# Legacy pages

**When:** content lives on an old site and must be lifted into new pages.

**Reference project:** 28 legacy form pages fetched by URL, parsed (banner, eyebrow, accordion, form embed script),
matched to a form inventory by script URL, cleaned (inline styles, phone links, legacy → new links) and rebuilt.

**Steps**
1. Save each legacy page as HTML into `sources/legacy/` (Claude can fetch them; register the files).
2. `intake` turns them into blocks with a placement proposal; site-specific parts (banners, forms) need a project
   adapter or operation, written once and reused.
3. Map blocks to components, flag anything that does not fit, then plan and apply like any other source.

**Pitfalls**
- Strip legacy media-library images and tracking scripts; flag missing images for the client.
- Forms: match by the embed script or form id, not by page title.
