#!/usr/bin/env bash
# Shared helpers for the marketplace release/rollback scripts.
# Sourced by release.sh and rollback.sh — not meant to be run on its own.

set -euo pipefail

if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'; C_BLU=$'\033[34m'; C_RST=$'\033[0m'
else
  C_RED=''; C_GRN=''; C_YLW=''; C_BLU=''; C_RST=''
fi

log()  { printf '%s==>%s %s\n'  "$C_BLU" "$C_RST" "$*"; }
ok()   { printf '%sOK:%s %s\n'  "$C_GRN" "$C_RST" "$*"; }
# done_ok <msg> — success line, suppressed under DRY_RUN (the [dry-run] lines already narrate).
done_ok() { [[ "${DRY_RUN:-0}" == "1" ]] || ok "$*"; }
warn() { printf '%sWARN:%s %s\n' "$C_YLW" "$C_RST" "$*" >&2; }
die()  { printf '%sERROR:%s %s\n' "$C_RED" "$C_RST" "$*" >&2; exit 1; }

# run <cmd...> — execute the command, or just print it under DRY_RUN=1.
run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf '   [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || die "Not inside a git repository."
}

ensure_has_commit() {
  git rev-parse -q --verify HEAD >/dev/null 2>&1 \
    || die "The repository has no commits yet. Make an initial commit first."
}

ensure_git_identity() {
  if ! git config user.name >/dev/null 2>&1 || ! git config user.email >/dev/null 2>&1; then
    die "git user.name / user.email are not set. Configure them first, e.g.:
    git config user.name  \"Your Name\"
    git config user.email \"you@example.com\""
  fi
}

require_clean_tree() {
  git diff-index --quiet HEAD -- 2>/dev/null \
    || die "Working tree has uncommitted changes. Commit or stash them first."
}

ensure_branch() {
  local want="${1:-main}" cur
  cur="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$cur" != "$want" ]]; then
    if [[ "${ALLOW_ANY_BRANCH:-0}" == "1" ]]; then
      warn "On branch '$cur' (expected '$want') — allowed via ALLOW_ANY_BRANCH=1."
    else
      die "On branch '$cur', expected '$want'. Switch branches or set ALLOW_ANY_BRANCH=1."
    fi
  fi
}

validate_marketplace() {
  if [[ "${SKIP_VALIDATE:-0}" == "1" ]]; then
    warn "Skipping marketplace validation (SKIP_VALIDATE=1)."
    return 0
  fi
  if command -v claude >/dev/null 2>&1; then
    log "Validating marketplace: claude plugin validate ."
    claude plugin validate . || die "Marketplace validation failed. Fix it or set SKIP_VALIDATE=1."
  else
    warn "'claude' CLI not found on PATH — skipping validation (install Claude Code, or set SKIP_VALIDATE=1 to silence)."
  fi
}

confirm() {
  [[ "${ASSUME_YES:-0}" == "1" || "${DRY_RUN:-0}" == "1" ]] && return 0
  local prompt="${1:-Proceed?}" reply
  read -r -p "$prompt [y/N] " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]]
}
