#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../fixtures/lib.sh"
copy_app
cp -R "$fixtures/specs" "$fixtures/plans" .
# No retros/ folder and no SDD_TELEMETRY_LEDGER: telemetry is off for this project.
commit_all "greeting-app fixture + SPEC-01 + PLAN-01"
