#!/bin/sh
# PreToolUse(Bash) hook, pure POSIX sh (no node, no jq): the desktop app may run hooks with a bare PATH.
# Applies to everyone. Sitecore serialization push is blocked (it can overwrite live content and belongs to the
# back-end team; run it yourself in a terminal if you mean it). Recursive deletes ask first. Exit 2 blocks.
INPUT=$(cat)
case "$INPUT" in *'"tool_name"'*) case "$INPUT" in *'"tool_name"'*'"Bash"'*) ;; *) exit 0;; esac;; esac
# extract the "command" string from the JSON (handles \" inside), then unescape
CMD=$(printf '%s' "$INPUT" | sed 's/\\"/@@Q@@/g' | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 | sed 's/@@Q@@/"/g; s/\\n/ /g; s/\\t/ /g; s/\\\\/\\/g')
[ -z "$CMD" ] && exit 0

# Text inside quotes is data (grep patterns, echo), unless it is a shell payload (sh -c "...").
NOQ=$(printf '%s' "$CMD" | sed "s/\"[^\"]*\"//g; s/'[^']*'//g")
PAYLOAD=""
if printf '%s' "$CMD" | grep -Eq '(^|[^A-Za-z0-9_-])(sh|bash|zsh|dash)[[:space:]]+-l?c[[:space:]]+["'"'"']'; then PAYLOAD="$CMD"; fi
SCAN="$NOQ
$PAYLOAD"

if printf '%s' "$SCAN" | grep -Eq 'sitecore[[:space:]]+(serialization|ser)[[:space:]]+push|(^|[[:space:]])ser[[:space:]]+push'; then
  echo "Blocked: Sitecore serialization push can overwrite live content and goes through the back-end team. If you really mean it, run it yourself in a terminal." >&2
  exit 2
fi
if printf '%s' "$SCAN" | grep -Eq '(^|[^A-Za-z0-9_-])rm([[:space:]]+(-[a-zA-Z]+|--[a-z-]+))*[[:space:]]+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)|(^|[^A-Za-z0-9_-])rm([[:space:]]+(-[a-zA-Z]+|--[a-z-]+))*[[:space:]]+(-[a-zA-Z]*f[a-zA-Z]*|--force).*(-[a-zA-Z]*[rR]|--recursive)|find[[:space:]].*[[:space:]]-delete([[:space:]]|$)'; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}' "RECURSIVE DELETE: this removes a folder and everything in it. Check the path is only what you meant to delete, including tracked project files, before you approve."
  exit 0
fi
exit 0
