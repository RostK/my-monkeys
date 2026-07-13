---
name: retro
description: "Post-run retrospective for a MULTI-AGENT workflow (the SDD sdd-engineering:run-plan pipeline, or any fan-out of subagents). Aggregates a DURABLE per-step telemetry ledger (default retros/ledger.jsonl under the project root, appended by a SubagentStop/Stop hook) to reconstruct the run's telemetry (agents launched, launch order, per-agent tokens / tool-uses / duration, failures & retries, parallelism), synthesizes qualitative insights (which agents were hard vs easy, what context was duplicated across agents, what information was missed or re-worked), emits a retro report under retros/, appends a cross-run trend row, and routes durable orchestration learnings to project memory. It evaluates the ORCHESTRATION — not the code (that is engineering-paved-path:engineering-insights), not the requirements (that is the spec)."
when_to_use: "Trigger phrases: '/retro', 'workflow retro', 'how did that run go', 'evaluate the agent run', 'retro the pipeline', 'review the workflow performance'. Run AFTER a multi-agent workflow finishes (e.g. at the end of sdd-engineering:run-plan). User-invoked. For durable CODE learnings use engineering-paved-path:engineering-insights; for a per-run orchestration retro use this."
version: 0.1.0
---

# retro

You produce a **retrospective on a multi-agent workflow run** — how the orchestration itself went,
not whether the code is correct. You answer: how many agents ran and in what order, what each cost
(tokens / tool-uses / wall-clock), what failed or was redone, which agents struggled, what context
was wastefully duplicated, what was missed — and what to change next time.

**Boundary — capture systems, keep them distinct:**
- **`engineering-paved-path:engineering-insights`** → durable **code** learnings → a module's
  engineering-insights notes.
- **`sdd-engineering:retro`** (this) → how a multi-agent **run** went → a report under `retros/`,
  plus durable **orchestration** patterns to project memory.
- A product's own agent-analytics dashboard (if your app ships one) → the *product's* runtime agents
  — unrelated to this orchestration retro.

## Data sources — read the durable ledger first, never fabricate
SDD steps are often run **separately / manually**, across different sessions (write-spec today,
plan-implementation tomorrow, run-plan the day after), so the in-context session state from earlier
steps is long gone by the time you retro. The reliable source is therefore a **durable per-step
telemetry ledger** that a `SubagentStop` / `Stop` hook appends to as each step runs — read it first.

1. **Durable ledger (primary).** Read the telemetry ledger — default **`retros/ledger.jsonl`** under
   the project root (use the project's configured path if different). It is append-only JSONL, one
   record per agent/step as it completed, each carrying: agent label, phase, model / tier, status
   (`completed` / `failed` / `killed`), token counts (input / output / `cache_read`), `tool_uses`,
   `duration_ms`, and a launch / parent id. Parse it with a small script and **aggregate** — extract
   only the usage fields; never emit raw records that would overflow context. Because it survives the
   chat boundary, it captures steps run in *other* sessions, which is the whole point.
2. **In-context / session records (fallback).** ONLY when the ledger is absent or clearly incomplete
   (hook not installed, or a step ran before it existed), fall back to **this session's own record**:
   each subagent completion notification you received carries a `<usage>` block (`subagent_tokens`
   incl. `cache_read`, `tool_uses`, `duration_ms`) and a status. This covers only agents launched in
   the CURRENT session — mark anything from earlier, un-ledgered steps `unknown`.
3. **Deep mode (disk journals, last resort).** When the ledger is absent AND notifications have
   scrolled out of context: a small script parses the per-task transcript files (`…/tasks/<id>.output`,
   JSONL) for the trailing usage record ONLY — extract the aggregate fields (tokens incl. cache-read ·
   tool-uses · duration · status) and **never emit transcript bodies into context** (they overflow it).

**Nested subagents undercount.** A parent's usage counts only the tokens IT spent — NOT the tokens of
subagents IT spawned (e.g. `researcher`s nested inside a planner, or any agent that fans out further).
A well-formed ledger records each nested agent as its own row (the hook fires per `SubagentStop`), so
summing the ledger gives the true nested total. On the in-context fallback the sum is a **floor**, not
a total — mark it `~partial` whenever nesting occurred and the ledger wasn't available.

**Honesty rule:** if telemetry is partial (ledger missing rows, context summarized, a script couldn't
run, nesting unmeasured), say so and mark the number `unknown` / `~partial` — never invent a token or
agent count. A retro with three real rows and two "unknown" rows is worth more than five guessed ones.

## Procedure

```
- [ ] 1. SCOPE — name the run: which workflow (the `sdd-engineering:run-plan` pipeline, the full SDD flow
         across write-spec → plan-implementation → run-plan, or an ad-hoc fan-out), which phases it covered,
         and the rough time window. If several runs are in scope, retro the most recent unless told otherwise.
- [ ] 2. COLLECT — from the ledger records (or session notifications on the fallback path), build one row per
         agent launch: order · label · phase · model · status · tokens · tool-uses · duration · retry/blocker
         note. Include FAILED/KILLED/duplicate launches (they cost tokens too).
- [ ] 3. METRICS — derive: total agents (and wasted/retried), total subagent tokens (in/out/cache-read;
         by phase / by model tier), **cache-hit %** (cache-read ÷ input — the cost-engineering signal),
         total tool-calls, wall-clock vs sum-of-agent-time (parallelism efficiency), fix-loop rounds
         (rework), failure/retry count. Include nested-subagent tokens (from the ledger / deep mode) or mark `~partial`.
- [ ] 4. QUALITATIVE — for each agent/phase judge: HARD vs EASY (token/tool-use/duration outliers + blockers);
         DUPLICATED context (same files/briefs/skills read by ≥2 agents — redundant grounding); MISSED info
         (out-of-scope needs surfaced late, clarifications/NCs raised, re-dispatches); WASTED parallelism
         (fast agents idling on a barrier for a slow sibling; a duplicate launch doing the same work).
- [ ] 5. RECOMMEND — concrete, grounded changes: bake recurring clarifications as standing defaults in the
         agent/brief; inject a shared context pack ONCE instead of N agents re-reading it; re-batch parallel
         groups; split/merge task units; adjust a model tier; tighten launch discipline (dedup, verify-disk-before-relaunch).
- [ ] 6. WRITE + ROUTE — save the report to `retros/RETRO-YYYY-MM-DD-<workflow>.md`; then append ONE summary
         row to the cross-run trend table `retros/trends.md` (create it from a header row if it is missing),
         numbers matching this retro's Metrics verbatim (carry `unknown`/`~partial` through, never invent a
         figure); READ the trend table's last few rows to write this retro's Trend section (the accumulated
         trend table, not a single prior report, is the source of the trend); finally route ONLY durable,
         recurring orchestration learnings to project memory (link related notes, don't duplicate what the
         repo/git already records). NOTE `retros/trends.md` (per-retro summary rows, written HERE) is distinct
         from `retros/ledger.jsonl` (per-STEP telemetry, appended by the hook and READ in step 1).
- [ ] 7. REPORT — show the run table, the top findings, and the 3–5 highest-leverage recommendations.
```

## Output format — the retro report

```
# Workflow Retro — <workflow> · <date>
Scope: <phases covered> · Source: <durable ledger retros/ledger.jsonl | in-context session notifications | ~partial>

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-----------------|-----------|-----------|----------|------|
(one row per launch, including failed/killed/duplicate; "unknown" where telemetry is missing,
"~partial" where nested-subagent tokens weren't measured)

## Metrics
- Agents: N launched (M productive · K wasted/retried) · Fix-loop rounds: R
- Tokens: total in/out (by phase; by model tier) · Cache-hit: X% · Tool-calls: N
- Wall-clock ≈ vs sum-of-agent-time (parallelism factor)
- Failures/retries: <list with cause> · Rework traced to: spec | plan | code

## What went well / hard
- Hard: <agent/phase — why (outlier tokens/tool-uses, blocker)>
- Easy: <agent/phase — clean, low cost>

## Duplicated context (redundant grounding)
- <files/briefs/skills read by ≥2 agents> → candidate to inject once

## Missed / rework
- <out-of-scope needs, late clarifications, re-dispatches, duplicate launches>

## Recommendations (highest-leverage first)
1. <concrete edit to an agent / skill / brief / launch discipline> — expected saving
...

## Trend (from retros/trends.md, if prior rows exist)
- Agents / tokens / rework: <up|down vs the last few trend rows>
```

After writing the report, append its summary row to `retros/trends.md` so the trend accumulates
across runs (see that file's maintenance rule).

## Boundaries
1. **Orchestration only.** No code-quality, requirements, or product-agent judgments.
2. **Reconstruct, don't fabricate** — unknown telemetry stays `unknown`.
3. **Route, don't dump** — the per-run report lives under `retros/`; only durable, *recurring*
   patterns go to project memory (a one-off run detail is not memory-worthy).
4. **Cheap by design** — you run in the main thread, reading the durable ledger with a small script;
   do NOT fan out new agents to "measure" the run, and never load full transcripts into context.

## Language
Converse in the language of the request; keep agent/skill names, paths, and metric keywords verbatim.
