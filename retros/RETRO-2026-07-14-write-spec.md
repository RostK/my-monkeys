# Workflow Retro — `sdd-engineering:write-spec` · 2026-07-14

**Scope:** the write-spec loop only (pre-research → draft → ask → resolve) for SPEC-01
(`preview` module, lexical search + keyword enrichment). Plan and run phases have not been executed.
**Time window:** 2026-07-14 09:34Z–09:54Z (~20 min wall).
**Source:** ⚠️ **in-context session notifications — `~partial`.** The durable ledger
(`retros/ledger.jsonl`) exists and the hook fired 9 times, but **every telemetry field in it is
`null`** (see Finding 1). It contributed launch order and agent labels only; every cost figure below
comes from this session's completion notifications and therefore **cannot survive into a future
session's retro**.

## Run summary

| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `research-tools:researcher` | Pre-research | unknown | completed | **36,304** (split unknown) | unknown | 19 | 169.8 s | MiniSearch vs Fuse.js, primary sources. Ran while main thread did a Glob — trivial overlap |
| 2 | `sdd-engineering:spec-creator` | Draft (AUTHOR) | unknown | completed | **64,723** (split unknown) | unknown | 20 | 303.1 s | Returned 8 NCs (2 blocking) + 6 PIs |
| 3 | `sdd-engineering:spec-creator` | Resolve (RESOLVE) | unknown | completed | **98,154** (split unknown) | unknown | 22 | 254.0 s | Same agent resumed from transcript. **Figure may be cumulative** — see Metrics caveat |
| — | (2 unattributed `SubagentStop` rows) | — | — | unknown | unknown | unknown | unknown | unknown | Ledger rows 5 & 8 carry `agent: ""` — unidentifiable |

Failed launches: **0**. Killed: **0**. Duplicate launches: **0**. Retries: **0**.

## Metrics

- **Agents:** 3 launched · **3 productive · 0 wasted/retried** · Fix-loop rounds: **0**
- **Clarification rounds:** **2** (expected 1 — see Finding 3)
- **Tokens:** **≈199,181 total** *if* row 3 is incremental; **≈134,458** *if* row 3 is cumulative over
  the resumed transcript. **The notification does not disambiguate — treat as `unknown`, bounded
  [134k, 199k].** No in/out split and no `cache_read` was reported → **cache-hit: unknown** (the
  single most useful cost signal, and it is unavailable).
- **Tool-calls (subagents):** 61 (19 + 20 + 22)
- **Wall-clock ≈ 1,185 s** vs **sum-of-agent-time 727 s** → **parallelism factor ≈ 0.61**. The three
  heavy agents ran **strictly serially**; this is inherent to the loop (research gates the draft, the
  draft gates the questions, the answers gate the resolve), not waste. The ~460 s gap is main-thread
  reasoning plus the user answering two question rounds.
- **Nesting:** none. No agent spawned a child, so the in-context sum is not undercounting on that axis.
- **Rework traced to:** spec (one NC needed a second round) · scope boundary (one NC left half-done).

## What went well / hard

- **Easy — `research-tools:researcher` (36.3k, 19 tools, 170 s).** Cheapest agent, highest leverage.
  It killed the "MiniSearch *or* Fuse.js" framing outright by establishing from primary sources that
  Fuse.js has no document-frequency term at all. A ~36k-token spend that removed a whole design
  branch before the spec-creator ever ran is the best ratio in the run.
- **Hard — `spec-creator` AUTHOR (64.7k, 20 tools, 303 s).** The longest single agent. Justified: it
  was doing cold grounding of an unfamiliar module and found three non-obvious traps the brief did
  not know about (the `fm.keywords` → `tagsFor()` collision, the gitignored-and-bundled catalog, CI
  having no secrets). Expensive, but the expense bought facts that changed the design.
- **Hard — `spec-creator` RESOLVE (98.2k, 22 tools, 254 s).** Nominally the *cheapest* phase (fold in
  8 answers), yet the highest reported token count. This is the strongest hint that row 3's figure is
  cumulative over the resumed transcript rather than incremental — a resumed agent re-loads its whole
  prior context. Worth confirming, because if resume genuinely costs ~98k, the "resume the same agent"
  pattern is far more expensive than it looks and a fresh agent with a tight brief may be cheaper.

## Duplicated context (redundant grounding)

Real and measurable. **`spec-creator` grounded a set of files, returned prose conclusions, and then
the main thread re-read the very same files** to answer the user's follow-up question and to write
the engineering-insights entries:

| File | Read by |
|---|---|
| `preview/scripts/build-index.mjs` (`tagsFor`) | spec-creator (author) **and** main thread |
| `preview/.gitignore` · `preview/src/data.js` | spec-creator (author) **and** main thread |
| `.github/workflows/{pages,preview-build}.yml` | spec-creator (author) **and** main thread |
| `preview/src/lib/search.js` · `strings.js` | spec-creator (author) **and** main thread |

**Root cause:** the agent returns *conclusions* ("catalog.json is gitignored") but not the
*grounding pack* (the `path:line` → fact map it built). The main thread, needing to cite evidence
itself, had no choice but to re-derive it. Cost: ~6 extra main-thread tool calls; more importantly it
is a correctness risk — I found one factual drift in the agent's summary this way
(`preview/catalog.json` vs the real `preview/src/catalog.json`).

## Missed / rework

1. **NC-2 did not close in round 1.** The question offered "sidecar vs frontmatter" but never
   explained *why the two fields differ*, so the user answered with a question back ("shouldn't it
   replace tags? explain"). That forced a second AskUserQuestion round and a main-thread explanation
   (tags = few/visible/clickable; keywords = many/invisible/ranked). **The information needed to
   pre-empt this was already in the agent's grounding** — it knew the tag cap, the facet, the URL
   param, the card badge — it just did not surface the contrast in the question.
2. **NC-8 could not be completed at all — a write-scope boundary miss.** The answer was "mark
   `docs/SPEC-marketplace-ui.md` §5–§6 superseded", but `spec-creator` is scoped to `specs/` and
   physically cannot edit that file. It recorded the *relationship* inside SPEC-01 and handed the
   pointer edit back. **Net effect: two documents still disagree about how search works**, and the
   fix depends on a human remembering. The loop asked a question whose answer it structurally could
   not execute.
3. **One wasted tool round-trip:** the first `SendMessage` call failed with
   `InputValidationError` (schema not loaded), requiring a `ToolSearch` + retry. Pure overhead.
4. **Ledger rows 5 and 8 are unattributable** (`agent: ""`), so even the launch-order record is
   incomplete.

## Recommendations (highest-leverage first)

1. **Fix the telemetry hook — it is writing `null` into every cost field.** This is the whole point
   of a durable ledger: SDD steps run across *different sessions* (spec today, plan tomorrow), so by
   the time a retro runs, in-context notifications are gone. Right now a future retro of this project
   would have **zero** cost data. The hook must persist `status`, `inputTokens`, `outputTokens`,
   `cache_read`, `toolUses`, `durationMs`, and a **non-empty agent label** per `SubagentStop`.
   *Expected saving: makes every future retro possible at all; unlocks cache-hit %, the primary
   cost-engineering signal, which is currently unmeasurable.*
2. **Have `spec-creator` return a grounding pack, not just conclusions** — a compact
   `path:line → fact` list alongside its NCs. *Expected saving: ~6 duplicate main-thread reads per
   run, and it removes the summary-drift class of error (one such drift occurred this run).*
3. **Require every NC to carry a one-line "why the options differ".** NC-2 cost a full extra
   round-trip purely because it listed two options without contrasting them. A standing rule in the
   `spec-creator` brief — *state the consequence of each option, not just its name* — would have
   closed it in round 1. *Expected saving: one AskUserQuestion round per spec (~1 user turn).*
4. **Make the write-scope boundary explicit at question time.** If `spec-creator` cannot execute an
   answer (file outside `specs/`), it must label the NC **"answer requires a main-thread edit"** so
   the orchestrator queues the edit immediately instead of discovering the gap in the final report.
   *Expected saving: eliminates the class of silently-half-done resolutions; NC-8 is still open right
   now because of this.*
5. **Establish whether agent-resume re-bills the whole transcript.** RESOLVE reported *more* tokens
   than AUTHOR while doing strictly less work. If resume is cumulative-billed, prefer a fresh agent
   with a tight brief over `SendMessage`-resume for cheap follow-up passes. *Expected saving:
   potentially ~60k tokens per resolve pass — but confirm before acting; this is a hypothesis, not a
   measurement.*

## Trend

**No prior rows** — `retros/trends.md` did not exist and is created by this retro. This is the
baseline run; trend analysis begins with the next one.
