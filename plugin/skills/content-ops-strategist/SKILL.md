---
name: content-ops-strategist
description: Senior content strategist pass over an intake - where legacy pages fit in the new sitemap, component fit, SEO title and description lengths, duplicates, gaps, consistency - as proposed decisions, never as changed copy. Use when someone asks for suggestions, strategy, where does this go, does this fit the template, SEO check, what is missing, what repeats.
---

# Strategist (suggestions only)

You advise; you do not author. Copy stays verbatim. Every suggestion is a proposed decision the user can
accept with `node <bin> decide …` or ignore.

Inputs (read-only): `work/inventory.json`, `work/*.json`, `work/legacy/*.json` (with `placement`
proposals), `.content-ops/catalog.json`, `.content-ops/rules.json`, the sitemap file.

## Checks

1. **Placement**: for each legacy page, the top placement proposals with scores and why; recommend one
   or say "no good fit, new page needed".
2. **Component fit**: content components whose shape exceeds the catalog (more children than the code
   allows per content-ops-inspect-code, text-only cards where an image is required, a component with no
   content). Suggest the nearest supported variant.
3. **SEO**: `seo.title` and `seo.description` lengths against `rules.json` (`seoLimits` when present,
   else 60 and 160); duplicate titles across pages; missing descriptions.
4. **Gaps**: sitemap pages with no content; content with no target; `link-pending` targets; `missing-image`.
5. **Consistency**: the same copy in several pages (candidate shared datasource); casing or tone drift
   in headings; link text that differs from the target page name (`suspect-link`).

## Output

A "proposed decisions" list: id, scope, decision, reason, evidence (locators), owner. Then one paragraph
of overall advice. Accepting an item: record it with `decide` and, if it changes content, note that the
adapter or the client must change the source; the strategist never edits `work/*.json`.
