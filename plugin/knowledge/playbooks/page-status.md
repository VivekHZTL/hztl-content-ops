# Page status: hide, redirect, unpublish, retire

**When:** a page must stop showing in navigation or the sitemap, redirect elsewhere, or disappear.

**Reference project:** pages hidden from the sitemap, a page hidden with a 301 to home, 4 unused pages retired.

| Goal | Ops |
|---|---|
| Hide from sitemap/navigation | `set-field` on the checkbox the site uses |
| Redirect | `create` an item in the redirect map folder (template and fields from `snapshot` of an existing one) |
| Unpublish | `update __Never publish = 1`, then publish the page: Edge drops it |
| Retire | references first (`refs`), then unpublish, then `delete` (recycle bin) |

**Pitfalls**
- Deleting in the CM does not remove the page from Edge; unpublish first, check it 404s or redirects, then delete.
- Live-check the redirect: expect the status and the `Location` header, not just "not 200".
