#!/usr/bin/env bash
# Release the marketplace: validate -> (optional version bump) -> annotated tag vX.Y.Z -> push.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$HERE/_common.sh"

usage() {
  cat <<'EOF'
Usage: scripts/release.sh <version> [options]

  <version>            Semver version to release, e.g. 1.2.0 (creates tag v1.2.0)

Options:
  --plugin <name>      Bump "version" in plugins/<name>/.claude-plugin/plugin.json
                       to <version> before tagging (requires jq)
  --message <text>     Annotated-tag / commit message (default: "Release v<version>")
  --no-push            Create the commit/tag locally but do not push
  --dry-run            Print the actions without changing anything
  -y, --yes            Do not prompt for confirmation
  -h, --help           Show this help

Environment:
  MAIN_BRANCH=main     Branch releases must be made from
  ALLOW_ANY_BRANCH=1   Permit releasing from a non-main branch
  SKIP_VALIDATE=1      Skip `claude plugin validate .`

Examples:
  scripts/release.sh 1.0.0
  scripts/release.sh 1.1.0 --plugin example-plugin
  scripts/release.sh 2.0.0 --no-push --dry-run
EOF
}

VERSION=""
PLUGIN=""
MESSAGE=""
PUSH=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plugin)  PLUGIN="${2:?--plugin needs a name}"; shift 2;;
    --message) MESSAGE="${2:?--message needs text}"; shift 2;;
    --no-push) PUSH=0; shift;;
    --dry-run) DRY_RUN=1; export DRY_RUN; shift;;
    -y|--yes)  ASSUME_YES=1; export ASSUME_YES; shift;;
    -h|--help) usage; exit 0;;
    -*)        die "Unknown option: $1 (see --help)";;
    *)         if [[ -z "$VERSION" ]]; then VERSION="$1"; else die "Unexpected argument: $1"; fi; shift;;
  esac
done

[[ -n "$VERSION" ]] || { usage; die "Missing <version>."; }

cd "$(repo_root)"

MAIN_BRANCH="${MAIN_BRANCH:-main}"
TAG="v$VERSION"
MESSAGE="${MESSAGE:-Release $TAG}"

# --- preconditions ---
ensure_has_commit
ensure_git_identity
ensure_branch "$MAIN_BRANCH"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]] \
  || die "Invalid version '$VERSION'. Expected semver like 1.2.0."
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1 && die "Tag $TAG already exists."
require_clean_tree

# --- optional plugin version bump ---
COMMIT_NEEDED=0
if [[ -n "$PLUGIN" ]]; then
  FILE="plugins/$PLUGIN/.claude-plugin/plugin.json"
  [[ -f "$FILE" ]] || die "Plugin manifest not found: $FILE"
  command -v jq >/dev/null 2>&1 || die "jq is required for --plugin (install jq, or edit $FILE by hand)."
  log "Bumping $FILE version -> $VERSION"
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf '   [dry-run] jq set .version=%s in %s\n' "$VERSION" "$FILE"
  else
    TMP="$(mktemp)"
    jq --arg v "$VERSION" '.version = $v' "$FILE" > "$TMP" && mv "$TMP" "$FILE"
    ok "Set $FILE version to $VERSION"
  fi
  run git add "$FILE"
  COMMIT_NEEDED=1
fi

validate_marketplace

# --- summary + confirm ---
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "Release plan:"
printf '     version : %s\n' "$VERSION"
printf '     tag     : %s\n' "$TAG"
printf '     branch  : %s\n' "$BRANCH"
[[ -n "$PLUGIN" ]] && printf '     bump    : plugins/%s/.claude-plugin/plugin.json\n' "$PLUGIN"
printf '     push    : %s\n' "$([[ "$PUSH" == 1 ]] && echo yes || echo 'no (local only)')"
confirm "Create release $TAG?" || die "Aborted."

# --- commit (only if something changed), tag, push ---
if [[ "$COMMIT_NEEDED" == 1 ]]; then
  run git commit -m "$MESSAGE"
fi
run git tag -a "$TAG" -m "$MESSAGE"
done_ok "Created tag $TAG"

if [[ "$PUSH" == 1 ]]; then
  run git push origin "$BRANCH"
  run git push origin "$TAG"
  done_ok "Pushed $BRANCH and $TAG to origin."
else
  warn "Not pushed. To publish later:  git push origin $BRANCH && git push origin $TAG"
fi

log "Users receive it after:  /plugin marketplace update"
