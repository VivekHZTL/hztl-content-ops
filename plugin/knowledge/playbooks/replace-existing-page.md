# Replace an existing page

**When:** new content arrives for a page that already exists: an empty shell, a page with old content, or a test
copy built elsewhere that should become the real page.

**Reference project:** 109 copy decks onto real service paths: 94 rebuilt in place, 4 replaced, 11 created. Form
pages: shells filled, originals parked. The item id (and so every link to it) was kept wherever possible.

**Choose a mode**
| Situation | Mode | Ops |
|---|---|---|
| Shell with empty or placeholder datasources | fill in place | page planner (`target.mode: fill-shell`) or `update` ops |
| Page with old content, same template | swap Data | `rename Data → Data-old`, `create Data`, new datasources, `update __Final Renderings` |
| Content already built on a test copy | mirror | `move` the test copy's Data in, `update` the layout, keep the real item id |
| Wrong template or unsalvageable | park and replace | `move` the original to a parking folder, `create` from branch, `move` child pages across |

**Steps:** dry run every page, pilot one of each mode, verify, publish the page, its new Data, Data-old and any moved
items together, then delete Data-old and parked items only after a reference scan (cleanup skill).

**Pitfalls**
- Keep the item id when you can: links, menus and search all point at it.
- Moving child pages changes their paths; check redirects and sitemap entries.
- Decide which fields win when merging (protected fields such as SEO or "additional data" stay); write that as a
  project rule (`rules set`) so every page follows it.
- Two candidate pages for one deck: pick by exact path, then sitemap entry, then parent; never guess silently.
