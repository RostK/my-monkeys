# Changelog

All notable changes to **sdd-engineering** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this plugin adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-07-14

### Fixed
- **Phantom agents in the ledger.** `scripts/capture-telemetry.mjs` wrote a `SubagentStop` row ~2 s
  after every main `Stop`, with all-zero usage and the raw `agentId` as its label. The harness fires
  `SubagentStop` for its own **internal** agents, not only for Task-tool ones: one trails every main
  turn carrying `agent_type: ""` and an `agent_transcript_path` that is never written to disk (the
  session's `subagents/` directory need not even exist). No agent ran and nothing could be billed, so
  the hook produced an empty row — and `retro`, which counts `SubagentStop` rows to report *"N agents
  launched"*, counted it as an agent, inflating the count by roughly one per main turn. A
  `SubagentStop` with neither an agent label nor a single transcript entry is now not recorded at all.
  (This also supersedes 1.1.0's reading of `agent_type: ""` as "an unattributable *real* launch": the
  blank-labelled rows it was fixing were these phantoms.)
- **A subagent could be billed for main-thread tokens.** The transcript lookup fell back from
  `agent_transcript_path` to the session's `transcript_path`, so a `SubagentStop` arriving without its
  own transcript aggregated the **main** transcript instead — inventing that agent's cost out of
  main-thread turns (27.2 M tokens in a replay of a real session) *and* advancing the main watermark,
  which would then zero out the real `Stop` row behind it. A subagent now bills its own transcript or
  nothing.

### Added
- **`coldStart`** on every row — `true` when no watermark existed yet, so the row bills its transcript
  from the first entry rather than from the last step. Normal on a `SubagentStop` (an agent's
  transcript *is* one step); on a `Stop` row it is a warning that the row covers the whole session to
  that point and must not be summed with the session's other `Stop` rows. Happens when the hook is
  installed or upgraded mid-session, or when the machine-local `retros/.ledger-state/` is wiped — and
  it is what made one 2026-07-14 `Stop` row report 18.48 M tokens across 50 minutes, which was
  misread at the time as evidence that `Stop` rows are cumulative. They are not: every other `Stop`
  row matches its transcript delta exactly.

### Changed
- `skills/retro/SKILL.md` — the ledger reader now (a) skips phantom `SubagentStop` rows still present
  in older ledgers (`tokens === 0 && toolUses === 0` **and** unattributable), while keeping a *labelled*
  zero row as a real agent with an unreadable transcript; (b) documents `coldStart` and the one case
  where `Stop` rows must not be summed; and (c) states plainly that a multi-million-token `Stop` row is
  real spend dominated by `cacheReadTokens`, not a cumulative total to be "corrected".

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
