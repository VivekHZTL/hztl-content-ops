# Shared datasources

**When:** the same block must show on many pages from one item, or many pages carry local copies of a block the
content team wants to edit once.

**Reference project:** an "At a Glance" block added to 348 article pages, all pointing at one shared item; 221 Find
Care blocks moved from empty local copies to the shared item; shared Form Embed items for 28 form pages.

**Steps**
1. `catalog show` → the component key; `snapshot` one page that already uses the shared item, to copy the exact
   `s:ds` form and rendering parameters.
2. `op plan attach-shared` with `shared: { path }` (or `{ parent, name, templateId, fields }` to create it first:
   the first run creates, the second attaches).
3. Pilot one page (`apply --pages <key>`), `verify`, look at it on the rendering host, then the rest.
4. Publish: the shared item lives under Data, so publish runs from the site root; include it.
5. Old local datasource items are now orphans: remove them with the cleanup skill (refuses anything referenced).

**Maps to:** `attach-shared`; or a project operation emitting `update __Final Renderings` plus `create` of the item.

**Pitfalls**
- The page planner refuses to edit shared items through a page on purpose (editing one changes every page). Edit
  the shared item itself with an `update` change set.
- Insert position matters: name `after`, and check the dynamic placeholder ids of nested renderings stay unique.
- Pages with personalization, more than one device, or renderings in the shared layout are held for review.
