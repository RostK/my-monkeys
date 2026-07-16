# Workflow Retro — `write-spec` · 2026-07-16

Scope: SPEC-02 `repo` (governance docs · CI validation · release tagging) — intake → ground → draft →
ask → resolve ×2 → approved. Session `44e1598c`, ~28 min wall-clock.
Source: ✅ **durable ledger** `retros/ledger.jsonl` — full schema, real telemetry on every row.

Ledger hygiene: 10 rows total; **0 phantoms** (every row attributable, all carry measured work).
Rows 1–3 belong to session `ea691389` (an earlier, unrelated session) and are **excluded**. This retro
covers rows 4–10 (session `44e1598c`). Row 4 is `coldStart: true` but is the session's *first* `Stop`,
so it subsumes no earlier row — the three `Stop` rows sum cleanly, no double-count correction applied.

## Run summary

| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-----------------|-----------|-----------|----------|------|
| 1 | `sdd-engineering:spec-creator` | AUTHOR | `claude-opus-4-8` | completed | 56 / 22,017 (**917k** total) | 82.4 % | 13 | 303 s | Drafted 38 ACs; **refuted 3 of the brief's 4 premises**; returned 10 NCs |
| 2 | `research-tools:researcher` | PRE-RESEARCH (NC-10) | `claude-sonnet-5` | completed | 79,323 / 18,941 (**2.54M** total) | 87.1 % | 33 | 259 s | Launched **background**, fully overlapped the ASK round — 0 added wall-clock |
| 3 | `sdd-engineering:spec-creator` | RESOLVE #1 | `claude-opus-4-8` | completed | 2,854 / 30,915 (**1.34M** total) | 84.6 % | 13 | 362 s | Folded 10 answers; **surfaced 2 NEW NCs** (11, 12) → forced round 3 |
| 4 | `sdd-engineering:spec-creator` | RESOLVE #2 | `claude-opus-4-8` | completed | 118 / 19,644 (**3.19M** total) | 94.9 % | 26 | 310 s | Folded 2 answers → **approved**. Most expensive agent, least scope — see Findings |
| — | `main` (3 turns) | orchestration | `claude-opus-4-8` | completed | 52 / 55,166 (**1.98M** total) | 93.5 % | 9 | — | Repo recon, 4× AskUserQuestion, 4 launches |

All four subagents ran `coldStart: true` — normal and harmless for `SubagentStop` (an agent's
transcript *is* one step), but see Finding 2 for what it implies about re-grounding.

## Metrics

- **Agents**: 4 launched (**4 productive · 0 wasted · 0 failed · 0 retried**) · Fix-loop rounds: 0
- **Clarification rounds**: 3 (10 NCs → +2 NCs → 0) — one more than necessary; see Missed/rework
- **Tokens**: **9,974,983 total** (146,683 out · 8,854,814 cache-read · 82,403 fresh in)
  - Subagents: **7,995,352** (`~complete` — no nesting occurred; the researcher spawned nothing)
  - Main thread: **1,979,631** across 3 `Stop` rows
  - By tier: `opus-4-8` ×3 = **5,451,760** (68 %) · `sonnet-5` ×1 = **2,543,592** (32 %)
- **Cache-hit**: **90.1 %** overall (subagents 89.3 % · main 93.5 %) — healthy, up from 84.4 %
- **Tool-calls**: 94 (85 subagent · 9 main)
- **Wall-clock ≈ 28.3 min vs sum-of-agent-time 20.6 min.** Parallelism factor **≈1.0 — serial by
  design**: the 3 `spec-creator` passes are strictly sequential (each consumes the prior's output).
  Only the researcher (4.3 min) genuinely overlapped, hidden entirely under an ASK round.
  *(Main `Stop` durations include user think-time and are excluded from the parallelism figure.)*
- **Failures/retries**: none · **Rework traced to**: spec 0 · plan n/a · code n/a ·
  **orchestration 1** (an avoidable third RESOLVE round)

## What went well / hard

- **Went well — the brief was wrong and the agent said so.** Three of four premises handed to AUTHOR
  did not survive grounding: workflows were *not* missing (`pages.yml`/`site-build.yml` exist), tags
  were *not* missing (they were **ambiguous** — two competing grammars, one with zero instances), and
  the untagged-version count was 1, then 2, then **3**. The agent refuted rather than complied. This
  is the single highest-value behavior in the run, and it was cheap: it happened in the 917k AUTHOR
  pass, the *least* expensive agent of the four.
- **Went well — background researcher for free.** Launching `researcher` non-blocking before the ASK
  round cost **zero wall-clock** (259 s hidden under user Q&A) and correctly ran on `sonnet-5`, not
  `opus`. It settled NC-10 decisively *and* honestly (it reported that the CLI's auth requirement and
  exit-code contract are **undocumented** — a "not found" more useful than a guess).
- **Hard — RESOLVE #2: 3.19M tokens, 26 tool-uses, for the smallest scope of the run.** It folded in
  *two* answers yet cost **3.5× the AUTHOR pass** that wrote all 38 ACs, and used 2× the tool-uses of
  either sibling. The spend was not waste — it was git archaeology (verifying 3 SHAs, then
  enumerating *every* version each manifest ever declared on `main` to prove the backfill list
  complete at exactly 7). But it was archaeology that **belonged in the AUTHOR pass**.
- **Hard — cost climbed as scope shrank**: 917k → 1.34M → 3.19M across passes 1→3. Each fresh
  `spec-creator` re-grounds from zero: re-read the spec, re-read the manifests, re-walk git log.

## Duplicated context (redundant grounding)

- **The repo's version/tag state was independently established 4×**: main thread (`git tag`, `ls`,
  `git remote`), then AUTHOR, then RESOLVE #1, then RESOLVE #2 — each re-running `git log`/`git show`
  against the same manifests. Only the last one was exhaustive, which is precisely why the third
  untagged version escaped the first two.
- **`SPEC-02` itself (38 ACs) was re-read in full by RESOLVE #1 and RESOLVE #2**, and re-verified
  against the repo each time. This is the dominant term in the 94.9 % cache-read on pass 3.
- **The main thread's own recon was discarded.** I ran `git tag -l` and `ls .github/workflows` and
  hand-typed the findings into the brief as prose. AUTHOR then re-derived all of it. Passing it as
  prose *did* pay off (the agent used it as a hypothesis to falsify) — but the raw facts were paid
  for twice.

## Missed / rework

- **The third round was avoidable, and it was the expensive one (3.19M).** It existed for exactly two
  NCs, and neither needed to be new:
  - **NC-12 (`sdd-engineering` 1.1.0 untagged)** — a *genuine* discovery, but discoverable at AUTHOR
    time by enumerating manifest versions across `main` instead of trusting the brief's list of two.
    The brief's enumeration had already been wrong twice by then; the agent had no standing rule to
    distrust it.
  - **NC-11 (PVR acknowledgement window)** — **self-inflicted**. AUTHOR silently *invented* a window
    in AC-8; my RESOLVE brief told it not to guess maintainer policy; it correctly retracted the
    guess — and turned it into a new question. Had AUTHOR marked the unstated window an NC in round 1
    (instead of quietly filling it), it would have been answered in the same batch as the other 10.
- **Prior retro's recommendation #2 (`spec-creator` returns a `path:line → fact` grounding pack) was
  never adopted — and this run paid for it again**, in both the 4× duplicated grounding above and the
  late NC-12. Two consecutive retros now point at the same missing artifact.
- **Prior recommendation #5 is now answered and can be closed.** It hypothesized that
  `SendMessage`-resume re-bills the whole transcript, and suggested preferring fresh agents. This run
  used **fresh agents throughout** — and cost still escalated 917k → 3.19M. So the escalation is
  **not** a resume-billing artifact; it is **re-grounding cost**. Resume was never the problem, and
  fresh-agent launches do not fix it. (Consistent with the corrected ledger reading in project memory.)
- **One interpretation was made by an agent, not the maintainer** — AC-22's first-parent scoping of
  "every version that ever reached `main`". It was flagged in the provenance table rather than
  buried, which is the correct handling. Noted, not a defect.

## Recommendations (highest-leverage first)

1. **Adopt the grounding pack — second retro asking.** `spec-creator` must return a compact
   `path:line → fact` list with its NCs, and the orchestrator must feed it back into every subsequent
   RESOLVE brief. *Expected saving: most of the ~2M re-grounding delta between pass 1 and pass 3, plus
   the class of late discovery that created NC-12.*
2. **Add a standing "enumerate, don't trust the brief" rule to `spec-creator` AUTHOR.** When a brief
   supplies a *list* (versions, files, plugins), the agent must enumerate the true set from the repo
   before writing ACs against it, and report the delta. This run's brief listed 2 untagged versions;
   the truth was 3 — found only in round 3, by exactly this method. *Expected saving: one full RESOLVE
   round (~3.2M tokens + ~5 min) per spec whose brief contains an enumeration.*
3. **Ban the silent default: an unstated policy value becomes an NC at AUTHOR time, never a filled-in
   guess.** NC-11 cost a round-trip purely because AC-8 invented a number and then had to retract it.
   *Expected saving: one clarification round per spec touching policy (SLAs, windows, thresholds).*
4. **Drop RESOLVE to a cheaper tier when it is a pure fold-in.** Pass 3 spent 3.19M `opus` tokens;
   its *reasoning* was trivial (insert 2 answers) — its cost was archaeology that recommendation 2
   moves upstream anyway. Once AUTHOR carries the grounding, a fold-in RESOLVE is mechanical and
   `sonnet-5` suffices. *Expected saving: ~60–70 % of RESOLVE spend.* Keep `opus` for AUTHOR — that is
   where the premise-refutation happened, and it was the cheapest pass in the run.
5. **Keep launching research non-blocking before the ASK round — this pattern is proven twice now.**
   It converted 4.3 min of latency into 0. Make it the documented default in the `write-spec` skill's
   step 2 rather than an optional flourish. *Expected saving: full research latency, every run.*

## Trend (from `retros/trends.md`)

- **Telemetry: fixed and holding.** SPEC-01's retro could only bound tokens at `[134k, 199k]
  ~partial` with cache-hit `unknown`; this run reports **9,974,983** and **90.1 %** from a clean
  ledger with **0 phantoms**. The prior retro's recommendation #1 landed (`9bae60a` → v1.1.1) and is
  now delivering — that recommendation is **closed**.
- **Cache-hit: 84.4 % (plan-implementation) → 90.1 %**, well below `run-plan`'s 97.0 % — expected, as
  spec work re-reads a growing document rather than fanning out over fixed context.
- **Agents: 3 → 4; rework: still 0 fix-loops**, but the *extra clarification round* is now the
  recurring defect in both `write-spec` retros (SPEC-01: "1 extra clarification round"; SPEC-02: same,
  and this time it was the run's most expensive agent).
- **Same root cause, twice.** SPEC-01's retro blamed the extra round on NCs lacking contrast between
  options; that specific fix worked — every NC this run carried a stated consequence, and all 10 of
  round 1 closed on first ask. The round that *still* leaked was caused by the **un-adopted grounding
  pack** (rec #2), not by NC phrasing. The unadopted recommendation is now the binding constraint.
