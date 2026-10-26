---
name: sync-repo
description: Bring the user's copy of the project repo up to date without changing history. Use when someone says sync, pull, get the latest, update my repo, am I up to date, or before a content run. Fetch and fast-forward only; refuses merge, rebase, stash, commit, push, branch changes.
---

# Sync the repo

Authors read the repo; developers change it. This skill only ever moves the current branch forward to
what the shared repo has.

## Steps

1. `git status --short --branch` and `git rev-parse --abbrev-ref HEAD`. Report the branch and whether
   there are local changes. Local changes to files under `sources/`, `work/`, `runs/` are expected and fine.
2. `git fetch --prune`.
3. `git merge --ff-only @{upstream}`. If the branch has no upstream, say so and stop; a developer sets it.
4. If the fast-forward is refused (diverged) or there is a conflict message: stop. Show the message,
   say "this needs a developer", do not try `--no-ff`, `rebase`, `reset`, `stash` or `checkout`.
5. Report: branch, commits pulled (`git log --oneline ORIG_HEAD..HEAD | wc -l` when ORIG_HEAD exists), done.

## Never

Commit, push, rebase, merge with history, stash, switch branches, create branches, delete anything.
If the person needs any of these, say it is a developer step.
