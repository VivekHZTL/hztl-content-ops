# @hztl/content-ops

**Installing or rolling out?** Read [INSTALL.md](INSTALL.md) (machine once, project once, many projects) and [plugin/ROLLOUT.md](plugin/ROLLOUT.md).

The engine behind HZTL's SitecoreAI content authoring tool: read-only snapshots and fingerprints, a
catalog-driven layout toolkit, a journaled apply with read-back and automatic rollback, bounded apply-many,
manual undo, a guarded publish runner, a tenant scan with a reference index, and a `check` command.
No runtime dependencies. Node 22 or newer.

## Run the tests

```bash
npm test
```

Every module is tested against the in-memory fake CM (`plugin/engine/lib/cm/fake.mjs`). Nothing in the tests talks to Sitecore.

## Credentials

One file per environment, outside any repo:

```
~/.content-ops/<project>/<env>.env
```

```
SITECORE_API_HOST=https://xmc-<tenant>-<env>.sitecorecloud.io
SITECORE_CLIENT_ID=...
SITECORE_CLIENT_SECRET=...
# optional
SITECORE_AUTHORITY_URL=https://auth.sitecorecloud.io
SITECORE_AUDIENCE_URL=https://api.sitecorecloud.io
SITECORE_EDGE_CONTEXT_ID=...
```

The engine refuses a credentials file inside a repo and never prints a secret. An environment whose name or
host contains `prod` or `prd` is production; writes there need `--prod` as well as `--confirm <env>`.

```bash
node plugin/engine/bin/content-ops.mjs setup connect --env dev [--project <name>]   # the whole setup
node plugin/engine/bin/content-ops.mjs check --env dev                               # later re-checks
```

`setup connect` needs only the key file. It signs in, lists the sites (`solutionSites`, or the `Home` items under
`/sitecore/content`), reads the site's home page, and writes the minimal `.content-ops/project.json`
(`name`, `siteRoot`, `homePath`, `language`, `environments`). Read-only on Sitecore. Its JSON has a `status`
(`connected`, `key-file-created`, `key-file-incomplete`, `key-file-misnamed`, `needs-prod-ok`, `choose-site`,
`need-project-name`, `connection-failed`, `wrong-folder`) and a plain-words `say` line. Key files saved by
Windows Notepad (UTF-8 BOM, UTF-16, CRLF) are read as-is.

## Write gate

Every writing function (`applyPage`, `applyMany`, `publishItems`) calls `assertWritable` first: the client must
have been created with `allowWrites`, the caller must pass `confirm: '<env name>'`, and a production
environment also needs `prod: true`. `publishItems` additionally requires a `scope(item)` function; items it
rejects stop the publish before any call. Undo refuses a journal from another environment.

## Commands

| Command | Mode | Does |
|---|---|---|
| `setup connect --env <env> [--project n] [--site s] [--prod]` | read + local | key file (made empty if missing), sign in, read the home page, minimal `project.json` |
| `check --env <env> [--project <name>] [--offline]` | read | env, credentials present, CM answers, home page read (in a project folder) |
| `setup --answers <file>` / `setup questions` | local | optional: write `.content-ops/` from an answers file; print the answer schema |
| `catalog build --env <env>` | read | optional: generate `.content-ops/catalog.json` (blueprint pages if present, else one real page per template, + repo code paths). Commands that need a catalog build it on the fly |
| `sources register <file> [--note t]` / `list` / `verify` | local | manifest of input files by content hash |
| `plan --env <env> --content <file|dir> [--pages a,b]` | read | dry run → `runs/<id>/plan.json`, `summary.json` |
| `show --run <id> [--status a,b] [--page key] [--pending]` | local | compact view of a run |
| `apply --run <id> --confirm <env> [--prod] [--pages a,b]` | write | ready pages only; refuses a stale run or a changed source |
| `verify --run <id> [--apply <id>]` | read | re-plan written pages; expect `up-to-date` |
| `undo --run <id> --apply <id> --page <key> --confirm <env> [--prod]` | write | strict rollback of one page from its journal |

## Project layout

```
<project>/
  .content-ops/project.json     name, siteRoot, homePath, language, environments (the minimum setup connect writes); optional blueprintRoot, repoRoot, contacts, placeholders
  .content-ops/rules.json       themes, placeholders tokens, newTab policy, removeMissingComponents, planMaxAgeHours
  .content-ops/catalog.json     optional, generated on first need: device, placeholders, pageTypes, components (renderingId, dsTemplateId, fields, children, childPh, parent, codePath)
  .content-ops/decisions.json   [] register of human decisions (phase C fills it)
  .content-ops/overrides.json   {} source overrides with reasons (phase C fills it)
  .content-ops/sources.json     manifest written by `sources register`
  sources/                      downloaded decks, workbooks, sheets (git-ignored)
  work/                         content JSON, one file per page (git-ignored)
  runs/                         dry runs and real runs: plan.json, summary.json, journal/, results-*.json (git-ignored)
```

The catalog is optional and lazy. `plan`, `intake`, `template`, `export`, `create`, `apply`, `verify` and `catalog show`
build it from their environment the first time they need it (a bounded look at up to 1,500 items under Home, one
page per template, then the renderings and templates those pages use; read-only, about 20 seconds on a large site)
and report `catalogBuilt`. `catalog build` / `refresh` walk the whole tree. Blueprint pages are optional: under
`blueprintRoot` (default `<homePath>/_blueprints`) one page per page template with every allowed component placed
once makes the catalog complete on day one.

## Content JSON (what the planner consumes)

```json
{ "pageId": "50.6.1", "pageType": "generalLandingPage",
  "target": { "path": "/sitecore/content/<site>/Home/services/x", "mode": "update" },
  "components": [ { "type": "<catalog key>", "fields": { "<field>": "<value>" }, "children": [ { "type": "<child key>", "fields": {} } ] } ],
  "flags": [ { "kind": "missing-url|placeholder|do-not-author|hold|…", "where": "", "text": "" } ],
  "sources": [ { "file": "sources/deck.txt", "sha256": "…" } ] }
```

Field values: strings for text and rich text; `{ text, url | id, target?, anchor?, querystring? }` for General Link;
item ids (32-hex or braced) for Multilist/Treelist/Droplink; an object (DAM record) or string for Image. A value that
contains a placeholder token is held as pending and never written. Components not in the catalog, fields not on the
component, pages without a Data folder, and content flagged `do-not-author` or `hold` make the page `needs-review`.

Page-level fields go in `pageFields: { "<field>": "<value>" }` (checked against the page type's fields). `seo: {}` is
written only when `rules.json` has `seoFields: { "title": "<page field>", "description": "<page field>", ... }`; otherwise it is listed as pending.

## Phase C: getting content in, pages out

| Command | Mode | Does |
|---|---|---|
| `intake [--sources dir] [--parent-path p] [--page-type k] [--profile f] [--section-map f] [--sitemap f] [--env e]` | read | registers every file in `sources/`, runs the adapter for its type, writes `work/<pageId>.json` and `work/inventory.json`. First run for a workbook or deck writes `work/profile.proposed.json` / `work/section-map.proposed.json` and stops for a person to confirm |
| `create --run <id> --confirm <env> [--prod]` | write | creates page shells for `no-match` pages whose content has `target.mode: "create"` (branch when the page type has a `branchId`, else template); journaled; then `plan` again |
| `publish --run <id> [--apply <id>] --confirm <env> [--prod] [--dry] [--with-subitems]` | write | roots from done journals only (page, created items, updated items); every root must be under `homePath`; log in the run folder |

Adapters (`plugin/engine/lib/ingest/`): `xlsx` (workbook + profile), `docx` (deck text + section map), `html` (legacy page → blocks + placement proposal), `tsv`, `sitemap` (Page ID → URL, link resolution against the CM). Each value carries a locator: `'Tab'!C12`, `deck line 85`, `#block-3`.

**Profile** (`work/profile.proposed.json`, confirm and keep): `{ sheet: { tab, headerRow, groupRows, firstDataRow, keyColumn }, match: { by: 'slug'|'path', parentPath }, columns: { "B": { target, pair?, confidence, why } } }`. Targets: `key`, `page.<field>`, `component.<key>.<field>`, `child.<childKey>.<n>.<field>`, `pair`, `note`, `ignore`.

**Section map** (`work/section-map.proposed.json`): `{ aliases: { "<heading>": "<component key>" }, fields: { "<key>": { "<label>": "<field>" } }, childFields: { "<key>": { "<label>": "<field>" } }, unmatched: [] }`. Deck sections start at `Component: X` lines or `Component | X` table rows; rows are `Label | value`; child rows are `Panel 1 heading`, `Item 2 copy`, and so on.

**Flags** (closed list): `missing-image missing-url suspect-link pid-fix char-limit over-variant video-url confirm sensitive dev-note placeholder unmapped do-not-author hold link-pending other`. `inventory.json` turns them into questions by owner: client (`missing-url`, `missing-image`, `pid-fix`, `suspect-link`, `char-limit`, `video-url`, `do-not-author`), dev (`unmapped`, `over-variant`, `link-pending`), us (`confirm`, `dev-note`, `placeholder`, `hold`, `sensitive`).

**Registers**: `.content-ops/decisions.json` (`D-n`, date, scope, decision, reason, who, enforcedBy), `.content-ops/overrides.json` (`cells` by locator with why/who, `links` by locator, `urls` regex rewrites), `.content-ops/media-ledger.json` (legacy image URL and hash → item per env). `branchId` per page type is set by hand in `project.json` `pageTypes` until the builder can read insert options.

Intake details: on the first run `work/profile.proposed.json` is a map keyed by source file (`{ "sources/a.xlsx": profile }`); pass it back with `--profile` as is, or a single profile object for one workbook. `work/section-map.proposed.json` is merged across every deck in `sources/`. Duplicate page ids are written as `<id>-2`, `<id>-3` with an error line and a `confirm` flag. Numbered child columns (`Panel 2 heading`) are one child each; rows under them join into one value with a `confirm` flag. Unnumbered child columns (`Panel heading`) give one child per row.

## Plugin

Rollout guide for colleagues: [`plugin/ROLLOUT.md`](plugin/ROLLOUT.md).

The author-facing plugin lives in `plugin/` and this repo is its marketplace (`.claude-plugin/marketplace.json`):

```bash
claude plugin marketplace add /path/to/hztl-content-ops
claude plugin install sitecore-content-ops@hztl-content-ops
```

See `plugin/README.md` for roles, skills, hooks and training levels 3 to 5.

## Phase E: reports, history, Sitecore as source, clean-up

| Command | Mode | Does |
|---|---|---|
| `report --run <id> [--apply <id>]` / `report --combined --env <e>` | local | self-contained HTML: dry-run report, run report per apply, one combined report per environment |
| `history --env <e> [--page k]` | local | every page written, from journals |
| `export --env <e> --paths a,b` | read | existing pages → `work/*.json` that plan as up-to-date (shared and unknown renderings listed in `notes`) |
| `transform --rules <file>` | local | named RTE rules (`strip-images`, `unwrap-anchors`, `rewrite-hrefs`, `replace-text`) over `work/*.json`; each change flagged `confirm` |
| `relink --env <e> --sitemap <f>` | read + local | resolve links left pending once their targets exist |
| `scan --env <e> [--root p]` / `refs --scan f --targets a,b` | read | subtree snapshot; who references what |
| `delete plan` / `delete apply --confirm` / `delete undo --confirm` | write (apply/undo) | recycle-bin deletes that refuse referenced items, Home and anything outside the home path; drift-checked; journaled; restorable |
| `catalog refresh --env <e>` / `catalog verify <key>` / `catalog show` | read + local | diff against the committed catalog: added → `unverified`, removed → `missing` (dated), changed types kept; a developer flips a status with `verify`; `show` prints status |
| `template --page-type <k> [--components a,b] [--children n] [--format xlsx|csv] [--out f]` | local | client intake sheet generated from the catalog; its shape is registered so a filled copy maps itself |
| `mappings list` / `mappings forget <fp>` | local | remembered sheet shapes (`.content-ops/knowledge/mappings/`) |
| `rules list` / `rules set <key> <json> --why <t>` | local | effective rules with provenance (`default`, `project`, `merged`) |
| `lessons add|list|check|export` | local | append-only plain-words lessons; export bundles the shareable ones for a plugin PR |
| `setup --from-env-local <path> --env <e> [--force] [--prod]` | local (outside repo) | copies the three Sitecore keys from a head app's `.env.local` to `~/.content-ops/<project>/<env>.env`, mode 600, never printed |

Sitecore-to-Sitecore jobs: `export` → edit or `transform` → `plan` → `apply` → `verify` → `publish`. The planner shows every field that differs; a transform never writes directly.
