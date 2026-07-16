# Workflow Retro — `sdd-engineering:run-plan` · 2026-07-16

Scope: PLAN-02 → code. INTAKE → BUILD (10 units / 3 waves + 1 unplanned fix) → 3 review gates → fix round 1 → runtime verify → `pr-self-review` (2 buckets) → fix round 2 → gate → PR [#11](https://github.com/RostK/my-monkeys/pull/11). Window ≈ 11:41–13:41 (2 h).
Source: ✅ durable ledger `retros/ledger.jsonl`, full schema, **0 phantoms** (all 40 session rows attributable and carrying real work).

> **Session caveat.** All 40 rows of session `1d3145e0…` belong to this `run-plan`; the earlier SPEC-02 `write-spec`/`plan-implementation` steps ran in *previous* sessions and are already retro'd. The single `coldStart: true` `Stop` row (11:41:23) is the run's first main turn, so it subsumes nothing — no double-count correction needed.

## Run summary

All 20 subagents `completed`; **0 failed, 0 killed, 0 retried, 0 duplicate launches.**

| # | Agent (label) | Phase | Model | Status | Output | Billed | Cache-read | Tool-uses | Duration |
|---|---|---|---|---|---|---|---|---|---|
| 1 | T8 `SECURITY.md` | Build A | sonnet-5 | ✅ | 3.6k | 1.9M | 1.7M | 14 | 82 s |
| 2 | T1 site indexer | Build A | sonnet-5 | ✅ | 12.2k | 3.4M | 3.2M | 21 | 173 s |
| 3 | T3 backfill script | Build A | sonnet-5 | ✅ | 39.9k | 9.5M | 9.1M | 48 | 448 s |
| 4 | **T2 root tooling + schemas** | Build A | sonnet-5 | ✅ | 63.8k | **19.3M** | 18.9M | **77** | **966 s** |
| 5 | FIX-A `.gitattributes` | Build A′ | sonnet-5 | ✅ | 23.3k | 4.8M | 4.6M | 29 | 278 s |
| 6 | T10 schema-drift wf | Build B | sonnet-5 | ✅ | 48.1k | 8.4M | 8.1M | 38 | 495 s |
| 7 | T4 release/rollback | Build B | sonnet-5 | ✅ | 69.9k | 16.9M | 16.4M | 69 | 723 s |
| 8 | T5 validate+tag wf | Build B | sonnet-5 | ✅ | 43.5k | 17.1M | 16.6M | 59 | 836 s |
| 9 | T6 README (normative) | Build C | sonnet-5 | ✅ | 24.7k | 6.3M | 6.0M | 33 | 239 s |
| 10 | T9 `RELEASES.md` | Build C | sonnet-5 | ✅ | 20.3k | 4.2M | 4.0M | 24 | 234 s |
| 11 | T7 CONTRIB+GUIDE+CODEOWNERS | Build C | sonnet-5 | ✅ | 22.9k | 8.2M | 7.9M | 46 | 325 s |
| 12 | architecture-reviewer | Review | sonnet-5 | ✅ | 13.9k | 2.0M | 1.8M | 19 | 130 s |
| 13 | plan-verifier | Review | sonnet-5 | ✅ | 20.1k | 7.4M | 6.8M | 41 | 227 s |
| 14 | FIX-3 vendor exit + docs | Fix 1 | sonnet-5 | ✅ | 12.4k | 7.3M | 7.0M | 36 | 305 s |
| 15 | FIX-2 workflow range/pin | Fix 1 | sonnet-5 | ✅ | 46.0k | 8.6M | 8.3M | 39 | 420 s |
| 16 | FIX-1 version surgery+guard | Fix 1 | sonnet-5 | ✅ | 43.8k | 14.3M | 14.0M | **67** | 576 s |
| 17 | pr-self-review · security | Gate | **opus-4-8** | ✅ | 5.8k | 2.2M | 1.9M | 16 | 137 s |
| 18 | pr-self-review · js | Gate | sonnet-5 | ✅ | **82.8k** | 7.2M | 6.7M | 37 | 604 s |
| 19 | FIX-4 depth-span + atomic | Fix 2 | sonnet-5 | ✅ | 37.8k | 11.2M | 10.9M | 54 | 501 s |
| 20 | FIX-5 ref guard + symlink | Fix 2 | sonnet-5 | ✅ | 40.8k | **18.7M** | 18.3M | **76** | 637 s |

`/code-review` ran **in-thread** (a Skill, not a Task) and is therefore unledgered — its cost sits inside the main-thread `Stop` rows.

## Metrics

- **Agents:** 20 launched (20 productive · **0 wasted/retried**) · **Fix-loop rounds: 2**
- **Tokens (billed):** **229,272,846** total
  - Subagents **178,959,914** (675k out · 172.3M cache-read · 19k fresh in) · **cache-hit 96.6 %**
  - Main thread **50,312,932** (387k out · 48.4M cache-read · 489 fresh in) · **cache-hit 96.9 %** · **main = 21.9 % of billed**
  - **Output total 1,062,810** — the real cost driver; cache-read is 220M of the bill and 96 % is *not* a saving, it is the absolute figure that dominates
- **Model mix:** 19 × `claude-sonnet-5` · 1 × `claude-opus-4-8` (pr-self-review security bucket only)
- **Tool-calls:** 943 (subagents 843 · main 100 across 20 turns ≈ **5/turn**)
- **Wall-clock 120 min vs sum-of-agent-time 139 min → parallelism ≈ 1.16×** (critical path ≈ 73 min)
- **Failures/retries:** none. **Rework traced to:** code 6 (2 review rounds) · env 1 (CRLF) · plan 1 (jq→node deviation, escalated) · orchestration 1 (round 1 fixed a bug and left its twin)
- **Cost:** `unknown` — no grounded per-token pricing for this mix in-context; deliberately not extrapolated from the prior retro's `$44.67`, whose 84 %-opus mix does not apply here (19/20 sonnet).

## What went well / hard

**Hard**
- **T2 (keystone) — 19.3M · 77 tools · 966 s**, the run's most expensive build agent, and correctly so: it fetched and vendored two schemas, wrote 3 validators + a test suite + a root package, and 3 wave-B units blocked on it. It also idled its whole wave behind it (below).
- **T4 (16.9M · 69 tools) and T5 (17.1M · 59 tools · 836 s)** — both rewrote security-critical logic (the A10 fail-open; the tagging job) and both had to prove behavior against isolated scratch git repos because touching the real ref store was forbidden (A-P4). The scratch-repo dance is expensive and unavoidable.
- **FIX-5 (18.7M · 76 tools)** — a *fix* agent costing more than every build agent except T2. Its brief carried 3 findings across 4 files spanning two ownership domains (validator + both privileged workflows).
- **pr-sr-js — 82.8k output**, the run's highest, because it did the most valuable thing anyone did: adversarially fed the new scanner inputs nobody had written (escaped quotes, unicode, a string valued `"version"`) and found `findPluginsArraySpan`.

**Easy**
- **T8 (1.9M · 14 tools · 82 s)** and **T9 (4.2M · 24 tools)** — self-contained prose units against a well-specified AC set. T8 was the cheapest agent of the run by 2×.
- **architecture-reviewer (2.0M · 130 s)** — cheapest review gate; the calibration block ("this is repo tooling, no onion applies — do not report missing routes/services as violations") kept it from manufacturing findings. It returned 0 violations *and* caught the self-referential stale SHA-pin comment.

## Duplicated context (redundant grounding)

- **Every brief re-quoted the plan's pitfalls verbatim** (T2's ≈ 2k words). This is **not** the waste it looks like: 20/20 agents landed in-scope, 0 retries, 0 scope expansions, and the specific traps the plan named (the AC-20 comment, the AC-2/AC-21 tension, the first-parent-vs-authoring-commit asymmetry, `sdd-engineering` 1.1.0) were **each individually avoided by the agent that was warned about them**. The briefs are the reason the run had zero rework-from-misunderstanding. Keep them.
- **The real duplication is sibling-blindness, not brief text.** T5 and T10 each independently read `site-build.yml`, each independently reasoned about the SHA-pin convention, and **each chose a different `actions/checkout` pin** (v4.2.2 vs v7.0.0) — a defect created purely by running them in the same wave with no shared decision. T10 also independently *rediscovered* the CRLF drift that FIX-A had already fixed one wave earlier, spending part of its 495 s on a closed problem.
- **`.claude-plugin/marketplace.json` + the four `plugin.json` manifests** were read by ≥ 8 agents (T2, T4, T6, T7, T9, T10, plan-verifier, both pr-sr buckets). Cheap individually, but it is the same 5 files re-grounded 8×.

## Missed / rework

- **Round 1 fixed `replaceEntryVersion` and shipped its identical twin.** `findPluginsArraySpan`, **six lines away in the same file**, had the same flat-regex-over-structured-text flaw. Three read-only gates, my own `/code-review`, and FIX-1 itself all read that file and missed it; `pr-sr-js` caught it only because its brief said *"scrutinize the new scanner"* and it read the neighbours while doing so. **Cost: an entire second fix round** (FIX-4 + FIX-5 + 2 pr-sr buckets + 4 main turns ≈ 39M billed).
- **The three worst bugs were invisible to every static gate** — `replaceEntryVersion` corruption, `git tag -a`'s implicit HEAD, and the CRLF drift. This is *not* a gate-mix failure; it is the **static-review ceiling**: none had a trigger anyone had typed yet. The corruption needed a legal key order no manifest uses; the tag default needed a multi-commit range the old code could never produce; the CRLF needed a fresh clone to be *hashed*, and `git status`/`git diff` actively hid it (`text=auto` normalizes both sides of the comparison). All three fell to execution.
- **3 of my own ~12 verification attempts were themselves defective** — a PATH shim that symlinked `printf` (a bash builtin, no binary → `rc=127` from my harness, not the code); a fixture missing the module under test's own import (`ERR_MODULE_NOT_FOUND` from my scaffolding); and an octal-escape sed test that reproduced a *different* failure than the one claimed. Two would have produced **false findings**; one would have recorded **wrong durable guidance**. Each was caught only by reading the *output* rather than the exit code — the same failure mode FIX-5 hit when its `sed` escape was a silent no-op. **Verification harnesses fail silently and need the same skepticism as the code under test.**
- **Wasted parallelism, quantified:** T8 finished in 82 s and waited **~15 min** on T2's 966 s barrier. Wave B's T10 (495 s) idled ~5.7 min on T5 (836 s). Five barriers, each paying its slowest member, plus serial main-thread integrate-and-verify between every wave → **1.16× parallelism, down from 1.52× on PLAN-01** despite 54 % more agents.

## Recommendations (highest-leverage first)

1. **Pull the model lever I didn't know I had.** `sdd-engineering:implementer` **pins `model: sonnet` in its own frontmatter** — so my explicit `model: sonnet` on T1/T8/FIX-A/FIX-3 was a **no-op**, and the 12 I "left to inherit" were never going to be opus. 19/20 agents ran sonnet, including all five hardest (T2, T4, T5, FIX-1, FIX-5 — each 60–77 tools, 14–19M). The `Agent` tool's `model` param *overrides* the frontmatter, so the lever exists; I simply never used it upward. **Try `model: opus` on the keystone unit and on fix agents whose brief carries a proven-by-execution bug.** FIX-1 (sonnet) missed a twin bug six lines from the one it fixed, and that miss cost ≈ 39M — several times what upgrading one agent would have.
2. **Add a sibling-sweep clause to every fix brief.** Standing text: *"This bug is an instance of a class. Before you finish, grep the file (and its siblings) for the same pattern and report every other instance — fixing one occurrence is not fixing the bug."* Directly prevents the round-2 that this run paid for. → bake into `run-plan`'s Phase-3 dispatch step.
3. **Give same-wave siblings a shared decisions block.** T5/T10's divergent SHA pins and T10's CRLF rediscovery are pure sibling-blindness. When two units in one wave touch the same *convention* (even with disjoint files), the brief must state the decision concretely — *"pin `actions/checkout@<sha> # vN`; your sibling is pinning the same"* — rather than letting each derive it. Same for "issues already fixed this run, do not rediscover."
4. **Stop barriering short units behind the keystone.** T8/T1/T9 (82–234 s) gate nothing and could integrate the moment they land; instead they sat behind a 966 s sibling. Pipeline the ungated units rather than fanning out per-wave with a full barrier — the plan's own dependency graph already says which units are ungated (T1/T3/T8 are all `Depends on: none`).
5. **Keep the fat briefs; they are load-bearing.** Every trap the plan named was avoided by the agent warned about it, at 0 retries and 0 scope expansions across 20 agents. The temptation after seeing 172M cache-read is to trim the briefs; the evidence says trim *sibling-blindness*, not brief text.
6. **Two process calls to keep as-is.** The **jq→node escalation** was correct — the plan said *"document both"*, so absorbing the swap silently would have breached `run-plan`'s own boundary 3 (escalate plan defects, don't blind-patch); the maintainer chose the deeper fix. The **no-auto-commit ask** was also correct but is now a known, recurring collision: `run-plan`'s wave-integration *requires* local commits for the next wave's worktree sync. Record the exception (local integration commits OK; never push without asking) rather than re-litigating it every run.

## Trend (from `retros/trends.md`)

- **vs the last `run-plan` (2026-07-14, PLAN-01):** agents **13 → 20** (+54 %) · billed **149M → 229M** (+54 %) · tool-calls **642 → 943** · fix-loops **2 → 2** (flat) · cache-hit **97.0 % → 96.6 %** (flat) · **parallelism 1.52× → 1.16× (regression)**. Tokens scaled almost exactly with agent count; the *rework rate* held flat despite a materially larger spec (41 ACs vs 30).
- **vs this spec's own earlier phases:** main-thread share **84 % (plan-implementation) → 21.9 %** — the single biggest improvement in the trend, and it tracks the tool-calls-per-turn discipline (100 calls / 20 turns ≈ 5, vs the 29-in-one-turn that outcost six subagents on 2026-07-14). The prior retro's headline lesson was applied and it worked.
- **Persistent across all five retros:** 0 agent failures, and rework never traced to an agent misunderstanding its brief — it traces to *what nobody thought to ask*. On 2026-07-14 a green suite + a clean 30/30 AC audit both passed while Exact-mode search silently lost documents. Here, three gates and a self-review passed on three latent bugs. **Requirements coverage is not correctness; static review is not execution.** Five runs, same lesson.
