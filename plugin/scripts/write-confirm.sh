#!/bin/sh
# PreToolUse(Bash) hook, pure POSIX sh. Any content-ops Sitecore write (apply, publish, create, undo) becomes an
# explicit "ask" that restates the environment and whether it is production. publish --dry is read-only.
INPUT=$(cat)
case "$INPUT" in *'"tool_name"'*) case "$INPUT" in *'"tool_name"'*'"Bash"'*) ;; *) exit 0;; esac;; esac
CMD=$(printf '%s' "$INPUT" | sed 's/\\"/@@Q@@/g' | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 | sed 's/@@Q@@/"/g; s/\\n/ /g; s/\\t/ /g; s/\\\\/\\/g')
[ -z "$CMD" ] && exit 0
# the engine binary may be named content-ops or content-ops.mjs (the bundled path is often quoted), or held in $CONTENT_OPS_BIN
WRITE=$(printf '%s' "$CMD" | sed -n -E 's/.*(content-ops(\.mjs)?|CONTENT_OPS_BIN)["'"'"']?[[:space:]]+(apply|publish|create|undo|delete[[:space:]]+(apply|undo))([[:space:]]|$).*/\3/p' | head -n 1 | tr -s ' ')
# defense in depth: `delete … apply|undo` with flags in between (the CLI refuses that order, the prompt still fires)
if [ -z "$WRITE" ] && printf '%s' "$CMD" | grep -Eq '(content-ops(\.mjs)?|CONTENT_OPS_BIN)["'"'"']?[[:space:]]+delete([[:space:]]+[^[:space:]]+)*[[:space:]]+(apply|undo)([[:space:]]|$)'; then WRITE="delete $(printf '%s' "$CMD" | sed -n -E 's/.*[[:space:]](apply|undo)([[:space:]]|$).*/\1/p' | head -n 1)"; fi
# setup --from-env-local copies credentials to ~/.content-ops: outside the repo, so it asks like a write
if [ -z "$WRITE" ] && printf '%s' "$CMD" | grep -Eq '(content-ops(\.mjs)?|CONTENT_OPS_BIN)["'"'"']?[[:space:]]+setup([[:space:]]+[^[:space:]]+)*[[:space:]]+--from-env-local([[:space:]]|$)'; then
  ENV=$(printf '%s' "$CMD" | sed -n -E 's/.*--env[= ]+([^[:space:]"'"'"']+).*/\1/p' | head -n 1)
  PROD="no"; printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])--prod([[:space:]]|$)' && PROD="yes"
  REASON="CREDENTIALS: content-ops setup --from-env-local copies three Sitecore credentials for environment \\\"${ENV:-?}\\\" into ~/.content-ops (outside the repo); prod: $PROD. Approve only if you asked for this and the path is your own .env.local."
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}' "$REASON"
  exit 0
fi
[ -z "$WRITE" ] && exit 0
if [ "$WRITE" = "publish" ] && printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])--dry([[:space:]]|$)'; then exit 0; fi
ENV=$(printf '%s' "$CMD" | sed -n -E 's/.*--confirm[= ]+([^[:space:]"'"'"']+).*/\1/p' | head -n 1)
PROD="no"; printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])--prod([[:space:]]|$)' && PROD="yes"
if [ -n "$ENV" ]; then WHERE="environment \\\"$ENV\\\""; else WHERE="no --confirm given (the engine will refuse)"; fi
if [ "$PROD" = "yes" ]; then REASON="PRODUCTION WRITE: content-ops $WRITE on $WHERE; prod: yes. This changes the live site. Approve only if you asked for a production write, for this scope, in your own words."; else REASON="WRITE: content-ops $WRITE on $WHERE; prod: $PROD. Approve only if you asked for this write, for this environment and scope, in your own words."; fi
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}' "$REASON"
exit 0
