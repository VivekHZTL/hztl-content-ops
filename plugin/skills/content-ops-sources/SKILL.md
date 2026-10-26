---
name: content-ops-sources
description: Register, list and verify the source files (decks, workbooks, sheets, legacy HTML, lists) a content run uses. Use when someone downloads a file from SharePoint, asks which version is current, says a file changed, or before any intake or plan.
---

# Sources

SharePoint, OneDrive and Teams links cannot be opened from here. The author downloads the file into
`<project>/sources/` and we record it by content hash, so every plan and report can say exactly which
file version it used, and `apply` refuses to run on a changed file.

## Steps

1. Ask for the file to be saved under `sources/` (any name; keep the client's name when possible).
2. Register it: `node <bin> sources register sources/<file> --note "<where it came from, version, date>" --by "<name>"`.
   The JSON shows `file`, `sha256`, `mtime`, `size`.
3. To see what is registered: `node <bin> sources list`.
4. Before a plan or when in doubt: `node <bin> sources verify`. Statuses: `ok`, `changed` (re-register and
   re-run intake + plan), `missing` (file gone; ask for it).

## Do / Don't

- Do re-register after every new download, even if the name is the same.
- Do put the version or sender in `--note`; it shows up in reports.
- Don't try to fetch a SharePoint URL. Say plainly that the file must be downloaded first.
- Don't register files from outside `sources/` unless the user insists; say where they will be referenced from.

Report: the file, its hash prefix (first 8 characters) and the note, in one line each.
