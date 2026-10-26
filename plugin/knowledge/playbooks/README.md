# Playbooks

What the reference project (a large health-system site: 1,500+ page updates, seven bulk pipelines) taught, written so
any project starts at that level. Read the one that matches the ask before building anything. Each says when it
applies, the governed steps, which change-set ops or operation it maps to, and the pitfalls that cost time.

| Playbook | Use when |
|---|---|
| [shared-datasources](shared-datasources.md) | one block on many pages from one item; local copies → shared |
| [items-outside-home](items-outside-home.md) | records under Data (departments, settings, redirect maps), shared folders |
| [replace-existing-page](replace-existing-page.md) | new content for a page that already exists or is a shell |
| [dam-images](dam-images.md) | DAM / Bynder images, alt text, missing image records |
| [workbooks](workbooks.md) | multi-tab sheets, keys, column overrides, row notes |
| [dedupe-and-repoint](dedupe-and-repoint.md) | two items for one thing; references must move to the keeper |
| [relink-before-delete](relink-before-delete.md) | clean-up where items are still referenced |
| [component-swap](component-swap.md) | swap one rendering for another, remove components that hold values |
| [page-status](page-status.md) | hide, redirect (301), unpublish, retire a page |
| [verification](verification.md) | proving a change is live: read-back, Edge, rendering host |
| [legacy-pages](legacy-pages.md) | content from an old site: fetch, parse, map, forms |
| [link-audit](link-audit.md) | broken and legacy links, links inside rich text |

If none fits, follow the build skill and write the new playbook afterwards (a promotion note, see content-ops-lessons).
