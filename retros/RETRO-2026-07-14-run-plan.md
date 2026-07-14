# Workflow Retro — `sdd-engineering:run-plan` · 2026-07-14

**Scope:** PLAN-01 (SPEC-01 lexical search + keyword sidecar) — INTAKE → BUILD (7 units, 4 waves) →
REVIEW (3 gates) → FIX LOOP (2 rounds) → VERIFY (real browser) → GATE. Session `926ffc64`,
window 10:37 → 12:23 UTC.

**Source:** ✅ durable ledger `retros/ledger.jsonl` (13 usable rows) for order / status / tool-uses /
duration / tokens, cross-checked row-by-row against this session's in-context `<usage>` notifications
(tool-use and duration matched **exactly** on all 13 — the mapping is solid).

Caveats, stated up front:
- **1 phantom zero row** (`a757afbafe8fd50e9`, all-null usage) filtered, as the known ledger quirk requires.
- **`/code-review` ran inline in the main thread**, not as a subagent — so it is absent from the ledger
  and contributes no row below, despite producing the run's single most valuable finding.
- **Analyst error worth recording:** I first reported cache-hit as `unknown` and blamed a hook regression.
  That was wrong. I had read the ledger's schema off the *first* row in the file — which belongs to an older
  session written by the pre-v1.1.1 hook — and generalised. This session's rows carry the full schema
  (`cacheReadTokens`, `cacheCreationTokens`, `model`, `stopReason`). The hook is healthy. **Read the schema
  from a row in the session you are retro-ing, never from the head of a multi-session ledger.**

## Run summary

Completion order (not launch order). Tokens = ledger `tokens` (cumulative, cache-inclusive).

| # | Agent (label) | Phase | Status | Tokens (out) | Cache-hit | Tool-uses | Duration | Note |
|---|---|---|---|---|---|---|---|---|
| 1 | `implementer` — **T1** harness + AC-13 baseline | BUILD·A | completed | 4,154,231 (7,232) | unknown | 28 | 213 s | clean |
| 2 | `implementer` — **T2** keyword sidecar + indexer | BUILD·B | completed | 10,864,082 (40,764) | unknown | 56 | 593 s | **self-healed** a broken worktree base; caught a plan error |
| 3 | `implementer` — **T3** gen-keywords (never in CI) | BUILD·C | completed | 18,753,017 (14,104) | unknown | 33 | 385 s | highest tokens-per-tool-use — the `claude-api` skill is a heavy read |
| 4 | `implementer` — **T4** MiniSearch engine + golden suite | BUILD·C | completed | 15,322,517 (32,744) | unknown | 49 | 792 s | the tune-until-green loop; used escape hatch (c) |
| 5 | `implementer` — **T6** App wiring + honest copy | BUILD·D | completed | 14,210,984 (16,138) | unknown | 63 | 621 s | blocked mid-run by the shebang bug |
| 6 | `implementer` — **T5** perf benchmarks | BUILD·D | completed | 12,238,916 (15,951) | unknown | 59 | 732 s | blocked mid-run by the shebang bug |
| 7 | `implementer` — **T7** CI gates + bundle budget | BUILD·D | completed | 28,744,597 (38,295) | unknown | **108** | **1,135 s** | fattest unit: measured `main`'s baseline in a temp worktree (2× `npm ci`) |
| 8 | `implementer` — **FIX-2** shebang / CRLF | FIX·1 | completed | 3,131,043 (5,968) | unknown | 21 | 166 s | cheapest agent of the run |
| 9 | `implementer` — **FIX-1** AC-30 index perf | FIX·1 | completed | 5,490,825 (10,319) | unknown | 31 | 297 s | clean |
| 10 | `architecture-reviewer` | REVIEW | completed | 3,658,977 (7,314) | unknown | 36 | 160 s | 0 violations · found the NUL byte |
| 11 | `plan-verifier` | REVIEW | completed | 7,933,515 (13,094) | unknown | 45 | 229 s | 30/30 ACs · 0 gaps |
| 12 | `implementer` — **FIX-4** check-dist robustness | FIX·2 | completed | 3,490,902 (10,878) | unknown | 20 | 215 s | clean |
| 13 | `implementer` — **FIX-3** stemmer + NUL + cache + perf isolation | FIX·2 | completed | 21,188,481 (32,691) | unknown | 93 | 1,135 s | 4 findings in one agent; re-verified golden suite |
| — | *(`/code-review`)* | REVIEW | completed | *(main thread — not ledgered)* | — | — | — | found the stemmer bug |

## Metrics

- **Agents:** 13 launched · **13 productive · 0 wasted / 0 failed / 0 killed / 0 duplicate launches**
- **Fix-loop rounds:** 2 (4 agents) — round 1 pre-gate (red build), round 2 post-gate (review findings)
- **Tokens:** 149,182,087 total · **245,492 output** · 144,469,748 cache-read · 4,464,435 cache-creation ·
  **2,412 fresh input**
- **Cache-hit: 97.0 %** — up from 84.4 % last retro. Per-agent it tracks agent length almost perfectly
  (20 tool-uses → 94.9 %; 108 tool-uses → 98.6 %): long agents amortise the cached prefix, so the fan-out
  is *cheaper per unit of work* the bigger each unit is.
- **Model tier: all 13 agents ran on `claude-sonnet-5`** — including both review gates. `run-plan` sanctions
  the cheaper tier for `plan-verifier` / `architecture-reviewer` and asks for it to be flagged if verdicts
  degrade. **They did not:** `plan-verifier` returned an accurate 30/30 with correct `UNVERIFIABLE`
  classifications, and `architecture-reviewer` found the NUL byte that the correctness gate missed. No
  false `VIOLATION`s, no confidently-wrong `MET`s. The downgrade is earning its money.
- **Tool-calls:** 642
- **Wall-clock vs agent-time:** agent phase ≈ **96 min** wall · **111.2 min** sum-of-agent-time ·
  theoretical critical path **73.2 min** → **parallelism factor ≈ 1.52×** (recovered ~38 min), but
  **~23 min was given back** to serial main-thread work between waves (integration, `npm test`, commit).
- **Rework traced to:** **plan** (1 — a factual error) · **code** (3 — stemmer, NUL byte, cache key) ·
  **environment** (1 — shebang/CRLF) · **orchestration** (1 — the worktree base, mine)

## What went well / hard

**Hard**
- **T7** (108 tool-uses, 19 min) — the only unit that had to reach *outside* its own worktree: it built
  `main` in a disposable worktree and ran `npm ci` twice to measure the bundle baseline with
  `check-dist.mjs`'s own summation. The plan demanded this ("a baseline computed by a different method
  is worthless") and it was right to, but it made one unit 2× the cost of its wave siblings.
- **FIX-3** (93 tool-uses, 19 min) — four findings in one agent, including a tokenization change that
  could have perturbed ranking. It re-verified the golden suite and even *reverted its own fix to prove
  the regression test failed*. Expensive and worth every token.
- **T4** — the tune-until-green loop, exactly as the plan predicted the schedule risk.
- **T3** — 18.8 M tokens on only 33 tool-uses: the highest token-per-action ratio of the run, because
  the mandatory `claude-api` skill read is large. Cheap in actions, expensive in context.

**Easy**
- **FIX-2** (21 tool-uses, 2.8 min) and **FIX-4** (20, 3.6 min) — tightly-scoped briefs with the root
  cause already diagnosed. This is the shape to aim for: *the orchestrator does the diagnosis, the agent
  does the edit.*
- Both review gates were cheap (160 s / 229 s) and high-yield.

## Duplicated context (redundant grounding)

1. **The same bug was root-caused three times.** T5, T6 **and** T7 each independently diagnosed the
   Vite-hashbang/CRLF failure from scratch — T7 even got as far as `hashbangRE = /^#!.*\n/`. Two of those
   three diagnoses were pure waste, and they landed *inside* the run's three most expensive build agents.
2. **11 × worktree sync + 11 × `npm install`** (298 packages each). Every implementer paid the same
   `git checkout <branch> -- .` + install tax because worktrees start empty and stale.
3. **The same plan excerpts, pitfalls and skill lists** were pasted into every brief by hand. Correct, but
   it means a correction (e.g. the artifact-id fix) has to be re-typed into each subsequent brief.

## Missed / rework

- **The worktree-base defect (mine).** `implementer` self-isolates into a worktree branched from an old
  commit (`a779183`), *not* the orchestrator's HEAD — so it cannot see the work it depends on. Discovered
  only after T1 finished. Cost: one user round-trip, T2 having to self-heal via `git show`, and a sync
  step bolted onto all nine later briefs.
- **The plan was wrong about artifact ids** (claimed a double slash; it is single). T2 checked the real
  catalog instead of trusting the plan — the plan's own "trust the `.d.ts`, not this plan" discipline
  paying off in a place it didn't anticipate.
- **AC-30 was a genuine flake**, not a one-off: it passed at 38 ms, then failed >50 ms. Caught only because
  the suite was run repeatedly rather than once.
- **The stemmer bug survived every gate that was designed to catch it.** 98 green tests and a 30/30
  requirements audit both passed while Exact mode was losing documents.

## Recommendations (highest-leverage first)

1. **Fix the `implementer` worktree base** — branch the isolated worktree from the *orchestrator's current
   HEAD*, not from a stale commit. This single defect caused the run's only user round-trip, forced T2 to
   self-heal, and taxed nine briefs with a sync step. *Highest-value change available.*
2. **Ship a standing "environment pack" in every `implementer` brief** — the CRLF/shebang trap, the
   `npm install` step, and a running corrections list (e.g. the artifact-id fix). Three agents burned
   diagnosis tokens on one already-known bug; the orchestrator knew it after the first.
3. **Share `node_modules` across agent worktrees** (or pre-seed them). 11 × 298-package installs inside the
   three fattest agents' critical paths.
4. **Prefer fewer, fatter agents over many thin ones — the cache economics now say so explicitly.**
   Cache-hit rises monotonically with agent length (94.9 % at 20 tool-uses → 98.6 % at 108). A task unit
   split in two pays the cache-creation cost twice and re-grounds twice. This cuts *against* the instinct to
   decompose finely, and it is measured, not assumed.
5. **Batch integration + commits per wave, not per unit.** ~23 min of the 96-min wall-clock was the main
   thread serially integrating, re-running `npm test`, and writing a commit between each unit — enough to eat
   more than half the 38 min that parallelism bought.
6. **Keep the diagnose-then-dispatch pattern.** FIX-2/FIX-4 were the cheapest agents of the run precisely
   because the orchestrator handed them a root cause instead of a symptom. Contrast the three agents that
   each rediscovered the shebang bug alone.

## Trend (vs `retros/trends.md`)

| | write-spec | plan-implementation | **run-plan (this)** |
|---|---|---|---|
| Agents (prod/wasted) | 3 (3/0) | 1 (1/0) | **13 (13/0)** |
| Tool-calls | 61 | 22 | **642** |
| Cache-hit | unknown | 84.4 % | **97.0 %** |
| Rework | 1 extra clarification round | 0 fix-loops | **2 fix-loops, 4 agents** |
| Telemetry source | ledger all-`null` | ✅ real | ✅ real (full schema) |

- **Agent count and tool-calls scale as expected** for the first phase that actually writes code — 13 agents
  and 642 tool-calls against 1 and 22 for planning. Launch discipline held: **zero wasted, failed, or
  duplicate launches across all three runs to date.**
- **Cache-hit climbed 84.4 % → 97.0 %.** The mechanism is now understood rather than lucky: hit-rate scales
  with how long an individual agent runs, and this phase's agents were far longer than the planner's. It is
  the strongest argument yet for coarse task units.
- **Rework appears for the first time** (2 fix-loops). That is not a regression — it is the first phase with
  code to get *wrong*, and every fix round traced to a real defect, not to a misread brief. The more useful
  reading: **3 of the 5 defects were invisible to CI by construction** (a Windows-only break, a
  reviewability-only NUL byte, and a bug that passed all 30 acceptance criteria).
- **Telemetry is healthy across the board** for the first time — the `9bae60a` fix is holding, and the
  full schema (`model`, `stopReason`, cache fields) is present on every row.
