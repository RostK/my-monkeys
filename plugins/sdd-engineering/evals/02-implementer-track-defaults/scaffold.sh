#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../fixtures/lib.sh"
require_no_preloaded_skills
copy_app
commit_all "greeting-app fixture" ".claude/"   # .claude/: the implementer's worktree
