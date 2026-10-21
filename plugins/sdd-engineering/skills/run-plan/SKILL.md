---
name: run-plan
description: "Executes an already-approved SDD plan through build → review → fix → gate. Takes a persisted PLAN-*.md (the HOW — produced SEPARATELY via sdd-engineering:plan-implementation) and optionally its spec, fans out implementer per task unit (parallel, worktree-isolated), runs the review gates (plan-verifier + architecture-reviewer + /code-review + a test-quality pass) in parallel, drives a BOUNDED post-review fix loop, and stops at the pre-push gate. It ORCHESTRATES only — writes no code itself; the main thread owns user Q&A, parallel fan-out, /code-review, and worktree integration. Spec authoring (sdd-engineering:write-spec) and planning (sdd-engineering:plan-implementation) are run manually before this."
when_to_use: "Trigger phrases: '/run-plan', 'run the plan', 'execute PLAN-...', 'build from this plan', 'run the SDD implementation'. Requires an existing PLAN-*.md — if there is no plan yet, run sdd-engineering:plan-implementation first (and sdd-engineering:write-spec before that). Explicit, user-invoked: it fans out many workers and writes code, so start it only on request."
version: 0.1.0
---

# run-plan

You **orchestrate** the implementation tail of Spec-Driven Development: take an **already-approved
plan** and drive it through **build → review → fix → gate**. The upstream steps — the spec
(`sdd-engineering:write-spec`) and the plan (`sdd-engineering:plan-implementation`) — are run
**separately, by hand**, before you. You start from their output.

You run in the **main thread** and **write no code yourself**. Every heavy phase is delegated to a
subagent (Task tool); you own only what a subagent cannot do: **talk to the user**
(`AskUserQuestion`), **fan out parallel subagents**, **run slash commands / skills** (`/code-review`,
`engineering-paved-path:pr-self-review`), and **integrate worktree output** back into the branch.

**Context hygiene.** Hold only the plan's task units, ids, and the review findings — **never paste
code/diffs in full** into your own context. Let each subagent read files in its own context and
return a short summary.

```
INTAKE (read PLAN-*.md, drift sweep, unit briefs) ─► BUILD (implementer ∥, integrate worktrees) ─►
  REVIEW ( plan-verifier ‖ architecture-reviewer ‖ /code-review ‖ test-quality ) ─► FIX LOOP ─►
  VERIFY (drive the real app end-to-end, NOT mocks) ─►╴gate╶─► pr-self-review ─► report
```

## Cost & toggle notes (token economy — read this)
*(Token figures in the motivating cases below were read from ledgers written before 1.2.0, which
counted each model call once per content block of its answer: read them as roughly 2–3× the real
spend. The ratios between them hold.)*
- **Test bar.** By default there is **no separate red-tests phase**: implementers make **existing
  and their own** tests green — that is the only test bar. **Consequence:** an `AC` whose `Verify:`
  hint names a test nobody wrote comes back `UNVERIFIABLE (static)` / `NOT FOUND` from
  `plan-verifier` — that is **expected**, not a defect. `plan-verifier` still earns its keep on:
  `manual` / code-presence evidence, **non-functional** criteria (authz/tenancy scoping,
  secrets-not-logged, i18n keys), **DoD** gates (migration generated, contract updated in every
  copy), and the gold-plating backward pass — none of which depend on tests. If the project runs a
  dedicated test-authoring phase before BUILD, add it there to close the test-hinted ACs.
- **Model tier.** `architecture-reviewer` and `plan-verifier` MAY run on a cheaper model tier to
  save cost; their prompts are heavily grounding-constrained, so this is a sanctioned downgrade.
  The same goes for **any read-only review agent you launch as `general-purpose`** — the
  line-level review's finders, the test-quality gate, `pr-self-review`'s bucket reviewers: a
  `general-purpose` agent **inherits your model** unless the launch names one, so pass an explicit
  cheaper `model` on every such launch. If you see false `VIOLATION`s, confident-but-unmet `MET`s,
  or review findings that turn out false, flag it and move those agents back to a stronger model.
  (Motivating case: over two runs of one plan, reviewers that silently inherited the orchestrator's
  model went from 4.3M to 48.5M tokens at its tier.)
- **`/code-review` effort** defaults to **`medium`** here — reserve `ultra` (cloud, expensive) for
  large or high-risk diffs, and only on the user's say-so. Effort is not model tier: the note above
  still applies to whatever agents the review launches.
- **Fixes are dispatched, not made here** (boundary 1; Phase 3 step 4). Every main-thread turn
  re-reads the whole conversation at **your** model tier, so the "quick" inline edit is the
  expensive one; an `implementer` opens only the finding's files. (Motivating case: a run whose
  four fix rounds were all carried out on the main thread ended with the orchestrator at 60% of the
  run's tokens — 296M, about 9.9M per main-thread turn — against 34% on the previous run of the
  same plan.) A **small** fix pass is no exception: its cheap route is to **resume** the
  `implementer` that built the unit (if it is still live and its context is well under the
  ~400k budget), which already holds the files and pays no re-grounding; otherwise a fresh one
  with the unit's brief.
- **Mechanical loops go to a fresh agent.** A loop of many mechanical calls that follows a written
  recipe (re-running a script over a list, re-banking records, a checklist of renames) goes to a
  fresh agent holding **only the recipe**, never to the main conversation: every call there
  re-reads the whole conversation, and an agent's cost goes with its context times its calls.
  (Motivating case: one main-conversation turn that ran such a recipe made 411 tool calls over
  three days of history and cost more than five code reviews together.)
- **Phase boundaries are session boundaries on a long run.** For the same reason — a main-thread
  turn re-reads every turn before it — after Phase 1 integration, after the fix loop, and at any
  human gate, offer the user a hand-off to a **fresh session** (or compact) rather than carrying
  on. The plan file is the carried state: hand over its path plus a few lines — phase reached,
  working branch + last commit, open findings / accepted gaps, where the unit briefs are — never
  the transcript. (Motivating case: four main-thread turns of one long run cost 164M tokens
  between them.)

## Hard boundaries
1. **You never write code.** All edits go through `implementer`. You orchestrate, ask, and integrate.
2. **A plan is required.** If no `PLAN-*.md` is provided or found, stop and tell the user to
   run `sdd-engineering:plan-implementation` first (and `sdd-engineering:write-spec` before that). Do
   not invent a plan.
3. **Never proceed on red.** A build wave hands off only when its tests + typecheck are green; a
   worker that returns `blocked` stops that unit until you resolve it.
4. **Bounded fix loop** — stops on convergence, no-progress, or the round cap; never spins forever.
5. **Secrets & do-not-touch discipline** (per the project's conventions / root guidance): no secrets
   in logs, database, or version control; no hand-edited generated migrations; honor the project's
   do-not-touch / ignore paths.
6. **Mocked-green ≠ done.** Every gate below runs on MOCKS (implementers green their own tests
   with stubbed adapters; the review gates read code statically). None of them exercise runtime
   behavior. You MUST drive the real feature end-to-end (Phase 3.5) before the ship gate — a build
   that passes every gate can still crash at runtime. (Motivating case: a fire-and-forget generation
   job's failure crashed the whole service; all mocked tests + all three review gates passed — only
   driving the real app via `/run` caught it.)

---

## Phase 0 — INTAKE

1. Resolve the **plan**: the `PLAN-*.md` path the user gave, or the newest one if they say
   "the plan". If none exists, stop (boundary 2). Optionally note the spec it traces (`SPEC-NN`)
   for cross-reference.
2. **Read the plan** (this is your control input): extract the **task units** (files, track,
   skills, DoD, known pitfalls), the **parallelization graph**, the **acceptance criteria**
   (`AC-N` + `Verify:` hints), and the **non-functional** requirements. Keep this structure; each
   worker gets only **its own unit's brief** (step 4), not the whole plan.
3. **Drift sweep** — a plan can be older than the branch. Take the plan's base (the commit it was
   written against; if it names none, `git log -1 --format=%H -- <plan>`). For each file a unit
   edits or moves, run `git log --oneline <base>..HEAD -- <file>`; for each DOM hook / selector it
   edits or moves (`data-*`, test id, role, class), grep the tests for selectors naming it. Every
   hit goes into that unit's brief; a hit that invalidates the unit's approach is a plan defect →
   the user (as Phase 3 step 3), before BUILD. (Motivating case: a PR merged after the plan was
   written moved a `data-*` hook a test depended on, and the unit that touched it came back
   `blocked`.)
4. **Context pack** — write one short **brief per task unit** (one shared pack is enough for a
   small plan) holding exactly: the unit's plan excerpt verbatim (files, DoD, named skills,
   pitfalls, its `AC`s); **only the learnings records that bear on its files** — not the project's
   learnings file; and its known collisions (step 3's hits, files shared with sibling units, tests
   naming its hooks). Write it outside the tracked tree (a scratch or git-ignored path) and hand
   out its **absolute** path — a worktree cannot see the main tree's uncommitted files. From here
   on every worker, fix agent and reviewer is pointed at a brief, never at the whole plan, the
   whole spec, or the whole learnings file. On a large plan, delegate steps 3–4 to one
   cheaper-tier agent that returns only the brief paths and the collisions found, so the learnings
   file and the `git log` output never enter your context. (Motivating case: in two consecutive
   runs of one plan every implementer was also pointed at the whole plan, the whole spec and the
   whole learnings file — 883 lines by the second run — six times over; both retros recommended a
   pack and neither run wrote one, which is why this is a step and not advice.)
5. **Telemetry check.** The plugin's ledger is opt-in: it is written only where
   `SDD_TELEMETRY_LEDGER` points, or to `retros/ledger.jsonl` when the project already has a
   `retros/` folder. If neither holds, this run will leave no ledger for `sdd-engineering:retro` —
   tell the user, and offer to create `retros/` now (and git-ignore `retros/ledger.jsonl` and
   `retros/.ledger-state/`) so BUILD onward is captured. Their call; do not create it unasked.
6. State in one line: plan path, number of task units, waves, drift hits, telemetry on/off, and
   that spec/plan were done separately. Then begin.

## Phase 1 — BUILD

Fan out **`implementer`**, one per task unit, following the plan's parallelization graph:

- Same wave only for units with **disjoint file sets**; sequence shared-file units; **≤3–5
  concurrent** workers.
- Give each worker **only its unit's brief** (Phase 0 step 4: files, DoD, named skills, quoted
  pitfalls, relevant learnings, collisions), and say that the brief's learnings excerpt stands in
  for reading the project's learnings file itself.
- Each runs in its own worktree, touches only its named files, and greens its tests + typecheck
  (the hard gate — this is the test bar).
- **Worktree base — sync is step 0 of every implementer brief.** An agent worktree is cut from
  the **default branch**, not from your working branch, so committing a wave does **not** make the
  next wave see it. The brief's first step (build and fix dispatches alike): fast-forward the
  worktree to the working branch at a **named commit** (`git merge --ff-only <sha>`; if the two
  have diverged, `git reset --hard <sha>` — the worktree is fresh, nothing is lost), confirm
  `git log -1` shows that commit and that a file the previous wave added is present, and return
  `blocked` (wrong base) if not — before any work. (Motivating case: a unit that depended on the
  previous unit's commit opened a tree with none of it, and the launch was wasted.)
- **INTEGRATE after each wave:** worker output is **uncommitted in its worktree** — bring it into
  the working branch and **commit** units that later waves depend on. Follow the project's
  worktree-integration workflow; if it has none, `git add -A` then `git diff --cached --binary`
  in the worktree, check the patch touches only the unit's named files, and `git apply --index`
  it in the main tree. That diff is the unit's change only because step 0 synced the base — from
  an unsynced worktree it also reverts whatever the working branch gained since. A later wave must
  build on the integrated result.
- Read each summary: **files changed**, **out-of-scope needs**, **insight candidates**,
  **blockers**. An out-of-scope need or a blocker → re-dispatch (adjusted unit) or escalate to the
  user; never let a worker silently expand scope. Route insight candidates through
  `engineering-paved-path:engineering-insights` at the end (single writer).

## Phase 2 — REVIEW  (four read-only gates, in PARALLEL)

Fan out in **one message** — they are independent. Any reviewer you launch as `general-purpose`
gets an explicit cheaper `model` (Cost notes):

- **`plan-verifier`** (Task) — plan path + built code. Requirement coverage: is every `AC`
  actually implemented (evidence, not quality). Expect `UNVERIFIABLE`/`NOT FOUND` on ACs whose
  test evidence a dedicated test-authoring phase would have produced (if you didn't run one).
- **`architecture-reviewer`** (Task) — structural topology only (onion / feature-based
  invariants). It does **not** hunt bugs.
- **`/code-review`** (Skill, `medium`) — line-level correctness bugs, the gap architecture-reviewer
  leaves. Scope to the branch diff; `ultra` only for large/risky diffs on the user's say-so.
- **Test-quality pass** (Task, `general-purpose`, read-only) — the diff's test files plus the
  product branches they should cover. Rubric: **assertions that cannot fail** (asserting on the
  mock itself, a tautology, an `expect` in a callback that never runs, a test that stays green
  with the change reverted); **new branches / error paths with no test**; **real-time sleeps** and
  un-faked timers; plus the project's own testing skill where one fits (e.g.
  `engineering-paved-path:react-testing-library` for UI tests). `file:line` findings only.
  (Motivating case: in two runs these findings surfaced only in Phase 4's `pr-self-review` and
  became a fix round of their own each time — about 16M tokens in one; raised here they join
  round 1.)

Collect the four reports by reference.

## Phase 3 — FIX LOOP  (bounded — the post-review iterations)

1. **Aggregate & dedup** findings across the four gates (same `file:line` once).
2. **Triage:**
   - **Blocking** = architecture `VIOLATION` + `/code-review` high-confidence bug + `plan-verifier`
     `NOT FOUND`/`PARTIAL` on a required `AC`/DoD (excluding the expected test-evidence gaps above)
     + a test-quality finding (assertion that cannot fail · untested new branch · real-time sleep).
   - **Discuss** = `SMELL` / `UNPLANNED` / low-confidence / nit → surface to the user; don't auto-fix.
   - **Sensory** = a finding about what a human **perceives** (screen-reader speech, visual
     judgement, motion, sound) → **human gate before any fix.** A reviewer can measure the DOM, not
     the experience, so its prescribed fix is a hypothesis. As soon as a first version runs: clear
     every check a machine can make (DOM / ARIA state, timing, focus) in the browser, as in Phase
     3.5; then give the user a **five-minute script** — exact steps and what to listen or look
     for, not the whole manual sweep; dispatch (step 4) only on what they report. (Motivating
     case: a reviewer measured a screen-reader announcement standing for 55 ms and prescribed a
     fix; it was built, tested twice and pushed — then removed after ten minutes of a human
     listening with a screen reader showed the cause was elsewhere.)
3. **Escalate plan/spec defects.** If a finding shows the **plan or spec** was wrong (not just the
   code), stop and take it to the user — it needs a re-plan (`sdd-engineering:plan-implementation`) or
   a spec amendment (`sdd-engineering:write-spec`), run separately, not a blind code patch.
4. **Dispatch fixes — every one, the "small" ones included** (boundary 1). Send each blocking
   finding to the matching `implementer`, scoped to the finding's files, in a worktree (step-0
   sync and unit brief as in Phase 1; batch a round's findings into as few dispatches as their
   file sets allow); it must keep tests + typecheck green. A `plan-verifier` `NOT FOUND` may need
   a small new task unit (missing behavior), not just an edit. **Integrate** as in Phase 1.
   There is **no carve-out** for a fix that looks quicker to make here, or for a defect you found
   yourself: a Phase 3.5 runtime finding, a `pr-self-review` finding in Phase 4, and a review
   answer after a push all come back through this step. For a small pass (tests only, a handful
   of files), resume the unit's own `implementer` when it is still live rather than paying a
   fresh one's grounding (Cost notes) — that, not an inline edit, is the cheap route. The inline edit is the costly one (Cost
   notes), and the first one sets the habit. (Motivating case: an orchestrator fixed two defects
   its own Phase 3.5 browser pass had found — "quicker to fix here" — and from then on carried out
   every round on the main thread, `pr-self-review` fixes included.)
5. **Re-verify narrowly.** Re-run only the gate(s) whose findings you addressed, scoped to the
   touched files/`AC`s — not the whole review again.
6. **Convergence guard.** Repeat until **no blocking finding remains**, OR a round makes **no
   progress** (report and stop), OR the **round cap (default 3)** is hit. Each round, report what
   was fixed and what remains, and ask the user: keep iterating / accept-with-gaps / stop. Never
   loop silently or forever.

## Phase 3.5 — VERIFY (real functionality, NOT mocks)

Green mocked tests + clean static review do **not** prove the feature works. Before the gate,
**drive the actual built feature end-to-end and observe real behavior** — the runtime path every
test mocked away.

- **Launch the real stack and exercise the flow the diff touches.** Invoke **`/run`** (or `/verify`):
  bring up the project's real stack end-to-end (datastore + services + UI as applicable), then hit
  the new route with real data, trigger the real background job / external call, click through the
  new UI, read the response / screenshot. The app as a user meets it — not an `import`-and-`console.log`.
- **Target what the mocks hide:** background/fire-and-forget jobs (real failure + timeout paths),
  real LLM/HTTP calls (latency, hangs, error shapes), process-level behavior (unhandled rejections,
  crashes), and anything whose test uses a stub that "resolves instantly / never fails / returns a
  fixture". A mock provider that answers in 1 ms can never hit the timeout that crashes prod.
- A runtime bug found here is a **blocking finding** → fix it via a Phase-3 dispatch (step 4 —
  you found it, you still do not fix it) **plus a regression test that reproduces it** (red→green,
  at the layer that would have caught it), then re-verify. Do NOT accept a "the gates were green"
  as a reason to skip this.
- **What only a human can judge** (speech, look, feel) goes to the user as the five-minute script
  of Phase 3 step 2 — after this pass has cleared every non-sensory check, so their minutes go on
  perception alone.
- Motivating case: every mocked unit/integration/client test AND all three review gates
  (plan-verifier all-ACs-met, architecture 0-violations, /code-review 0-bugs) passed — yet a slow
  generation job's failure took down the entire service. Only `/run` surfaced it.

Skip ONLY when the diff has no runtime surface (docs / tests / config-only). Any change to product
source has one — drive it.

## Phase 4 — GATE & REPORT

- **`engineering-paved-path:pr-self-review`** (Skill) over the **whole diff** — the pre-push gate;
  it blocks on any critical. Do not narrow it to what changed since Phase 2: its recorded verdict
  vouches for the entire diff being pushed, against rubrics the Phase 2 gates do not apply. Keep
  its cost down instead — its bucket reviewers are `general-purpose`, so give them an explicit
  cheaper `model` (Cost notes), and hand them the gaps the user already accepted in Phase 3 so
  those are not re-raised (a critical is reported regardless). A finding you act on is
  **dispatched** (Phase 3 step 4), and the skill re-run last so its verdict matches the tree you
  push.
- **◆ GATE — ship decision.** Ask the user (`AskUserQuestion`) whether to push / open a PR, or
  hold. Only run git-outbound commands on explicit confirmation.
- *(Optional)* offer to document the feature from the finished work / plan.
- **Final report:** plan path (+ traced `SPEC-NN`) · files changed · test results · review verdicts
  **before → after** the fix loop · **runtime verification** (what real flow you drove in Phase 3.5
  + what it found/fixed) · remaining accepted gaps (including the expected test-evidence ones) ·
  branch state (ready to push / PR, or blocked and why).
- *(Optional)* offer **`sdd-engineering:retro`** to capture a retrospective of THIS run (agents,
  tokens, what was hard / duplicated / missed, recommendations) — run it now, while the per-agent
  telemetry is still fresh in context, before it scrolls out.

---

## Interaction points (all `AskUserQuestion`, main-thread only)
Each fix-loop round decision (Phase 3) · a human sensory check, when a finding is about what a
human perceives (Phase 3 step 2) · the ship decision (Phase 4). Everything else runs
delegated and unattended. (Spec/plan clarifications happened earlier, in the separate
`sdd-engineering:write-spec` and `sdd-engineering:plan-implementation` steps.)

## Parallelism rules
Independent subagents go in **one message**: same-wave implementers (Phase 1), the four review
gates (Phase 2). Respect disjoint-file-sets and the ≤3–5-worker ceiling; sequence anything that
shares files or depends on a prior wave's committed result.

## Guardrails & honesty
- If a precondition isn't met (no plan, red tests, un-integrated worktrees), **stop and say so**.
- Report subagent blockers verbatim; never mark a gate passed on assumption.
- The plan (`PLAN-*.md`) stays the single source of truth for the HOW across phases/chats.
- **A spawned session makes the working branch shared.** Once a background task / session has
  been spawned during the run, the branch can move under you: before each commit and before
  reporting branch state, run `git log <your last commit>..HEAD` — a commit you did not make means
  stop and reconcile, not commit on top or report from memory. When you spawn a task, say which
  branch it may write to (its own, unless writing to the working branch is the point).
  (Motivating case: a spawned session merged into and pushed a branch another session had checked
  out.)

## Language
Converse in the language of the request; keep agent/skill names, paths, and commands verbatim.
