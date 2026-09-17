#!/bin/bash
#
# Dumps the database, commits everything, and pushes to GitHub.
#
#   ./backup.sh            run a backup now
#   ./backup.sh --dry-run  do everything except commit and push
#
# Safe to run when nothing has changed (it exits without committing) and safe
# to run unattended from cron — node is resolved explicitly below because
# cron does not get nvm's PATH.
#
# Refuses to push if a live credential appears in the staged diff.

set -euo pipefail

REPO="/Users/nehemiahc/vibeWP-builder"
APP="$REPO/app"
LOG="$REPO/backups/backup.log"
BRANCH="main"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

mkdir -p "$(dirname "$LOG")"
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }
fail() { log "FAILED: $*"; exit 1; }

# --- resolve node (cron has no nvm) -----------------------------------------
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  # newest nvm install, then common system locations
  for candidate in \
    "$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)" \
    /opt/homebrew/bin/node \
    /usr/local/bin/node
  do
    [ -x "${candidate:-}" ] && { NODE_BIN="$candidate"; break; }
  done
fi
[ -n "$NODE_BIN" ] || fail "could not find node"
export PATH="$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

cd "$REPO" || fail "repo not found at $REPO"

log "=== backup started ==="

# --- 1. dump the database ----------------------------------------------------
# Uses the repo-local tsx rather than npx, so it works offline.
TSX="$APP/node_modules/.bin/tsx"
[ -x "$TSX" ] || fail "tsx not installed — run 'npm install' in $APP"
( cd "$APP" && "$NODE_BIN" "$TSX" lib/db/backup-db.ts ) >>"$LOG" 2>&1 \
  || fail "database dump failed (see $LOG)"
log "database dumped"

# --- 1b. archive the media store ---------------------------------------------
# Published Vibe sites serve their photographs from VIBEWP_MEDIA_ROOT. After a
# publish the page schema points at OUR copy, so losing that directory loses a
# client's images — the Pexels address is kept alongside as sourceUrl, which
# makes recovery a re-fetch rather than a redraw, but only for stock photos.
#
# Committed as one gzipped tar rather than loose files: git is a poor home for
# binaries and a worse one for thousands of them. The size guard is the point
# at which that stops being a reasonable trade — a repo is not object storage,
# and crossing it is the signal to swap the media store's driver (see
# lib/media/store.ts) rather than to raise the limit.
MEDIA_ROOT="${VIBEWP_MEDIA_ROOT:-${VIBEWP_SITES_ROOT:-$HOME/vibewp-sites}/_media}"
MEDIA_MAX_MB=200

if [ -d "$MEDIA_ROOT" ]; then
  MEDIA_MB=$(du -sm "$MEDIA_ROOT" 2>/dev/null | cut -f1)
  if [ "${MEDIA_MB:-0}" -gt "$MEDIA_MAX_MB" ]; then
    log "WARNING: media store is ${MEDIA_MB}MB (limit ${MEDIA_MAX_MB}MB) — NOT backed up."
    log "         Move media to object storage, or raise MEDIA_MAX_MB knowingly."
  else
    mkdir -p "$REPO/backups"
    tar -czf "$REPO/backups/media.tar.gz" -C "$(dirname "$MEDIA_ROOT")" "$(basename "$MEDIA_ROOT")" \
      || fail "media archive failed"
    log "media archived (${MEDIA_MB:-0}MB)"
  fi
else
  log "no media store at $MEDIA_ROOT — nothing to archive"
fi

# --- 2. stage ----------------------------------------------------------------
git add -A

if git diff --cached --quiet; then
  log "no changes — nothing to back up"
  log "=== backup finished (no-op) ==="
  exit 0
fi

CHANGED=$(git diff --cached --name-only | wc -l | tr -d ' ')
log "$CHANGED file(s) changed"

# --- 3. safety: never push credentials ---------------------------------------
# Fails closed — on any hit the staging area is reset and nothing is pushed.
if git diff --cached --name-only | grep -qE '(^|/)\.env($|\.)' ; then
  git reset -q
  fail "an .env file was staged — aborting, nothing pushed"
fi

if git diff --cached | grep -qE 'AIza[0-9A-Za-z_-]{30}|sk-ant-[A-Za-z0-9-]{20}|sk-[A-Za-z0-9]{32}|eyJhbGciOi[A-Za-z0-9._-]{20}|postgres(ql)?://[^[:space:]"'"'"']*:[^[:space:]"'"'"']*@'; then
  git reset -q
  fail "possible live credential in staged changes — aborting, nothing pushed"
fi
log "credential scan clean"

if [ "$DRY_RUN" -eq 1 ]; then
  log "dry run — not committing or pushing"
  git reset -q
  log "=== backup finished (dry run) ==="
  exit 0
fi

# --- 4. commit and push ------------------------------------------------------
git commit -q -m "Update backup $(date '+%Y-%m-%d %H:%M')" || fail "commit failed"
git push -q origin "$BRANCH" 2>>"$LOG" || fail "push failed — check network/SSH (see $LOG)"

# --- 5. verify it actually landed --------------------------------------------
git fetch -q origin "$BRANCH" 2>/dev/null || true
LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo none)"
[ "$LOCAL_HEAD" = "$REMOTE_HEAD" ] || fail "push reported success but remote is at $REMOTE_HEAD"

log "pushed ${LOCAL_HEAD:0:7} — $CHANGED file(s)"
log "=== backup finished ==="
