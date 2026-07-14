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

- 2026-07-14 — **Never fall back from `agent_transcript_path` to `transcript_path` on a `SubagentStop`.** It looks
  like harmless defensiveness ("if the agent has no transcript, use the session's"), but the session transcript is
  the *main thread's*: the subagent row then bills main-thread turns as if the agent had spent them — a replay of a
  real session billed **27.2M tokens** to a one-line fake agent — *and* it advances the **main** transcript's
  watermark, so the real `Stop` row behind it reports zero. A step must bill its own transcript or nothing.
  Evidence: `scripts/capture-telemetry.mjs` (`transcriptPath` in `main`, fixed in 1.1.1).

## Codebase Patterns

- 2026-07-14 — A plugin edit in this repo is **not** what actually runs. The live hook is the installed copy at
  `~/.claude/plugins/cache/my-monkeys/<plugin>/<version>/`, so to verify a hook change in-session you must copy
  the file there; the repo source only reaches users after a push + marketplace auto-update (which creates a new
  versioned cache dir). Evidence: `hooks/hooks.json` runs `${CLAUDE_PLUGIN_ROOT}/scripts/capture-telemetry.mjs`.
  - 2026-07-14 (extends the above) — That cache copy is also **how you see a real hook payload**: the hook *command*
    is snapshotted at session start (so a hook added to settings mid-session never fires), but the *script file* it
    names is re-read on **every** event. So hot-patching the cached `.mjs` to append its raw stdin to a scratch file
    takes effect on the very next event, with no restart. That is the only way to answer "what does the harness
    actually send?" — the ledger shows what the hook *wrote*, not what it *received*, and the two differ precisely
    where the bug is. Procedure: back the file up, insert the dump, end the turn (a `Stop`/`SubagentStop` fires),
    poll for the dump from a `run_in_background` Bash command so it wakes you when it lands, then restore. Guard
    rail: the file is ESM — `require()` inside it is a `ReferenceError` swallowed by the hook's own try/catch, so
    the probe silently no-ops; use the already-imported `appendFileSync` and `node --check` the file before walking
    away, or you leave the user's live hook broken.
- 2026-07-14 — Telemetry convention: retro **reports** under `retros/` are committed; the raw `retros/ledger.jsonl`
  and its `retros/.ledger-state.json` watermark are machine-local and gitignored (the watermark is meaningless on
  another machine and would corrupt its accounting). Evidence: root `.gitignore`.

## Decisions

- 2026-07-14 — Ledger rows are **incremental, so they sum**: each row bills only what that step spent. Chosen over
  cumulative snapshots because `retro` needs to add rows across sessions without knowing which agents were resumed.
  Cost: a sidecar state file and a second failure mode (a lost watermark re-bills once). Evidence:
  `skills/retro/SKILL.md` (row schema table).
  - 2026-07-14 (sharpens the above) — That "lost watermark re-bills once" failure mode **fired immediately, and was
    then misdiagnosed.** The first `Stop` after the watermark shipped mid-session had no watermark yet, so it billed
    the whole transcript: 18.48M tokens over a 50-minute `durationMs`. That row was read as proof that "`Stop` rows
    carry cumulative session totals" — a rule that, had it been written into `retro`, would have made every future
    multi-phase retro *under*-report by differencing rows that are already deltas. **`Stop` rows are per-turn
    deltas**, verified by replaying the transcript: the 10:29 row (6,429,423) and the 10:31 row (2,258,041) each
    match their transcript delta *to the token*, and a cumulative series cannot decrease. A multi-million-token
    `Stop` row is simply real spend dominated by `cacheReadTokens` (the whole conversation, re-read every API call).
    Rows now carry **`coldStart`** so the one genuinely non-summable row is self-identifying rather than a judgement
    call. Lesson: before "correcting" telemetry for a suspected double-count, reconstruct one row from the source
    and check. Evidence: `scripts/capture-telemetry.mjs` (`coldStart`), `skills/retro/SKILL.md`.
- 2026-07-14 — The ledger records `cacheReadTokens` **and** `cacheCreationTokens` separately, because cache-hit % is
  `cacheReadTokens ÷ (inputTokens + cacheReadTokens + cacheCreationTokens)` — with `input_tokens` alone (often
  literally single digits, e.g. `2`) the ratio is meaningless. Evidence: `skills/retro/SKILL.md`.

## Tool & Library Notes

- 2026-07-14 — `agent_type` on `SubagentStop` **can legitimately be the empty string** `""` (seen on leftover /
  non-Task-launched agents), which is why a `pick()` that only skips `null`/`undefined` produced unattributable
  ledger rows. Treat blank strings as absent and fall back: `agent_type` → the transcript's `attributionAgent`
  (which carries the real agent name) → `agent_id`. Evidence: `scripts/capture-telemetry.mjs` (`pick`).
  - 2026-07-14 (corrects the above) — **Those blank-`agent_type` events were not agents at all.** The harness
    fires `SubagentStop` for its own **internal** agents, not only Task-tool ones: one fires whenever a new user
    prompt is processed (its `last_assistant_message` is the *user's* prompt text — e.g. the literal
    `/sdd-engineering:run-plan …` they typed), landing ~2s after the preceding main `Stop`. It carries
    `agent_type: ""` **and an `agent_transcript_path` that is never written to disk** — the session's whole
    `subagents/` directory need not even exist, while every real agent does have its file there. So labelling it
    via the `attributionAgent` → `agent_id` fallback did not rescue a real agent, it *named a ghost*: `retro`
    counts `SubagentStop` rows as "agents launched" and over-counted by one per user prompt (7 of 12 rows in one
    ledger). **A `SubagentStop` is only an agent if it has a label OR at least one transcript entry** — verify
    attribution before recording, never assume the event implies an agent. Evidence:
    `scripts/capture-telemetry.mjs` (phantom guard in `main`); real payload captured 2026-07-14T10:37:09Z.
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
- 2026-07-14 — **A ledger filter written as `tokens === 0` silently keeps the oldest bad rows: they hold `null`, and
  `null === 0` is `false`.** The ledger has three generations (pre-1.1.0 rows are all-`null`, 1.1.0 rows are `0`,
  1.1.1+ rows are absent-or-real), so any rule that reads across it must treat `null`/`undefined`/`0` alike — the
  obvious phantom filter dropped 4 of 7 phantoms and reported 8 agents where there were 5. Equally, do not filter on
  emptiness *alone*: a zero row **with a real agent label** is a genuine agent whose transcript was unreadable, and
  pre-1.1.0 rows are all-`null` yet real — it is the *label* that separates a ghost from a real agent, so test both
  halves. Evidence: `skills/retro/SKILL.md` ("Drop phantom `SubagentStop` rows").

## Session Notes

- 2026-07-14 — Fixed the telemetry hook (v1.0.0 → v1.1.0): usage now read from transcripts, added
  `cacheReadTokens` / `cacheCreationTokens` / `model` / `agentId` / `stopReason`, guaranteed a non-empty agent
  label, and made rows incremental via a watermark. Verified live: two `SubagentStop` rows landed in
  `retros/ledger.jsonl` fully populated (86% and 77% cache-hit), zero null cost fields.

- 2026-07-14 — Fixed the phantom agent rows (v1.1.0 → v1.1.1). Captured a real `SubagentStop` payload by
  hot-patching the live cached hook: it proved the phantom is an **internal harness agent** (`agent_type: ""`, an
  `agent_transcript_path` that is never written) fired on each new user prompt — not a race, and not a real agent.
  The hook now records nothing for an event with neither a label nor a transcript entry, and no longer lets a
  subagent bill the main transcript. `retro` gained a defence-in-depth reader filter for the phantom rows already
  in older ledgers. Verified by replaying the captured payload plus 5 regression cases (real planner, blank-label
  real agent, unreadable-transcript real agent, cross-billing) — all pass; on the released 1.1.0 the same suite
  fails 3. Also disproved this session's premise that `Stop` rows are cumulative (see Decisions).

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
