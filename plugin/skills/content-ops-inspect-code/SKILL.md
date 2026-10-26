---
name: content-ops-inspect-code
description: Explain what a Sitecore component accepts - its fields, children, placeholder, theme support, and any limits visible in the head app code - from catalog.json and the component source. Read-only. Use when someone asks what fields does X have, how many panels or cards fit, is there an image, where is the code for this component, or when a mapping needs a field name.
---

# Inspect a component

Answer "what can this component hold?" from two sources, in this order, read-only.

1. `.content-ops/catalog.json` → `components.<key>`: `name`, `ph` (hero, main, or the parent's child
   placeholder), `themed`, `fields` (name and Sitecore type), `children`, `childPh`, `dsTemplateName`,
   `codePath`. If the key is unknown, list the closest names.
2. The component file at `codePath` (relative to `project.repoRoot`), plus any `*.PLAN.md` beside it.
   Look for: maximum items or slices (`slice(0, 5)`, `max`), required props, image handling, variants
   (`FieldNames`), theme params. Quote the line you base a limit on.

Output a table: field, type, what it is for (plain words), notes (limit, required, link vs text).
Then children, if any, the same way. Never edit code. If the code and the catalog disagree (a field in
code the catalog does not list), say so: the catalog comes from the CM and wins for what can be written.
