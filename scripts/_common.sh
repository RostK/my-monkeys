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

# validate_marketplace — AC-21: hard-fail when validation cannot run, never
# warn-and-continue. `SKIP_VALIDATE=1` is the ONLY opt-out. Routes through the
# root `npm run validate:manifests` (ajv, draft-07 + ajv-formats, against the
# repo's committed schemas — see scripts/validate-manifests.mjs) rather than
# the `claude` CLI, which this repo's scripts no longer depend on.
#
# Distinguishes two distinct failure causes rather than letting a missing
# `node_modules` masquerade as a broken catalog:
#   - node/npm missing from PATH, or root deps never installed (`npm ci`)
#     -> an actionable, named-cause message, not npm's raw ERR_MODULE_NOT_FOUND
#        stack trace.
#   - the catalog itself fails schema/containment validation -> unchanged.
# Both still fail closed (non-zero exit); this never auto-runs `npm ci` —
# that would be a surprising side effect for a release script to take.
validate_marketplace() {
  if [[ "${SKIP_VALIDATE:-0}" == "1" ]]; then
    warn "Skipping marketplace validation (SKIP_VALIDATE=1)."
    return 0
  fi
  command -v node >/dev/null 2>&1 \
    || die "'node' not found on PATH — marketplace validation ('npm run validate:manifests') requires it. Install Node.js, or set SKIP_VALIDATE=1 to skip validation."
  command -v npm >/dev/null 2>&1 \
    || die "'npm' not found on PATH — marketplace validation ('npm run validate:manifests') requires it. Install Node.js (it bundles npm), or set SKIP_VALIDATE=1 to skip validation."
  local root
  root="$(repo_root)"
  if [[ ! -d "$root/node_modules/ajv" ]]; then
    die "Root dependencies not installed (node_modules/ajv missing) — marketplace validation ('npm run validate:manifests') needs them. Run \`npm ci\` (or \`npm install\`) at the repo root first, or set SKIP_VALIDATE=1 to skip validation."
  fi
  log "Validating marketplace: npm run validate:manifests"
  npm run --silent validate:manifests \
    || die "Marketplace validation failed. Fix it, or set SKIP_VALIDATE=1 to skip validation."
}

confirm() {
  [[ "${ASSUME_YES:-0}" == "1" || "${DRY_RUN:-0}" == "1" ]] && return 0
  local prompt="${1:-Proceed?}" reply
  read -r -p "$prompt [y/N] " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]]
}

# --- Tag grammar (AC-17) -----------------------------------------------
#   Family P — per-plugin release: <plugin>--v<X.Y.Z>  (the 4 real tags today)
#   Family M — marketplace-wide snapshot: v<X.Y.Z>
#
# Ref-injection defense-in-depth: a computed tag is always passed to git as
# its own argv element (never interpolated into a shell string), and
# ensure_safe_ref_component() rejects a plugin name that could be
# misread as a git option or contain characters unsafe in a ref.

# family_p_tag <plugin> <version> — echoes the Family-P tag name.
family_p_tag() {
  local plugin="$1"
  local version="$2"
  printf '%s--v%s' "$plugin" "$version"
}

# family_m_tag <version> — echoes the Family-M tag name.
family_m_tag() {
  local version="$1"
  printf 'v%s' "$version"
}

# tag_exists <tag> — true if refs/tags/<tag> already exists. <tag> is always
# passed as a literal argv value, never shell-interpolated.
tag_exists() {
  local tag="$1"
  git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1
}

# ensure_safe_ref_component <value> <label> — dies if <value> could be
# misread as a git option (leading '-') or contains characters not safe to
# embed in a git ref / tag name.
ensure_safe_ref_component() {
  local value="$1"
  local label="$2"
  [[ "$value" != -* ]] || die "$label '$value' must not start with '-'."
  [[ "$value" =~ ^[A-Za-z0-9._-]+$ ]] || die "$label '$value' contains characters not allowed in a git ref."
}
