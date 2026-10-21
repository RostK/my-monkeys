#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../fixtures/lib.sh"
copy_app
cp -R "$fixtures/specs" .
commit_all "greeting-app fixture + approved SPEC-01" "plans/"   # plans/: where the run saves the plan
