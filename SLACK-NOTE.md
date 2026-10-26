Content Ops for Claude Code: setup in 5 minutes

What it is: our Claude plugin for Sitecore content work. You talk to Claude in plain English inside the project folder; it reads your decks and sheets, plans the changes, writes them to Sitecore only after you say yes, verifies, and can undo. Works on any Sitecore XM Cloud project.

Install (once per computer)

Mac
1. Unzip hztl-content-ops.zip. Move the folder somewhere permanent, e.g. your home folder, so you have ~/hztl-content-ops (keep it: updates install from it). Node 22+ needed (run "node -v" in Terminal; if missing, install from nodejs.org).
2. Open Terminal (Spotlight, type Terminal). Paste these two lines, one at a time, Enter after each:
   cd ~/hztl-content-ops
   claude plugin marketplace add ./ && claude plugin install sitecore-content-ops@hztl-content-ops
3. Quit Claude Code fully (Cmd+Q) and open it again. Check: in Terminal paste
   claude plugin list
   You should see sitecore-content-ops with Status: enabled.

Windows
1. Install Git for Windows if you do not have it (gitforwindows.org, defaults). Claude Code needs it. Node 22+ needed too (nodejs.org).
2. Unzip hztl-content-ops.zip. Move the folder to C:\Users\<you>\hztl-content-ops.
3. Open "Git Bash" from the Start menu (not PowerShell). Paste, Enter after each:
   cd ~/hztl-content-ops
   claude plugin marketplace add ./ && claude plugin install sitecore-content-ops@hztl-content-ops
4. Close Claude Code fully and open it again. Check: in Git Bash paste
   claude plugin list
   You should see sitecore-content-ops with Status: enabled.

Where things end up: the plugin, engine included, in Claude Code's plugin folder (installed from the folder you chose); credentials later in ~/.content-ops/<project>/ (Mac) or C:\Users\<you>\.content-ops\<project>\ (Windows). Neither is inside any project folder.

Set up a project (once per project, a developer, 10 minutes)
Open the project repo in Claude Code and say:
- "set up content ops here"
- "copy the credentials from my .env.local for dev"   (copies 3 keys to ~/.content-ops/<project>/dev.env, never shown)
- "check the connection"
- "build the catalog"   (reads page types and components from the site; no special pages needed)
Commit the new .content-ops folder.

Use it (authors)
Open the project folder in Claude Code and say "set up content ops for this project". It sees the project is already set up, makes an empty credentials file for you, and says where it is. Paste the three values your developer gives you into that file in a text editor (never into chat), save, and say "check the connection". Then just type:
- what page types do we have?
- make me an intake sheet for Service pages
- plan it  →  apply this on dev  →  verify  →  undo the <slug> page on dev
- which pages have an empty SEO title? give me a report

Rules
- Every Sitecore write shows you the environment and the pages first and asks. Read it, then say yes in your own words.
- Production needs its own credentials file. If you have it, production writes say PRODUCTION and ask again. Treat that as a stop sign.
- Never paste keys, passwords or client secrets into chat.

More projects: install once, set up each project once. Nothing from one project leaks into another.
Questions: the one-page guide is plugin/ROLLOUT.md in the zip, or ask Claude "who do I ask on this project".
