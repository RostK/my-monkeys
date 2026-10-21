# Sourced by each case's scaffold.sh. The eval harness runs a scaffold as
# `bash <case>/scaffold.sh` with the empty run workspace as the current directory.
fixtures="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
plugin_root="$(cd "$fixtures/../.." && pwd)"

# Copies the shared two-track fixture app into the workspace.
copy_app() {
  cp -R "$fixtures/greeting-app/." .
}

# Commits the workspace as its own repository (worktrees and `git log` need one).
# Usage: commit_all <message> [path-the-run-writes...]
# engineering-paved-path's insights Stop hook nudges once when git sees a change made since
# the session started, and its extra turn replaces the answer the `last_message` graders
# read. The run's output paths therefore go in .git/info/exclude (ignored, yet invisible
# to the agent, unlike a .gitignore), and the commit is backdated so the hook never counts
# it as made during the session.
commit_all() {
  local message="$1"
  shift
  git init -q -b main
  printf '%s\n' "$@" >> .git/info/exclude
  git add -A
  GIT_AUTHOR_DATE=2026-01-05T09:00:00Z GIT_COMMITTER_DATE=2026-01-05T09:00:00Z \
    git -c user.name=eval -c user.email=eval@example.invalid commit -qm "$message"
}

# The 1.2.0 implementer loads skills with the Skill tool; a `skills:` key in its
# frontmatter would preload them and make the Skill-call graders meaningless.
require_no_preloaded_skills() {
  if sed -n '/^---$/,/^---$/p' "$plugin_root/agents/implementer.md" | grep -q '^skills:'; then
    echo "agents/implementer.md preloads skills (frontmatter skills:)" >&2
    exit 1
  fi
}
