#!/usr/bin/env bash
# Roll the marketplace back to a previous tag/commit by committing that snapshot
# forward on top of the current branch (no force-push, history preserved).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$HERE/_common.sh"

usage() {
  cat <<'EOF'
Usage: scripts/rollback.sh <tag-or-ref> [options]

  <tag-or-ref>         The known-good state to restore, e.g. v1.1.0 or a commit SHA

Options:
  --message <text>     Commit message (default: "Rollback to <ref> (<sha>)")
  --no-push            Commit locally but do not push
  --dry-run            Print the actions without changing anything
  -y, --yes            Do not prompt for confirmation
  -h, --help           Show this help

How it works:
  Creates a NEW commit whose tree matches <tag-or-ref>, on top of the current
  branch. No force-push is needed; users pick it up with `/plugin marketplace update`.

Environment:
  MAIN_BRANCH=main     Branch to roll back
  ALLOW_ANY_BRANCH=1   Permit rolling back a non-main branch
  SKIP_VALIDATE=1      Skip `claude plugin validate .`

Examples:
  scripts/rollback.sh v1.1.0
  scripts/rollback.sh v1.1.0 --dry-run
EOF
}

TARGET=""
MESSAGE=""
PUSH=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message) MESSAGE="${2:?--message needs text}"; shift 2;;
    --no-push) PUSH=0; shift;;
    --dry-run) DRY_RUN=1; export DRY_RUN; shift;;
    -y|--yes)  ASSUME_YES=1; export ASSUME_YES; shift;;
    -h|--help) usage; exit 0;;
    -*)        die "Unknown option: $1 (see --help)";;
    *)         if [[ -z "$TARGET" ]]; then TARGET="$1"; else die "Unexpected argument: $1"; fi; shift;;
  esac
done

[[ -n "$TARGET" ]] || { usage; die "Missing <tag-or-ref>."; }

cd "$(repo_root)"
MAIN_BRANCH="${MAIN_BRANCH:-main}"

# --- preconditions ---
ensure_has_commit
ensure_git_identity
ensure_branch "$MAIN_BRANCH"
git rev-parse -q --verify "$TARGET^{commit}" >/dev/null 2>&1 || die "Unknown tag/ref: $TARGET"
require_clean_tree

TARGET_SHA="$(git rev-parse --short "$TARGET")"
MESSAGE="${MESSAGE:-Rollback to $TARGET ($TARGET_SHA)}"

if git diff --quiet "$TARGET" HEAD --; then
  ok "Working state already matches $TARGET — nothing to roll back."
  exit 0
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "Changes that will be reverted (diff $TARGET..HEAD):"
git diff --stat "$TARGET" HEAD
confirm "Roll $BRANCH back to $TARGET ($TARGET_SHA)?" || die "Aborted."

# --- restore the target tree as a new forward commit ---
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  printf '   [dry-run] git read-tree -u --reset %s\n' "$TARGET"
  printf '   [dry-run] git commit -m "%s"\n' "$MESSAGE"
else
  git read-tree -u --reset "$TARGET"
  git commit -m "$MESSAGE"
  ok "Committed rollback to $TARGET."
fi

validate_marketplace

if [[ "$PUSH" == 1 ]]; then
  run git push origin "$BRANCH"
  done_ok "Pushed $BRANCH to origin."
else
  warn "Not pushed. To publish the rollback:  git push origin $BRANCH"
fi

log "Users receive it after:  /plugin marketplace update"
log "Note: plugins pinned by tag/sha in marketplace.json also need their ref updated to fully roll back."
