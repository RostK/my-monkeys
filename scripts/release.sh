#!/usr/bin/env bash
# Release the marketplace: validate -> (optional version bump) -> annotated tag -> push.
# Tag grammar (AC-17): --plugin <name> cuts a Family-P tag <name>--v<version>;
# no --plugin cuts a Family-M tag v<version>. See README.md.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$HERE/_common.sh"

usage() {
  cat <<'EOF'
Usage: scripts/release.sh <version> [options]

  <version>            Semver version to release, e.g. 1.2.0

Options:
  --plugin <name>      Bump "version" in plugins/<name>/.claude-plugin/plugin.json
                       to <version> and cut a Family-P tag <name>--v<version>
                       (requires node)
  --message <text>     Annotated-tag / commit message (default: "Release <tag>")
  --no-push            Create the commit/tag locally but do not push
  --dry-run            Print the actions without changing anything
  -y, --yes            Do not prompt for confirmation
  -h, --help           Show this help

Tag grammar (AC-17 — see README.md):
  --plugin <name>      Family-P  <name>--v<version>   per-plugin release
  (no --plugin)        Family-M  v<version>            marketplace-wide snapshot

Environment:
  MAIN_BRANCH=main     Branch releases must be made from
  ALLOW_ANY_BRANCH=1   Permit releasing from a non-main branch
  SKIP_VALIDATE=1      Skip marketplace validation (npm run validate:manifests)

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

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]] \
  || die "Invalid version '$VERSION'. Expected semver like 1.2.0."

# --- AC-25/AC-17: compute the tag for the family actually being cut ---
if [[ -n "$PLUGIN" ]]; then
  ensure_safe_ref_component "$PLUGIN" "--plugin name"
  TAG="$(family_p_tag "$PLUGIN" "$VERSION")"
else
  TAG="$(family_m_tag "$VERSION")"
fi
MESSAGE="${MESSAGE:-Release $TAG}"

# --- preconditions ---
ensure_has_commit
ensure_git_identity
ensure_branch "$MAIN_BRANCH"
# AC-26: the guard checks the family actually being cut, not always Family-M.
tag_exists "$TAG" && die "Tag $TAG already exists."
require_clean_tree

# --- AC-27: collision-warn-and-confirm. A no-`--plugin` release whose
# version matches a plugin's CURRENT plugin.json version is probably a
# forgotten `--plugin` — warn and require confirmation, never tag over it
# silently. (Under DRY_RUN or ASSUME_YES, confirm() does not prompt.)
if [[ -z "$PLUGIN" ]]; then
  COLLIDING_PLUGINS=()
  for manifest in plugins/*/.claude-plugin/plugin.json; do
    [[ -f "$manifest" ]] || continue
    current_version="$(grep -m1 -oE '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$manifest" \
      | grep -oE '"[^"]*"$' | tr -d '"')"
    [[ "$current_version" == "$VERSION" ]] || continue
    plugin_dir="${manifest#plugins/}"
    plugin_name="${plugin_dir%%/*}"
    COLLIDING_PLUGINS+=("$plugin_name")
  done
  if [[ "${#COLLIDING_PLUGINS[@]}" -gt 0 ]]; then
    warn "Version $VERSION matches the CURRENT plugin.json version of: ${COLLIDING_PLUGINS[*]}."
    warn "Did you mean --plugin <name> instead of a Family-M release?"
    confirm "Continue cutting Family-M tag $TAG anyway?" || die "Aborted."
  fi
fi

# --- AC-21: validate BEFORE any write — a hard-fail here must leave a
# clean tree, so this runs before the --plugin bump below writes anything.
validate_marketplace

# --- optional plugin version bump ---
COMMIT_NEEDED=0
if [[ -n "$PLUGIN" ]]; then
  FILE="plugins/$PLUGIN/.claude-plugin/plugin.json"
  [[ -f "$FILE" ]] || die "Plugin manifest not found: $FILE"
  command -v node >/dev/null 2>&1 || die "node is required for --plugin (install Node.js, or edit $FILE by hand)."
  log "Bumping $FILE version -> $VERSION"
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf '   [dry-run] node: set "version" -> "%s" in %s\n' "$VERSION" "$FILE"
  else
    BUMP_SCRIPT="$(mktemp --suffix=.mjs)"
    trap 'rm -f "$BUMP_SCRIPT"' EXIT
    cat > "$BUMP_SCRIPT" <<'NODE_EOF'
// Bump the top-level "version" field of a plugin.json byte-stably: reuses
// gen-marketplace-versions.mjs's replaceEntryVersion() (AC-18's generator),
// which touches only the matched "version" value and leaves every other
// byte — 2-space indent, key order, CRLF/LF, trailing newline — untouched.
// This is the node replacement for the old `jq --arg v ... '.version = $v'`
// (jq is not a dependency of this repo; node already is, via AC-18).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [, , file, version] = process.argv;
const { replaceEntryVersion } = await import(
  pathToFileURL(resolve("scripts/gen-marketplace-versions.mjs")).href
);

const original = readFileSync(file, "utf8");
let before;
try {
  before = JSON.parse(original);
} catch (err) {
  console.error(`bump-version: ${file} is not valid JSON — ${err.message}`);
  process.exit(1);
}
if (typeof before.version !== "string") {
  console.error(`bump-version: ${file} has no "version" field`);
  process.exit(1);
}

const { text } = replaceEntryVersion(original, version);

let after;
try {
  after = JSON.parse(text);
} catch (err) {
  console.error(`bump-version: internal error producing ${file} — ${err.message}`);
  process.exit(1);
}
if (after.version !== version) {
  console.error(`bump-version: failed to set "version" in ${file}`);
  process.exit(1);
}

writeFileSync(file, text);
NODE_EOF
    node "$BUMP_SCRIPT" "$FILE" "$VERSION" || die "Failed to bump $FILE to $VERSION."
    rm -f "$BUMP_SCRIPT"
    trap - EXIT
    ok "Set $FILE version to $VERSION"
  fi
  run git add "$FILE"
  COMMIT_NEEDED=1
fi

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
