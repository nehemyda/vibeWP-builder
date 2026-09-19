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

# Local settings, outside the repo and outside git. Holds VIBEWP_MEDIA_REMOTE.
# Sourced rather than assumed from the environment because cron has neither a
# shell profile nor the variables an interactive session picks up.
[ -f "$HOME/.vibewp-backup.conf" ] && . "$HOME/.vibewp-backup.conf"

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

# --- media mirror ------------------------------------------------------------
# Image bytes from Supabase Storage, copied to a directory OUTSIDE the repo.
#
# Outside because git keeps every version of every binary for the life of the
# repository and this grows with each client upload. The ROWS that point at
# these files are in the dump above — those diff, and belong in a commit.
#
# Runs on every invocation, including one where the database has not changed.
# Tying it to "something to commit" would mean a mirror that failed yesterday
# is never retried, because the failure itself changes nothing to commit.
MEDIA_OK=1
MEDIA_DIR="${VIBEWP_MEDIA_BACKUP_DIR:-$HOME/vibewp-backups/media}"

mirror_media() {
  if ( cd "$APP" && "$NODE_BIN" "$TSX" lib/db/backup-media.ts "$@" ) >>"$LOG" 2>&1; then
    log "media: $(grep -E '^(\[dry run\] )?media:' "$LOG" | tail -1 | sed 's/^[^:]*media: //')"
  else
    MEDIA_OK=0
    log "media mirror FAILED (see $LOG)"
  fi
}

# --- off-site ----------------------------------------------------------------
# Pushes the local mirror somewhere that is not this machine.
#
# COPY, NOT SYNC, deliberately. sync makes the destination match the source,
# deletions included — so pruning the local mirror would delete the off-site
# copy too, which is the failure the mirror itself refuses to commit. copy only
# ever adds. The remote grows; that is the point of it.
#
# The destination is named by VIBEWP_MEDIA_REMOTE (e.g. "b2:vibewp/media") and
# rclone holds the credentials in its own config. Nothing secret reaches this
# script or the repository.
push_offsite() {
  if ! command -v rclone >/dev/null 2>&1; then
    MEDIA_OK=0
    log "off-site FAILED: rclone is not installed"
    return
  fi

  if [ -z "${VIBEWP_MEDIA_REMOTE:-}" ]; then
    # Said on every run, on purpose. A backup that only exists on the machine
    # it is backing up is the thing this whole step exists to fix, and it must
    # never be possible to believe it is handled when it is not.
    log "off-site: NOT CONFIGURED — media exists only on this machine"
    log "          set VIBEWP_MEDIA_REMOTE in ~/.vibewp-backup.conf"
    return
  fi

  if rclone copy "$MEDIA_DIR" "$VIBEWP_MEDIA_REMOTE" "$@" >>"$LOG" 2>&1; then
    log "off-site: copied to $VIBEWP_MEDIA_REMOTE"
  else
    MEDIA_OK=0
    log "off-site FAILED: rclone copy to $VIBEWP_MEDIA_REMOTE (see $LOG)"
  fi
}

# Whatever else happened, do not report success when the images did not copy.
finish() {
  if [ "$MEDIA_OK" -eq 0 ]; then
    log "=== backup finished, MEDIA INCOMPLETE ==="
    exit 1
  fi
  log "=== backup finished${1:+ $1} ==="
  exit 0
}

cd "$REPO" || fail "repo not found at $REPO"

log "=== backup started ==="

# --- 1. dump the database ----------------------------------------------------
# Uses the repo-local tsx rather than npx, so it works offline.
TSX="$APP/node_modules/.bin/tsx"
[ -x "$TSX" ] || fail "tsx not installed — run 'npm install' in $APP"
( cd "$APP" && "$NODE_BIN" "$TSX" lib/db/backup-db.ts ) >>"$LOG" 2>&1 \
  || fail "database dump failed (see $LOG)"
log "database dumped"

if [ "$DRY_RUN" -eq 1 ]; then
  mirror_media --dry-run
  push_offsite --dry-run
else
  mirror_media
  push_offsite
fi

# --- 2. stage ----------------------------------------------------------------
git add -A

if git diff --cached --quiet; then
  log "no changes — nothing to back up"
  finish "(no-op)"
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
  finish "(dry run)"
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
finish
