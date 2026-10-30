# Content Ops: the one-page guide

Content Ops is a Claude Code plugin for SitecoreAI content work. You talk to Claude in plain English inside the project folder. Claude reads copy decks, workbooks and legacy pages, plans the changes, writes them to Sitecore only after you say yes, verifies them, and can undo them.

It isn't a fixed tool with a feature list. It's a harness your Claude uses on your project:

- **Governance:** every write is planned, confirmed, journaled, read back, undoable, and published as a separate step.
- **Guidance:** understand the ask, look at the real items, pilot one page, scale, and keep what was built so the next person can reuse it.
- **Knowledge:** playbooks from a large production project (`plugin/knowledge/playbooks/`), so a new project doesn't start from zero.

When a task needs something no command does, Claude builds it as an *operation*, and the same gates apply.

## Get started

You need Claude Code and Node 22 or newer (on Windows, Git for Windows too; Claude Code uses its Git Bash). The repo is public, so you don't need a GitHub account. You don't need the project's code.

1. **Install the plugin**, once per computer:
   ```
   claude plugin marketplace add VivekHZTL/hztl-content-ops
   claude plugin install sitecore-content-ops@hztl-content-ops
   ```
   Quit Claude Code fully and reopen it.
2. **Open a folder for the project.** The project repo if you have it, otherwise any folder (for example `Documents\<project>`). Open it in Claude Code.
3. **Say "set me up to connect on dev"** (or qa, or prod). Claude makes an empty key file at `~/.content-ops/<project>/<env>.env` (Windows: `C:\Users\<you>\.content-ops\<project>\<env>.env`) and tells you where it is.
4. **Fill the key file.** Open it in a text editor (Notepad on Windows). Paste the Sitecore host, client id and client secret after the `=` signs, and save. The Experience Edge context id is optional. Never paste these into chat.
5. **Say "done" or "check the connection".** Claude signs in, reads the site's home page and tells you what it found. That's the whole setup.
6. **Ask for what you came to do**, in plain English. Every write still asks you first.

There is nothing else to set up. Page types and components (the "catalog") are read from the site the first time a task needs them.

To update later: `claude plugin marketplace update hztl-content-ops`, then `claude plugin update sitecore-content-ops@hztl-content-ops`.

## Optional, for the tech team

None of this is needed before anyone can work.

- **"copy the credentials from my .env.local for dev"**: three settings move to `~/.content-ops/<project>/dev.env` (never shown). Production only on purpose, with `--prod`.
- **Commit `.content-ops/`** to the project repo through a pull request, so colleagues share the project name, site, decisions and lessons; add `sources/`, `work/` and `runs/` to `.gitignore`.
- **"refresh the catalog"** after template changes, or add a `Home/_blueprints` folder (one page per template with every allowed component) if you want the catalog complete on day one.
- **"set up content ops here"** with the setup questions, to record contacts and live-check site URLs.

## Where things live

![Where things live](rollout/diagrams/where-things-live.svg)

The plugin, with the engine inside it, runs in Claude Code. The project folder holds the configuration, the catalog once something needs it, the operations and the project's lessons. Client files, plans and journals stay in the git-ignored `sources/`, `work/` and `runs/` folders. Credentials live on your computer, outside every repo, and are never printed. Sitecore is reached through its Authoring GraphQL API, one environment at a time.

## The daily loop

![The daily loop](rollout/diagrams/daily-loop.svg)

Sources become content JSON, with flags for anything unclear. The plan is a dry run you can read. Apply asks first, writes, keeps a journal and reads everything back. Verify proves the result. Publish is always its own ask.

| Say | What happens |
|---|---|
| what page types do we have? | Reads the catalog; the first time, builds it from the site (read-only, about a minute). |
| make me an intake sheet for Service pages | A spreadsheet whose columns are exactly the Sitecore fields, to give to the client. |
| plan it | Intake and a dry run, plus a report. Nothing is written. |
| apply this on dev | Restates the environment and page count, asks, writes, reads back. |
| verify | Re-checks what was written. Expect everything to be up to date. |
| publish | Asks separately, publishes, then checks the live site. |
| undo the <slug> page on dev | Restores that page from its journal. |
| which pages have an empty SEO title? give me a report | A read-only report. |
| clean up the old Data folders | Reference scan first. Deletes go to the recycle bin and can be undone. |
| put the same block on every article from one shared item | Claude uses the `attach-shared` operation, shows the dry run, then applies with the usual gates. |

## When a task needs something new

Shared datasources, records under Data, swapping a page's content, repointing references, redirects: Claude builds these as **operations** in `.content-ops/operations/<name>/`.

- An operation only reads Sitecore and proposes changes. Every write method it could call throws.
- The engine plans those changes, records the before-state itself, and `apply` writes them with the same confirmation, journal, read-back, auto-rollback and undo as everything else.
- Operations are committed with the project, so the next person reuses them. A general one is promoted into the plugin.
- Two come built in: `set-field` (one field on many items) and `attach-shared` (one shared datasource on many pages).

Commands: `content-ops op list`, `op show <name>`, `op new <name>`, `op plan <name> --env <env>`.

## Safety in one screen

1. Every Sitecore write asks first and restates the environment, host, production yes or no, and scope.
2. Production needs a production credentials file. With it, every production write is announced as PRODUCTION and asks again.
3. Every write is journaled before it happens, read back after, and rolled back on a mismatch.
4. Undo is one command per page or change set, from the journal.
5. The page planner never edits a shared datasource through a page, and refuses unknown components. Shared items are changed only by an operation, on purpose, under the same gates.
6. Client copy is never corrected silently. Problems become flags with a locator.
7. Credentials are never printed or committed, and the engine refuses a credentials file inside a git folder.
8. Publish is a separate ask. Nothing publishes as a side effect.
9. Sitecore serialization push is blocked, and recursive deletes ask first.

## How it learns

![How it learns](rollout/diagrams/learning-loop.svg)

Every confirmed sheet shape, deck shape and rule override is remembered in `.content-ops/knowledge/`, with where it came from, so the same shape never asks twice. Lessons are plain words, appended, never rewritten. Operations hold the procedures. `content-ops lessons export` bundles the shareable lessons so a developer can open a pull request against the plugin. Nothing changes the shared plugin by itself.

## FAQ

**It asked me to confirm. What do I check?** The environment name, the host, production yes or no, and the page count. If any of those surprise you, say no.

**It says needs-review. Is that bad?** No. It means the tool refused to guess. Read the reasons, fix the source or the catalog, and plan again.

**Can I break production?** Only if you have the production credentials file and say yes to a prompt that says PRODUCTION.

**The client sent a sheet in their own format.** Drop it in `sources/` and run intake. The tool proposes a mapping once, you confirm it, and the same shape never asks again.

**How do I see what happened last week?** `content-ops history --env dev` lists everything written, from the journals. `content-ops report --combined --env dev` makes one page you can share.

**It wrote the wrong thing.** Say "undo that page". The journal holds the exact previous values.

**Several projects?** Install once. Each project has its own `.content-ops/` and its own credentials folder, and nothing crosses between them.

**Who do I ask?** `contacts` in `.content-ops/project.json` names the developer and the content lead for the project.

## More

- [INSTALL.md](../INSTALL.md): install details, many projects, updating.
- [Playbooks](knowledge/playbooks/README.md): how the common hard cases were solved.
- [Training](training/README.md): a 90-minute session plan for a content team.
- Feedback and feature requests: open an issue on the repo.
