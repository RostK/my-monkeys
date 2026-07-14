# Changelog

All notable changes to **sdd-engineering** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this plugin adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-14

### Fixed
- **Telemetry ledger recorded nothing but `null`.** `scripts/capture-telemetry.mjs` read token counts
  from the hook payload (`evt.usage`, `evt.total_tokens`, `evt.duration_ms`, …), but the
  `SubagentStop`/`Stop` payload carries **no usage block at all** — so `status`, `tokens`,
  `inputTokens`, `outputTokens`, `toolUses` and `durationMs` were `null` on every row and `retro`
  had no cost data to aggregate. Usage is now read from the transcript the payload points at
  (`agent_transcript_path` for a subagent, `transcript_path` for the main thread), summing the
  `message.usage` of each assistant entry.
- **Unattributable rows.** A `SubagentStop` can arrive with `agent_type: ""`; the old label chain
  accepted the empty string. The label now falls back through the transcript's `attributionAgent`
  and then `agent_id`, so a row is never unattributable.

### Added
- **`cacheReadTokens`** (plus `cacheCreationTokens`) — makes cache-hit %, the primary
  cost-engineering signal, measurable for the first time. Also added `model`, `agentId` and
  `stopReason` to each row.
- **Incremental accounting.** A transcript accumulates — the main transcript grows every turn, and a
  *resumed* subagent re-appends to its existing one — so re-reading it whole would re-bill everything
  before it. A sidecar watermark (one file per transcript under `retros/.ledger-state/`) records the
  last entry already billed and each row now counts only what is new, so rows sum to the true total.
  This resolves the "cumulative or incremental?" ambiguity that made the 2026-07-14 write-spec retro
  report its token total as a range rather than a number. The watermark falls back to a timestamp
  cutoff when its anchor entry is gone (transcript compaction), and is stored per-transcript rather
  than in one shared file so that concurrently-exiting agents — `run-plan` fans implementers out in
  parallel — cannot lose each other's updates.

## [1.0.0] - 2026-07-13

### Added
- Initial release of the Spec-Driven Development workflow.
- **Agents:** `spec-creator`, `implementation-planner`, `implementer` (merged backend + UI),
  `plan-verifier`.
- **Skills:** `write-spec`, `requirements-engineering`, `plan-implementation`, `run-plan`
  (orchestrates build → review → fix → verify → gate), `retro` (documents harness performance).
- **Durable telemetry:** a `SubagentStop`/`Stop` hook (`scripts/capture-telemetry.mjs`) appends
  per-step telemetry to `retros/ledger.jsonl` so `retro` can aggregate performance across separately
  run steps.
- **Dependencies:** `engineering-paved-path`, `research-tools`, `architecture-review` (all `^1.0.0`),
  auto-installed with this plugin.
- Migrated and generalized from an internal SDD toolkit; all project-specific paths, packages, MCP
  tools, and names removed.
