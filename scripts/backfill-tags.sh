#!/usr/bin/env bash
# Backfill the three historical Family-P release tags (<plugin>--v<X.Y.Z>) that
# shipped without one (SPEC-02 AC-22/AC-23, NC-12). Dry-run by default; --apply
# actually creates the tags. This script NEVER pushes — see "Safety" below.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$HERE/_common.sh"

usage() {
  cat <<'EOF'
Usage: scripts/backfill-tags.sh [--apply] [-y|--yes]

Backfills annotated Family-P tags for three plugin releases that shipped
without one (AC-23's wider Family-P invariant, AC-22 — see PLAN-02 T3):

  architecture-review--v1.1.0   @ 4f56941
  sdd-engineering--v1.1.0       @ 9bae60a
  sdd-engineering--v1.1.1       @ 1cf5ea9

These are the *authoring* commits, not `main`'s first-parent merge commits
(c143d3c / a779183 / 8ee05aa) — both satisfy AC-22 (reachability only), and
tagging the authoring commit is the deliberate, maintainer-confirmed choice.

Options:
  --apply     Actually create the tags (default: dry-run — print only)
  -y, --yes   Do not prompt for confirmation before applying
  -h, --help  Show this help

Safety:
  - Dry-run by default; nothing is written to the ref store unless --apply
    is passed.
  - This script NEVER pushes, with or without --apply. Tags are refs shared
    across git worktrees (they share one .git) — creating one from a
    worktree already writes the real, shared ref store. Pushing is a
    separate, deliberate maintainer action (project convention: no
    auto-commit/auto-push).
  - Idempotent: if a target tag already exists and points at the expected
    commit (as an annotated tag), it is left alone and reported as already
    up to date. If it exists but points somewhere else, the script REFUSES
    to touch it — NG-4 forbids moving or replacing a tag; investigate by
    hand.
  - Before creating each tag, re-verifies that the target commit's own
    plugins/<plugin>/.claude-plugin/plugin.json still declares the expected
    version, and aborts the whole run (nothing is tagged) if any manifest
    disagrees — a mis-targeted tag permanently cements a false claim once
    pushed (EC-10).
EOF
}

APPLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)   APPLY=1; shift;;
    -y|--yes)  ASSUME_YES=1; export ASSUME_YES; shift;;
    -h|--help) usage; exit 0;;
    *)         die "Unknown argument: $1 (see --help)";;
  esac
done

# `run()` (from _common.sh) executes real commands only when DRY_RUN!=1, and
# just prints them otherwise — reuse it by mapping our (inverted) --apply
# flag onto that convention.
DRY_RUN=1
[[ "$APPLY" == 1 ]] && DRY_RUN=0
export DRY_RUN

cd "$(repo_root)"
ensure_has_commit
[[ "$APPLY" == 1 ]] && ensure_git_identity

# --- the three backfill targets: plugin:version:authoring-commit-sha -------
# Hardcoded and historical by design — this is a one-time backfill, not a
# general "find every unshipped version" tool (that invariant is enforced
# continuously in CI instead; see PLAN-02 T5/R-3).
TARGETS=(
  "architecture-review:1.1.0:4f56941"
  "sdd-engineering:1.1.0:9bae60a"
  "sdd-engineering:1.1.1:1cf5ea9"
)

# extract_manifest_version <sha> <plugin> — print the "version" field of
# plugins/<plugin>/.claude-plugin/plugin.json as it reads AT <sha>, or fail.
# Uses `git show <sha>:<path>` (argv, no shell string built from the SHA/path)
# piped through `node` for a real JSON parse rather than a regex/grep scrape,
# so a maliciously-shaped manifest can't fool a naive text match.
extract_manifest_version() {
  local sha="$1" plugin="$2"
  local manifest="plugins/${plugin}/.claude-plugin/plugin.json"
  git show "${sha}:${manifest}" 2>/dev/null | node -e '
    let data = "";
    process.stdin.on("data", (c) => { data += c; });
    process.stdin.on("end", () => {
      try {
        const pkg = JSON.parse(data);
        if (typeof pkg.version !== "string" || !pkg.version) throw new Error("no version field");
        process.stdout.write(pkg.version);
      } catch {
        process.exit(1);
      }
    });
  '
}

log "Backfilling ${#TARGETS[@]} historical Family-P tag(s)$([[ "$APPLY" == 1 ]] || echo ' (dry-run — pass --apply to act)')."

PLANNED=0
for target in "${TARGETS[@]}"; do
  IFS=':' read -r plugin version sha <<<"$target"

  # Defense-in-depth: these three values are hardcoded above, not user
  # input, but validate shape anyway before they touch any git ref name —
  # a hostile "name" must never be able to smuggle an option flag or path
  # segment into a git command (security skill: argv, never a shell string).
  [[ "$plugin" =~ ^[a-zA-Z0-9._-]+$ ]] || die "Refusing unsafe plugin name: $plugin"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Refusing unsafe version: $version"
  [[ "$sha" =~ ^[0-9a-f]{7,40}$ ]] || die "Refusing unsafe commit SHA: $sha"

  tag="${plugin}--v${version}"
  manifest="plugins/${plugin}/.claude-plugin/plugin.json"

  git rev-parse -q --verify "${sha}^{commit}" >/dev/null 2>&1 \
    || die "Unknown commit '$sha' for target tag $tag."
  full_sha="$(git rev-parse "$sha")"

  actual_version="$(extract_manifest_version "$sha" "$plugin")" \
    || die "Could not read/parse $manifest at $sha — aborting, tagging nothing."
  [[ "$actual_version" == "$version" ]] || die "Manifest disagreement: $manifest at $sha declares version '$actual_version', expected '$version' for $tag. Refusing to create ANY of the three tags (EC-10: a mis-targeted backfill permanently cements a false claim, and NG-4 forbids moving a tag afterwards)."

  if git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; then
    existing_sha="$(git rev-list -n1 "refs/tags/$tag")"
    existing_type="$(git cat-file -t "refs/tags/$tag")"
    if [[ "$existing_type" == "tag" && "$existing_sha" == "$full_sha" ]]; then
      done_ok "$tag already exists, annotated, pointing at $full_sha — nothing to do (idempotent)."
      continue
    fi
    die "$tag already exists but is not the expected annotated tag at $full_sha (found: $existing_type at $existing_sha). Refusing to move or replace it — NG-4 forbids moving tags. Investigate by hand."
  fi

  msg="Backfill: $plugin $version (historical release, tagged post hoc per SPEC-02 AC-22/AC-23)"
  log "Will create: git tag -a $tag -m \"$msg\" $full_sha"
  PLANNED=$((PLANNED + 1))
  if [[ "$APPLY" == 1 ]]; then
    confirm "Create annotated tag $tag at $full_sha?" || die "Aborted before creating $tag. Any tag(s) already created earlier in this run were NOT rolled back (safe to re-run — idempotent)."
  fi
  run git tag -a "$tag" -m "$msg" "$full_sha"
  done_ok "Created $tag -> $full_sha"
done

if [[ "$APPLY" == 1 ]]; then
  log "Done. This script does not push — push explicitly when ready, e.g.:"
  for target in "${TARGETS[@]}"; do
    IFS=':' read -r plugin version _sha <<<"$target"
    printf '     git push origin refs/tags/%s--v%s\n' "$plugin" "$version"
  done
else
  log "Dry-run complete ($PLANNED tag(s) would be created; re-run with --apply to create them locally). Never auto-pushed."
fi
