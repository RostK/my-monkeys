# LEARNINGS — sdd-engineering

Durable, non-obvious learnings for this plugin. Append-only: correct a stale record with a
new dated note beneath it, never rewrite. See `engineering-paved-path:engineering-insights`.

## What Works

- 2026-07-14 — Per-agent usage must be read from the **transcript**, not the hook payload. `SubagentStop`
  gives `agent_transcript_path` (the agent's own JSONL) and `Stop` gives `transcript_path` (the session's);
  sum `message.usage` over each `role: "assistant"` entry — `input_tokens`, `output_tokens`,
  `cache_read_input_tokens`, `cache_creation_input_tokens`. `tool_use` counts = `tool_use` blocks in
  `message.content`; duration = last minus first entry `timestamp`. Evidence: `scripts/capture-telemetry.mjs`.

## What Doesn't Work

- 2026-07-14 — **The `SubagentStop`/`Stop` hook payload carries no usage block at all.** It has only
  `session_id`, `agent_id`, `agent_type`, `transcript_path`, `agent_transcript_path`, `permission_mode`,
  `last_assistant_message`, `stop_hook_active`. Reading `evt.usage` / `evt.total_tokens` / `evt.duration_ms` /
  `evt.tool_use_count` — as the v1.0.0 hook did — silently yields `null` on every field and produces a ledger
  with no cost data. Dump a real payload before coding against it; do not infer the shape. Evidence:
  `scripts/capture-telemetry.mjs` (fixed in 1.1.0).
- 2026-07-14 — **Never aggregate a whole transcript per event: transcripts accumulate.** The main transcript
  grows every turn and a *resumed* subagent re-appends to its existing file, so re-reading it whole re-bills
  everything that came before (observed: a second `Stop` re-counted 13.4M tokens). Use the per-transcript uuid
  watermark in `retros/.ledger-state.json` and bill only entries after it. This is what made the 2026-07-14
  write-spec retro unable to say whether the resumed `spec-creator`'s 98k was cumulative or incremental.
  Evidence: `scripts/capture-telemetry.mjs` (`sliceNew`, `lastAnchor`).
- 2026-07-14 — **A watermark keyed only by uuid, in one shared state file, has two silent failure modes** —
  both of which re-bill an entire transcript, i.e. the very inflation the watermark exists to prevent. (1) If
  the anchor entry is gone (transcript compaction rewrites history), `findIndex` returns -1 → falls back to
  "bill everything". Carry the anchor's **timestamp** and cut on that instead. (2) A single shared state file is
  read-modify-written by every hook process, and `run-plan` fans out implementers that exit simultaneously →
  lost update; if the wiped key is the *main* transcript's, the next `Stop` re-bills the whole session. Store one
  watermark file per transcript (hashed path) so there is no shared mutable state. Evidence:
  `scripts/capture-telemetry.mjs` (`markPathFor`, `sliceNew`).

## Codebase Patterns

- 2026-07-14 — A plugin edit in this repo is **not** what actually runs. The live hook is the installed copy at
  `~/.claude/plugins/cache/my-monkeys/<plugin>/<version>/`, so to verify a hook change in-session you must copy
  the file there; the repo source only reaches users after a push + marketplace auto-update (which creates a new
  versioned cache dir). Evidence: `hooks/hooks.json` runs `${CLAUDE_PLUGIN_ROOT}/scripts/capture-telemetry.mjs`.
- 2026-07-14 — Telemetry convention: retro **reports** under `retros/` are committed; the raw `retros/ledger.jsonl`
  and its `retros/.ledger-state.json` watermark are machine-local and gitignored (the watermark is meaningless on
  another machine and would corrupt its accounting). Evidence: root `.gitignore`.

## Decisions

- 2026-07-14 — Ledger rows are **incremental, so they sum**: each row bills only what that step spent. Chosen over
  cumulative snapshots because `retro` needs to add rows across sessions without knowing which agents were resumed.
  Cost: a sidecar state file and a second failure mode (a lost watermark re-bills once). Evidence:
  `skills/retro/SKILL.md` (row schema table).
- 2026-07-14 — The ledger records `cacheReadTokens` **and** `cacheCreationTokens` separately, because cache-hit % is
  `cacheReadTokens ÷ (inputTokens + cacheReadTokens + cacheCreationTokens)` — with `input_tokens` alone (often
  literally single digits, e.g. `2`) the ratio is meaningless. Evidence: `skills/retro/SKILL.md`.

## Tool & Library Notes

- 2026-07-14 — `agent_type` on `SubagentStop` **can legitimately be the empty string** `""` (seen on leftover /
  non-Task-launched agents), which is why a `pick()` that only skips `null`/`undefined` produced unattributable
  ledger rows. Treat blank strings as absent and fall back: `agent_type` → the transcript's `attributionAgent`
  (which carries the real agent name) → `agent_id`. Evidence: `scripts/capture-telemetry.mjs` (`pick`).
- 2026-07-14 — A transcript's **last entries are uuid-less metadata records** (`type: "last-prompt"`,
  `type: "ai-title"`). Anchoring a watermark on `entries[entries.length - 1]` therefore saves nothing and silently
  re-bills the whole file next time. Always scan backwards for the last entry that *has* a `uuid`. Evidence:
  `scripts/capture-telemetry.mjs` (`lastAnchor`).
- 2026-07-14 — `readFileSync(0, 'utf8')` returns **empty** when stdin is a Git Bash *pipe* on Windows (works fine on
  a real fd, which is what the harness gives a hook). Test a stdin-reading hook with a redirect — `node hook.mjs
  < payload.json` — not `cat payload.json | node hook.mjs`, or you will chase a phantom "payload not parsed" bug.

## Recurring Errors & Fixes

- 2026-07-14 — Ledger row with all-zero token fields ≠ a free step. It means the transcript was unreadable or
  already billed. `retro` must report such a row as `unknown`, never `0`. Evidence: `skills/retro/SKILL.md`.

## Session Notes

- 2026-07-14 — Fixed the telemetry hook (v1.0.0 → v1.1.0): usage now read from transcripts, added
  `cacheReadTokens` / `cacheCreationTokens` / `model` / `agentId` / `stopReason`, guaranteed a non-empty agent
  label, and made rows incremental via a watermark. Verified live: two `SubagentStop` rows landed in
  `retros/ledger.jsonl` fully populated (86% and 77% cache-hit), zero null cost fields.

## Open Questions

- 2026-07-14 — The 9 pre-1.1.0 null rows in the `reload-skills-9ac602` worktree's `retros/ledger.jsonl` are not
  repairable from the payloads, but the surviving subagent transcripts under
  `~/.claude/projects/<project>/<session>/subagents/` could be replayed to backfill them. Not done — decide whether
  the 2026-07-14 write-spec retro is worth restating with real numbers.
  - 2026-07-14 (resolved) — **Decided not to backfill.** The write-spec retro already sourced those figures from
    in-context notifications; the only residual cost is that its token total stays a range `[134k, 199k]` rather
    than a number. Treat the pre-1.1.0 rows as permanently `unknown` and do not attempt to reconstruct them.
- 2026-07-14 — A `Stop` row's `durationMs` spans the whole turn including user think-time, so it is not comparable
  to a subagent's `durationMs`. `retro` currently makes no distinction; decide whether main-thread wall-clock
  should be measured differently before using it in the parallelism factor.
  - 2026-07-14 (resolved) — **Decided to keep `Stop` rows as-is, duration included**, and to fix the consumer
    instead: `retro` now states that a `Stop` row's tokens count toward totals but its duration must never feed the
    parallelism factor. Evidence: `skills/retro/SKILL.md`.
