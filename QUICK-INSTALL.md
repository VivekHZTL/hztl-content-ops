Content Ops for Claude Code: quick install (plain-text steps, paste anywhere)

What it is: our Claude plugin for Sitecore content work. You talk to Claude in plain English inside the project folder; it reads your decks and sheets, plans the changes, writes them to Sitecore only after you say yes, verifies, and can undo. Works on any SitecoreAI project. All you need is the plugin and a key file from your developer.

Install (once per computer)

Mac
1. Node 22+ needed (run "node -v" in Terminal; if missing, install from nodejs.org).
2. Open Terminal (Spotlight, type Terminal). Paste these two lines, one at a time, Enter after each:
   claude plugin marketplace add VivekHZTL/hztl-content-ops
   claude plugin install sitecore-content-ops@hztl-content-ops
3. Quit Claude Code fully (Cmd+Q) and open it again. Check: in Terminal paste
   claude plugin list
   You should see sitecore-content-ops with Status: enabled.

Windows
1. Install Git for Windows if you do not have it (gitforwindows.org, defaults). Claude Code needs it. Node 22+ needed too (nodejs.org).
2. Open "Git Bash" from the Start menu (not PowerShell). Paste, Enter after each:
   claude plugin marketplace add VivekHZTL/hztl-content-ops
   claude plugin install sitecore-content-ops@hztl-content-ops
3. Close Claude Code fully and open it again. Check: in Git Bash paste
   claude plugin list
   You should see sitecore-content-ops with Status: enabled.

Where things end up: the plugin, engine included, in Claude Code's plugin folder (installed from the public GitHub repo, no account needed); credentials later in ~/.content-ops/<project>/ (Mac) or C:\Users\<you>\.content-ops\<project>\ (Windows). Neither is inside any project folder.

Connect (once per project and environment, a few minutes)
Open a folder for the project in Claude Code (the project repo if you have it, otherwise any folder, e.g. Documents\<project>) and say:
- "set me up to connect on dev"   (or qa, or prod)
Claude makes an empty key file and tells you where (~/.content-ops/<project>/dev.env, or C:\Users\<you>\.content-ops\<project>\dev.env on Windows). Open it in a text editor (Notepad on Windows), paste the three values your developer gives you after the = signs (host, client id, client secret), save, and say "done". Never paste them into chat. Claude signs in, reads the site's home page and tells you what it found. That is the whole setup.

Use it
Just ask, for example:
- what page types do we have?   (the first time, Claude reads them from the site; about a minute)
- make me an intake sheet for Service pages
- plan it  →  apply this on dev  →  verify  →  undo the <slug> page on dev
- which pages have an empty SEO title? give me a report

Optional, for developers: "copy the credentials from my .env.local for dev", and commit the .content-ops folder so colleagues share the project's settings.

Rules
- Every Sitecore write shows you the environment and the pages first and asks. Read it, then say yes in your own words.
- Production needs its own credentials file. If you have it, production writes say PRODUCTION and ask again. Treat that as a stop sign.
- Never paste keys, passwords or client secrets into chat.

More projects: install once, set up each project once. Nothing from one project leaks into another.
Questions: the one-page guide is plugin/ROLLOUT.md in the repo, or ask Claude "who do I ask on this project".
