#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../fixtures/lib.sh"
copy_app
mkdir specs
head -4 "$fixtures/specs/INDEX.md" > specs/INDEX.md   # the table header only: no specs yet
commit_all "greeting-app fixture" "specs/"   # specs/: spec-creator writes here
