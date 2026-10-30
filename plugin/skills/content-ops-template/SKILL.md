---
name: content-ops-template
description: Make the client intake sheet for a page type from the catalog (xlsx or csv), so clients hand back content in a shape that maps itself. Use when someone says make me a sheet, template, intake format, what format should the client use, standard spreadsheet, or when a client asks how to send content. Writes a file in sources/ only; never touches Sitecore.
---

# Intake template

Outcome: a spreadsheet in `sources/` whose columns are exactly the fields Sitecore has for that page
type, plus a README tab the client can read. A filled copy dropped in `sources/` maps itself.

## Steps

1. Ask which page type (`node <bin> catalog show --env <env>` lists them with their components, building the
   catalog first if there is none). Pass `--env <env>` to `template` as well. If the person
   describes a page instead of naming a type, pick the closest and say why.
2. `node <bin> template --page-type <key>`. Options: `--components a,b` to leave some components out,
   `--children 5` when cards or panels repeat more than three times, `--format csv` when the client
   cannot open xlsx, `--out <file>` for a different name. The command refuses to overwrite an existing file (it may be the client's
   filled copy); use `--out` or, when you are sure, `--force`.
3. Read the JSON: `file`, `columns`, `skipped` (components with no fields; the planner places them
   without content), `mappedExact` must equal `columns` minus one (the key column).
4. Open the file once and describe the tabs in one paragraph. Offer the README text as the email to the client.

## When the client sends something else

Run intake anyway (content-ops-intake). Headers that differ ask for one confirmation and are then
remembered. Say to the client: "the sheet we sent maps with no questions; this one needed us to confirm
N columns". Never retype the client's content into the template yourself.

## Do / Don't

- Do regenerate the template after `catalog refresh` adds or renames fields, and say the old one still works until headers change.
- Don't edit headers or the tab name by hand. A renamed header or tab is a new shape and loses the automatic mapping.
- Don't put real content in the template file; it is the empty form.
