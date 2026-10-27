#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../fixtures/lib.sh"
copy_app
cp -R "$fixtures/specs" "$fixtures/plans" "$fixtures/retros" .
# retros/ledger.jsonl mixes rows written before 1.2.0 (no modelCalls key, 2026-10-10) with
# 1.2.0 rows (modelCalls + peakContextTokens, 2026-10-20). retros/ is excluded whole, not
# only the ledger, because retro writes its report and trend row there.
commit_all "greeting-app fixture + SPEC-01 + PLAN-01" "retros/"
