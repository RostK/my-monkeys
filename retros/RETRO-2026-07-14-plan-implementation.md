# Workflow Retro — `sdd-engineering:plan-implementation` · 2026-07-14

**Scope:** the plan-implementation phase for SPEC-01 (`preview` module) — intake → plan → clarify →
persist → gate. Run-plan has not been executed.
**Time window:** 2026-07-14 10:04Z–10:25Z (~20 min wall).
**Source:** ✅ **durable ledger `retros/ledger.jsonl` — REAL telemetry, first time.** The hook fix
(`9bae60a`, merged to `main` mid-session) landed while this phase was running, so the planner's row is
the first fully-populated record this project has ever had. Cache-hit is measurable at last.

## Run summary

| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `sdd-engineering:implementation-planner` | Plan | `claude-opus-4-8` | completed (`end_turn`) | 76 uncached in · **47,548 out** · 1,534,773 cache-read · 283,271 cache-write · **1,865,668 total** | **84.4 %** | 22 | **610.4 s** | Produced the whole 55 KB plan in one pass. No retry. |
| — | `main` (orchestrator) | all | `claude-opus-4-8` | completed | 154,395 out · 17,407,346 cache-read · **18,476,652 total** | 94.9 % | 65 | 2,991.8 s | ⚠️ **Cumulative for the WHOLE session** (write-spec + retro + supersede + plan). Cannot be attributed to this phase alone — see Honesty note. |
| — | *(phantom row)* | — | — | `unknown` | 0 / 0 | 0 | 0 | — | Zero-usage `SubagentStop` fired 2 s after the main `Stop`. **Not a real agent.** See Finding 2. |

Researchers fanned out: **0** (the planner explicitly reported *"Research needed: **None**"* and justified it).
Failed: **0**. Killed: **0**. Duplicate launches: **0**. Retries: **0**.

## Metrics

- **Agents:** 1 launched · **1 productive · 0 wasted/retried** · Fix-loop rounds: **0**
- **Clarification rounds:** **1** (4 questions, batched; **all four answered on the first pass** with the
  recommended default — zero follow-up rounds)
- **Tokens (planner, exact):** **1,865,668** total — 47,548 output, 1,534,773 cache-read, 283,271
  cache-write, 76 uncached input.
- **Cache-hit: 84.4 %** (1,534,773 ÷ 1,818,120 input-side). *The first cache-hit figure this project
  has ever been able to compute.* The 283 K cache-write is the planner cold-reading the spec + codebase
  on its first turn; everything after rode the cache.
- **Tool-calls:** 22 (planner) · 65 (main, cumulative session)
- **Wall-clock ≈ 1,200 s** vs **sum-of-agent-time 610 s**. Single agent → **no parallelism to measure**.
  The ~590 s gap is main-thread reasoning, the question round, persisting the plan, and the gate.
- **Nesting:** none — the planner spawned no children, so no undercount.
- **Rework traced to:** planner grounding (one obsolete task unit — see Finding 4).

## What went well / hard

- **Hard — the planner (1.87 M tokens, 22 tools, 610 s).** By far the most expensive single agent of
  the entire session, and the longest. **Justified.** It returned a 55 KB plan with 7 task units, a
  verified-disjoint parallelization graph, all 30 ACs mapped with their `Verify:` hints carried
  through, a pinned sidecar schema, and a bundle-budget arithmetic that *changed the plan* (net ≈ 7–8
  KB of the 12 KB ceiling → PI-2 "delete `haystack`" promoted from optional to load-bearing, and a
  stemmer package ruled out). That is a lot of decision-quality per token.
- **Well — it flagged what it could not verify instead of guessing.** MiniSearch is not yet a
  dependency, so it could not confirm the v7 option surface in-repo. Rather than dress that up as
  certainty, it made *"read `node_modules/minisearch/dist/*.d.ts` before wiring the config"* a
  **definition-of-done item in T4**, and wrote: *"treat any option I named that isn't in the `.d.ts`
  as my error."* That is the behaviour you want from an expensive agent.
- **Well — one question round, zero follow-ups.** All four questions (initial keywords, bundle
  baseline, stop-word policy, execution mode) were answered on the first pass. **This is
  RETRO-01 Recommendation 3 working** — see Trend.

## Duplicated context (redundant grounding)

**Essentially none — a marked improvement on the baseline run.**

RETRO-01 found the main thread re-reading the same files the subagent had already read, because
`spec-creator` returned conclusions without its evidence. The planner did the opposite: its plan is
dense with `path:line` citations (`search.js:28`, `build-index.mjs:81`, `data.js:30`,
`preview-build.yml:26`, `LEARNINGS.md:17`…). **I did not need to re-read a single file to persist,
validate, or gate it.** The only main-thread reads this phase were the ledger and git — both
genuinely new information.

This validates RETRO-01 Recommendation 2 without it having been formally implemented: an agent that
cites its grounding inline removes the orchestrator's need to re-derive it.

## Missed / rework

1. **The planner proposed a task unit for work that was already done and committed.** T8 ("add a
   supersede pointer to `docs/SPEC-marketplace-ui.md`") duplicated commit `7f27ca3`, which landed at
   **11:03:02 local — roughly two minutes *before* the planner even started** (it ran ~11:04:49 →
   11:14:59). The file on disk already carried the markers.
   **Root cause:** the planner converted SPEC-01 §11's cross-module-impact bullet — *"a pointer to
   SPEC-01 is added"* — into a task unit **without checking the file against the working tree.** It
   trusted the spec's prose over the repository state.
   **Cost:** caught by the orchestrator at persist time and tombstoned, so nothing shipped. Had it not
   been caught, a T8 implementer would have re-marked an already-marked document, likely producing a
   confusing double-supersede diff.
2. **The `AskUserQuestion` degradation is real but expected.** The planner's agent definition lists
   `AskUserQuestion`, yet it reported *"I have no AskUserQuestion tool in this harness"* and fell back
   to recommended defaults. The skill anticipates exactly this (*"a subagent cannot reliably prompt the
   user"*), and the orchestrator relayed the questions. **Working as designed — but the agent
   definition advertises a tool the agent cannot use, which is what made the planner spend output
   tokens explaining the gap.**
3. **The telemetry hook still emits a phantom row.** See Finding 2 below.

## Findings on the telemetry system itself

1. **The ledger fix works.** `9bae60a` added `agentId`, `model`, `stopReason`, `cacheReadTokens`,
   `cacheCreationTokens` and — crucially — actually populates `status`, `inputTokens`, `outputTokens`,
   `toolUses`, `durationMs`. Rows 1–11 (pre-fix) are still all-null; row 12 onward is live. **Future
   retros will have real cross-session data.**
2. **A phantom `SubagentStop` fires ~2 s after every main `Stop`**, with `status: "unknown"`, all-zero
   usage, and the raw `agentId` as its `agent` label. It is systematic — the same pattern appears at
   09:50:43, 09:53:17, 09:57:46 (pre-fix, blank label) and 10:23:12 (post-fix, id-as-label). **It is
   not a real agent, and it will inflate the agent count of every future retro** unless filtered.
   Recommended filter: drop `SubagentStop` rows whose `tokens === 0 && toolUses === 0`.
3. **`Stop` rows are cumulative-session, not per-turn.** Row 13 reports 18.48 M tokens and 49.9 min —
   the whole session, not this phase. Any future retro that sums `Stop` rows across phases will
   **massively double-count**. Treat `Stop` as a session-total snapshot, and derive per-phase
   main-thread cost by differencing consecutive `Stop` rows (or not at all).

## Recommendations (highest-leverage first)

1. **Make the planner verify every cross-module-impact item against the working tree before it
   becomes a task unit.** A spec's §11 bullet describes *intended* impact, which may already be
   discharged. One `git log -1 --format=%h -- <path>` / read per item would have caught T8. *Expected
   saving: one wasted task unit per plan whenever any spec follow-up lands before planning — which,
   in an interactive SDD loop, is common.*
2. **Filter the phantom `SubagentStop` rows** (`tokens === 0 && toolUses === 0`) in the retro reader,
   and ideally stop emitting them in `capture-telemetry.mjs`. *Expected saving: prevents every future
   retro from over-reporting its agent count.*
3. **Document that `Stop` rows are cumulative** in the retro skill's data-source notes. This is a
   silent double-count trap for any multi-phase retro. *Expected saving: prevents a class of wrong
   numbers that would look plausible.*
4. **Keep doing what worked:** batched questions that state *the consequence of each option*, and
   agents that cite `path:line` inline rather than returning bare conclusions. Both were RETRO-01
   recommendations; both measurably paid off this run (see Trend).
5. **The resume-vs-fresh hypothesis from RETRO-01 remains unmeasured** — no agent was resumed this
   phase. It stays open. With real telemetry now flowing, the *next* resume will settle it.

## Trend (from `retros/trends.md`)

Second run. Comparing against the `write-spec` baseline (2026-07-14):

| Signal | Baseline (write-spec) | This run (plan-implementation) | Direction |
|---|---|---|---|
| Agents launched | 3 (3 productive) | 1 (1 productive) | — (different phase shape, not a saving) |
| Wasted / retried | 0 | 0 | flat, good |
| **Clarification rounds** | **2** (one question bounced back) | **1** (all four answered first pass) | ⬇️ **improved — RETRO-01 Rec. 3 applied** |
| **Duplicated context** | significant (~6 redundant main-thread reads) | **~none** (planner cited `path:line` inline) | ⬇️ **improved — RETRO-01 Rec. 2 validated** |
| **Cache-hit** | unknown (ledger broken) | **84.4 %** | ✅ **measurable at last — RETRO-01 Rec. 1 shipped** |
| Rework caught by orchestrator | 1 (NC-8 left half-done) | 1 (obsolete task unit T8) | flat — both caught pre-ship, neither reached code |

**The headline trend: all three of RETRO-01's top recommendations either shipped or were validated
within one cycle.** Rec. 1 (fix the ledger) was implemented and merged; Rec. 2 (cite grounding) and
Rec. 3 (state the consequence of each option) were applied and both measurably reduced waste. The
retro loop is closing.
