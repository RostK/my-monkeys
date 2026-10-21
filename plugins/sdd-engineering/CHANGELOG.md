# Changelog

All notable changes to **sdd-engineering** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this plugin adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-10-21

All changes are to `skills/run-plan/SKILL.md`, and each closes a recommendation that recurred across
two retros of `run-plan` on one plan (95.3M tokens, then 494.8M with the orchestrator at 60% of it).

### Added
- **Test-quality gate in Phase 2.** A fourth parallel, read-only gate looks for assertions that
  cannot fail, new branches with no test, and real-time sleeps, and its findings are blocking. In
  both runs these surfaced only in Phase 4's `pr-self-review` and became a fix round of their own
  each time (about 16M tokens in one); now they join round 1.
- **Drift sweep at intake** (Phase 0 step 3). For each file and DOM hook a unit edits or moves, the
  orchestrator checks what landed on it since the plan was written and which tests name it. A PR
  merged after the plan had moved a `data-*` hook a test depended on, and blocked a unit mid-build.
- **Context pack at intake** (Phase 0 step 4). One short brief per task unit — its plan excerpt,
  only the learnings records that bear on its files, its known collisions — and workers are pointed
  at that, not at the whole plan, spec and learnings file. Both retros recommended a pack and
  neither run wrote one, so it is now a numbered step.
- **Human sensory gate** (Phase 3 triage). A finding about what a human perceives — screen-reader
  speech, visual judgement — gets a five-minute human check, after every machine-checkable part is
  cleared in the browser and before any fix is dispatched. A reviewer-prescribed fix for a 55 ms
  screen-reader announcement was built, tested and pushed, then removed once a human listened.
- **Shared-branch guardrail.** Once a background task or session has been spawned, the orchestrator
  checks `git log` against its own last commit before each commit and before reporting branch
  state, and names the branch a spawned task may write to.
- **Cost notes:** fixes are dispatched because every main-thread turn re-reads the whole
  conversation at the orchestrator's tier; and on a long run a phase boundary is a session boundary
  — offer a hand-off to a fresh session (or compact) after Phase 1 integration, after the fix loop,
  and at any human gate, with the plan file as the carried state.
- **Grounding pack.** `spec-creator` now records a `path:line → fact` list for every claim the spec
  rests on and returns it in its summary; `write-spec` carries it into each subsequent RESOLVE brief,
  and RESOLVE spot-checks it instead of re-deriving the codebase from zero. Two consecutive retros
  recommended this and it was the binding constraint on `write-spec` cost: without it a fresh agent
  re-grounds from nothing on every pass, so passes get *more* expensive as their scope shrinks
  (SPEC-02: 917k → 1.34M → 3.19M tokens, the last one merely folding in two answers). The escalation
  is re-grounding, not reasoning — SPEC-01's "resume re-bills the transcript" hypothesis is refuted
  and closed: that run used fresh agents throughout and escalated anyway.
- **"Enumerate, don't trust the brief."** When a brief supplies a set (versions, files, plugins),
  `spec-creator` must now derive the true set from the repo before writing ACs against it and report
  the delta — a brief's enumeration is a hypothesis to falsify, not an input to copy. SPEC-02's brief
  named two untagged plugin versions; the truth was three, and the third surfaced only in the final
  pass, by exactly this method. The agent's `Brief deltas` line reports what the brief got wrong.

### Changed
- **No carve-out from "you never write code".** Phase 3 step 4 now names the cases that were
  rationalised away — a "small" fix, a defect the orchestrator's own Phase 3.5 pass found, a
  `pr-self-review` finding in Phase 4, a review answer after a push — and sends all of them back
  through an `implementer` dispatch. Hard boundary 1 itself is unchanged.
- **Cheaper model tier for every inherited-model reviewer.** The sanctioned downgrade covered only
  `architecture-reviewer` and `plan-verifier`; it now covers any read-only review agent launched as
  `general-purpose` (line-level finders, the test-quality gate, `pr-self-review`'s bucket
  reviewers), which otherwise inherits the orchestrator's model. Same escape hatch: move back up if
  findings turn out false.
- **Worktree base is stated, not implied.** Agent worktrees are cut from the default branch, so
  step 0 of every implementer brief fast-forwards to the working branch at a named commit and checks
  it before any work; integration falls back to `git diff --cached --binary` → `git apply --index`
  when the project has no worktree-integration workflow of its own.
- **Phase 4's `pr-self-review` stays on the whole diff, and now says why**: its recorded verdict
  vouches for the entire pushed diff. Narrowing it to the delta since Phase 2 was considered and
  rejected for that reason.
- `README.md` — the loop diagram and the `run-plan` summary list the fourth review gate.
- **An unstated policy value is now an `NC-n`, never a silent default.** SLAs, acknowledgement
  windows, retention, thresholds, ownership are the maintainer's to decide. Filling one in quietly
  costs a full extra round: on SPEC-02 the author pass invented an acknowledgement window, resolve
  retracted it, and the retraction became a *new* NC that could have ridden in the first batch. Each
  NC now also carries a one-line "why the options differ" so it closes on the first ask.
- **Background research is the documented default.** `write-spec` step 2 now launches the researcher
  non-blocking and asks the user their `NC-n` questions while it runs, so research costs zero
  wall-clock instead of blocking the loop — proven on two runs (SPEC-02: 4.3 min fully hidden under
  an AskUserQuestion round). Applies equally to a `needs external research` NC surfaced by the draft.

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
