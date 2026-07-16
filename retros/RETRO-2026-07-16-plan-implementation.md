# Workflow Retro — `plan-implementation` · 2026-07-16

Scope: SPEC-02 → PLAN-02 — plan → research (bg ×2) → clarify ×2 → amend spec ×2 → delta-plan → persist →
gate. Session `44e1598c`, ledger rows 14–21.
Source: ✅ **durable ledger** `retros/ledger.jsonl` — 21 rows, full schema, **0 phantoms**.

**Scope honesty.** The two main-thread `Stop` rows in scope (#18, #21) are whole turns, and those turns
*also* carried work that is not planning: committing SPEC-02, and shipping the `sdd-engineering` 1.2.0
grounding-pack change. A `Stop` row cannot be split within a turn, so the main-thread figures below are an
**over-count for the planning phase specifically** — they are the honest ceiling, not a clean attribution.
Every subagent row is planning work with no such caveat.

## Run summary

| # | Agent | Phase | Model | Status | Tokens | Cache-hit | Tool-uses | Duration | Note |
|---|-------|-------|-------|--------|--------|-----------|-----------|----------|------|
| 1 | `implementation-planner` | PLAN | `opus-4-8` | completed | **2,319,453** | 85.7 % | 18 | 547 s | Fresh. 9 units / 3 waves; **3 clarifying questions + 2 `[RESEARCH NEEDED]`**; found 3 things the spec never recorded |
| 2 | `researcher` (CODEOWNERS) | RESEARCH | `sonnet-5` | completed | 606,383 | 91.1 % | 15 | 219 s | Background. **Falsified AC-4's verify step** |
| 3 | `researcher` (SchemaStore) | RESEARCH | `sonnet-5` | completed | 513,167 | 50.5 % | 13 | 267 s | Background. Ungated Wave A. Low hit ≈ fetched an 87 KB schema as fresh input |
| 4 | `spec-creator` | AMEND (AM-1/2) | `opus-4-8` | completed | 1,689,851 | 89.6 % | 19 | 219 s | Vendoring + AC-4 verify fix → AC-39, AC-40 |
| 5 | `implementation-planner` | PLAN-Δ | `opus-4-8` | completed | **1,363,984** | 72.0 % | **4** | 246 s | **Resumed via `SendMessage` — `coldStart: false`.** Whole delta + 4 new flags on **4 tool calls** |
| 6 | `spec-creator` | AMEND (AM-3) | `opus-4-8` | completed | 2,486,983 | 92.4 % | 24 | 223 s | AC-41, NF-1a table, AC-39 invariant, D-1 upgrade |
| — | `main` (2 turns) | orchestration | `opus-4-8` | completed | **48,014,654** | 99.1 % | 42 | — | See the headline finding |

## Metrics

- **Agents:** 6 launched (**6 productive · 0 wasted · 0 failed**) · Fix-loop rounds: 0
- **Clarification rounds:** 2 (4 questions → 3 questions). One round was **caused by me**, not the planner —
  see Missed/rework.
- **Tokens: 56,994,475 total** (319,454 out · 54,900,396 cache-read · 5,678 fresh in)
  - Subagents: **8,979,821** (`~complete` — no nesting; the researchers spawned nothing)
  - Main thread: **48,014,654** across 2 turns
  - By tier: `opus-4-8` ×4 = 7,860,271 · `sonnet-5` ×2 = 1,119,550 · main = 48,014,654
- **Cache-hit: 96.9 %** overall (subagents 84.6 % · main **99.1 %**)
- **Tool-calls:** 135 (93 subagent · 42 main)
- **Cost ≈ $44.67** — subagent opus $12.27 · subagent sonnet $1.23 · **main thread $31.16 (70 %)**
- **Wall-clock ≈ 52 min** (main turn durations, incl. my answering time) **vs 28.7 min sum-of-agent-time.**
  Both researchers ran concurrently *and* were hidden under an ask round; the planner and spec-creator
  passes were strictly sequential by dependency.
- **Failures/retries:** none · **Rework traced to:** spec 2 (both amendments — one genuine discovery, one
  self-inflicted ordering), plan 1 (delta pass), code 0

## The headline: the main thread is now the cost center, not the agents

**48.0 M of 57.0 M tokens (84 %) and $31.16 of $44.67 (70 %) went to two main-thread turns.** One turn
(#18) alone billed **30.8 M tokens, of which 30.5 M is cache-read**.

This inverts every prior retro in the trend table. On the `write-spec` run six hours earlier, main was
**20 %** of tokens. Nothing about the orchestration got worse — the *conversation* got long. Cache-read is
the whole conversation re-read on **every API call**, so a main-thread turn costs roughly
**conversation-size × tool-calls-in-that-turn**. Turn #18 had **29 tool calls** in an already-large session;
turn #21 had 13. That product, not any agent, is where the money went.

Two consequences worth internalizing:

- **Subagents are the cheap part.** Every agent this run cost less than the main thread's *share of a single
  turn*. Delegating work to a subagent moves it out of the quadratic term — the agent pays its own
  (smaller) context once. "Should I spawn an agent or just do it inline?" now has a cost answer, and it
  favors the agent more than intuition suggests.
- **Long multi-tool turns are the expensive shape**, not long sessions per se. Ten tool calls across five
  turns cost far less than ten in one turn, because each turn's cache-read is re-paid per call regardless.
  Batching work into one mega-turn — which I did, for "1 3 2" — is the anti-pattern.

## The natural experiment: resumed vs fresh (the grounding-pack thesis, measured)

I ran the same agent twice, once fresh and once resumed, on comparable analytical work:

| | Fresh (`#14`) | **Resumed via `SendMessage` (`#19`)** |
|---|---|---|
| `coldStart` | `true` | **`false`** |
| Tool uses | **18** | **4** |
| Tokens | 2,319,453 | **1,363,984** |
| Output | Full plan, 9 units | Full delta, 3 revised units + 1 new + 4 flags |

**The resumed planner did comparable-quality work on 4 tool calls instead of 18 — a 78 % drop — and cost
41 % less.** It didn't re-read the repo because it still remembered it. This is the cleanest evidence yet for
the re-grounding thesis, and it **sharpens the memory note I wrote this morning**: that note said
"fresh-vs-resume is not the lever." That was right about the *cause* of escalation (re-grounding, not
resume-billing) but wrong as advice. Resume is *the* lever, because:

1. `coldStart: false` — the watermark means it bills only the new step, not its whole transcript. SPEC-01's
   "resume re-bills everything" fear is now doubly refuted: measured, not argued.
2. It skips re-grounding entirely — which is the actual cost driver.

**A grounding pack is the second-best option — what you use when the agent is gone.** When the agent is
still alive, `SendMessage` beats it.

## What went well / hard

- **Went well — the planner earned its keep twice over.** It found **three things the spec never recorded**,
  all grounded: `README.md:45-56` already contradicts the live catalog (documents `"source": "<name>"` +
  `pluginRoot`; reality is `"./plugins/<name>"` with no `pluginRoot`) — which would have propagated into
  `PLUGIN-GUIDELINES.md` via AC-6 and into AC-33's containment rule; `README.md:84`'s
  `claude plugin validate` claim becomes false the moment AC-21 lands, in **three** doc sites not one; and
  it correctly *dismissed* a near-miss cross-spec conflict (`build-index.it.test.mjs:5`'s AC-20 comment
  over-generalizes its own AC). Then on the delta it found that **AM-1 created a new hole**: a
  `GITHUB_TOKEN` PR doesn't trigger `pull_request` workflows, so the drift PR — the one PR that changes the
  merge gate itself — would arrive with zero checks. That became AC-41.
- **Went well — background research, twice, for free.** Both researchers ran concurrently under one
  AskUserQuestion round: 8.1 min of research at **zero** wall-clock. On `sonnet-5`, both together cost
  **$1.23** — 2.8 % of the run. The `write-spec` skill now documents this as the default; it paid again.
- **Went well — one flag closed by execution instead of debate.** The planner flagged that `new Ajv()` might
  throw (`strict: true` on unknown keywords) and honestly noted the schemas had been *read*, never *run*.
  Two Bash calls settled it: ajv@8.20.0, both schemas compile, catalog validates 5/5, 0 external `$ref`s.
  Cost ≈ nothing; it upgraded D-1 from "relayed" to "verified by execution" and removed a Wave-A risk class.
- **Hard — `spec-creator` AM-3 (2.49 M, 24 tool-uses)**, the run's most expensive agent, for three
  amendments. It re-read the spec and re-derived context despite being handed a grounding pack — because it
  was a **fresh** agent (`coldStart: true`) and the installed plugin is still **1.1.1**, which has no
  grounding-pack instruction. My pack helped as *prose*; it wasn't a contract the agent was built to honor.
- **Hard — researcher #16's 50.5 % cache-hit** is the run's lowest, and correctly so: it fetched an 87 KB
  schema, which is genuinely fresh input. Not a defect — worth recording so a future retro doesn't "fix" it.

## Duplicated context (redundant grounding)

- **The spec was re-read from disk by three separate fresh agents** (planner #14, spec-creator #17,
  spec-creator #20), plus the main thread. The grounding pack I hand-wrote into each brief reduced but did
  not eliminate this: a fresh agent still opens the file.
- **The repo's tag/version state has now been established independently ~7 times** across two sessions
  (main thread ×2, three write-spec passes, planner, two amendment passes). It has been identical every
  time since the first correct enumeration.
- **Not duplicated, and worth noting:** the resumed planner (#19) re-read *nothing* — 4 tool calls total.
  The contrast is the finding.

## Missed / rework

- **One clarification round was self-inflicted — my ordering error, not the planner's.** I asked the planner
  for a plan *before* resolving its design questions, so its Q1/Q2/Q3 arrived with a finished plan attached
  — and when Q2 came back "vendor", the plan built on the fetch model was stale and needed a delta pass
  (1.36 M). **In fairness the questions could not have been asked earlier: the planner is what surfaced
  them.** But once it did, the delta was structurally guaranteed. A cheap "questions-first, plan-second"
  variant may not exist for a planner — flagging it as an open question, not a fix.
- **AM-3 exists because AM-1 created the hole it fixes.** Vendoring moved third-party risk off the merge
  path (good) onto a path with *less* automated scrutiny (not noticed until the planner looked). This is
  healthy discovery — an amendment finding its own consequence — but it means **a spec amendment should
  trigger a re-review of its own blast radius**, not just a fold-in.
- **The write-spec loop shipped an unverifiable `Verify:` hint, and only a researcher caught it.** AC-4
  demanded "GitHub shows @RostK as owner on a test PR" — physically impossible here (GitHub never requests
  review from a PR's own author; @RostK is both). This is a **new defect class**: the spec's `Verify:` hints
  are prose, and nothing checks that the surface they name exists. It survived a full write-spec loop *and*
  three passes of self-check.
- **`write-spec/SKILL.md` still declares `version: 0.2.0`** despite its content changing in 1.2.0. Its own
  per-skill counter drifted from the plugin version. Noted at the time; not fixed.

## Recommendations (highest-leverage first)

1. **Prefer `SendMessage`-resume over a fresh agent whenever the agent is still alive — this is now
   measured, not argued.** 18 → 4 tool calls, −41 % tokens, `coldStart: false` (incremental billing). The
   grounding pack is the fallback for when the agent is gone. **Update the `write-spec` and
   `plan-implementation` skills to say resume-first, pack-second** — right now 1.2.0 only teaches the pack.
   *Expected saving: ~1 M tokens per follow-up pass.*
2. **Stop batching work into mega-turns.** Main-thread cost ≈ conversation-size × tool-calls-per-turn, and
   this run's 29-tool-call turn billed **30.8 M tokens by itself** — more than all six agents combined.
   Splitting the same work across turns is materially cheaper, and delegating it to a subagent cheaper
   still. *Expected saving: the dominant term — 70 % of this run's cost sat here.*
3. **Require every `Verify:` hint to name a surface that demonstrably exists.** AC-4's didn't, and only an
   external researcher caught it. Add to `requirements-engineering`: *a Verify hint that names a UI, an
   annotation, or a report must state where that surface appears; if the agent cannot confirm it exists, the
   hint is an `NC-n`, not a hint.* This is the same silent-guess failure as the invented SLA window, in a
   different field. *Expected saving: one researcher + one amendment pass per spec that guesses a surface.*
4. **Make a spec amendment re-run its own blast-radius check.** AM-1 created AM-3's hole. Add to
   `spec-creator` RESOLVE: *after folding an amendment in, ask what the amendment itself breaks — re-read the
   ACs, NFs and ECs it touches and report consequences, not just the fold-in.* AM-3 was found by the
   **planner**, not the amending agent. *Expected saving: catches the class before it reaches a plan.*
5. **Keep research on `sonnet-5` and in the background.** Two researchers, 8.1 min, **$1.23**, zero
   wall-clock, and one of them corrected the spec. This is the best value-per-dollar in the run for the
   second time running — treat it as settled, not as a choice to re-litigate each time.

## Trend (from `retros/trends.md`)

- **Main-thread share inverted: 20 % → 84 % of tokens in six hours**, same session, same orchestration
  quality. The variable is conversation length, not technique. This is the first retro where **the answer to
  "what was expensive" is not an agent** — and the trend table's earlier rows should be re-read with that in
  mind: they measured short sessions.
- **Cache-hit 90.1 % → 96.9 %**, approaching `run-plan`'s 97.0 % — but for the opposite reason. `run-plan`
  earned it by fanning out over fixed context; this run earned it by re-reading one huge conversation. **A
  high cache-hit is not automatically good news**: at 99.1 % the main thread was reading 47.4 M cached
  tokens. Cheap per token, ruinous in aggregate.
- **Agents 4 → 6, rework still 0 fix-loops.** The "1 extra clarification round" that both prior `write-spec`
  retros flagged **did not recur in the same form** — every NC closed on first ask, because 1.2.0's
  "state why the options differ" rule shipped. The round that did leak was an ordering artifact and is
  arguably unavoidable for a planner.
- **The grounding pack's first outing is inconclusive, and I'm marking it so rather than claiming a win.**
  `spec-creator` still cost 1.69 M → 2.49 M across two passes with packs supplied. But the installed plugin
  is **1.1.1** — the agents had no instruction to *use* a pack, and the tasks differ in size, so this is not
  a clean test. **The next `write-spec` run, on 1.2.0, is the real measurement.** What the run *did* prove is
  the mechanism behind the pack (re-grounding is the cost, and skipping it saves 78 % of tool calls) — via
  the resumed planner, not via the pack.
