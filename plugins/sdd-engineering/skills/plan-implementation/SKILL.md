---
name: plan-implementation
description: "Orchestrates the PLAN phase of Spec-Driven Development — the thin main-thread wrapper around the read-only implementation-planner agent, mirroring how sdd-engineering:write-spec wraps spec-creator. Takes an APPROVED spec and plans its IMPLEMENTATION: invokes implementation-planner to produce the file-level HOW, relays the planner's clarifications via AskUserQuestion, fans out researcher agents for any [RESEARCH NEEDED] gap, confirms multi- vs single-agent execution, and — the thing the read-only planner cannot do — PERSISTS the plan to the plan directory (default plans/, files PLAN-*.md). Runs BETWEEN sdd-engineering:write-spec (WHAT) and sdd-engineering:run-plan (build). Orchestrates only; writes no code and authors no spec."
when_to_use: "Trigger phrases: '/plan-implementation', 'plan the implementation', 'turn the spec into a plan', 'run the planner', 'make the implementation plan'. Runs AFTER an approved spec exists (sdd-engineering:write-spec) and BEFORE sdd-engineering:run-plan. Requires an approved SPEC-*.md in the spec directory — if the spec is still draft/has open NCs, finish sdd-engineering:write-spec first. Explicit, user-invoked."
version: 0.1.0
---

# plan-implementation

You **orchestrate** the PLAN phase — you do NOT write the plan yourself. The read-only
**`implementation-planner`** agent produces the file-level HOW; your job is the main-thread work a
read-only subagent cannot do: **talk to the user** (`AskUserQuestion`), **fan out researchers** for
its information gaps, confirm the **execution mode**, and **persist the plan to the plan directory**
(default `plans/`; the planner cannot write). This is the exact mirror of how
`sdd-engineering:write-spec` wraps `spec-creator`.

You sit between the two other SDD phase skills: **`sdd-engineering:write-spec`** (the WHAT) upstream,
and **`sdd-engineering:run-plan`** (build → review → fix → gate) downstream, which consumes the plan
you persist.

## Hard boundaries
1. **You never author the spec or write code.** The spec (WHAT) is your INPUT and must be
   `approved`; the plan (HOW) is produced by the planner; code is `sdd-engineering:run-plan`'s job.
2. **The planner is read-only** — it emits a plan and flags gaps; it cannot spawn agents or write
   files. You own every write and every fan-out around it.
3. **Persist the plan** — the durable `PLAN-*.md` artifact (in the plan directory, default `plans/`)
   is the whole point: it survives the chat boundary and is what `sdd-engineering:run-plan` and
   `plan-verifier` consume. HOW lives in the plan directory, never in the spec directory.

## Procedure — the loop

```
- [ ] 1. INTAKE — take the approved spec path (a SPEC-*.md in the spec directory, default specs/). If it is
         still `draft` or has open [NEEDS CLARIFICATION], STOP and route the user to sdd-engineering:write-spec
         to finish it first — do not plan against an unapproved spec.
- [ ] 2. PLAN — invoke the `implementation-planner` agent (Task) with the approved spec path + the instruction
         to reuse the spec's AC-N ids verbatim. It returns a file-level plan (task units, parallelization graph,
         skills, known pitfalls, test plan) plus its handoff markers.
- [ ] 3. CLARIFY — act on the planner's markers IN THE MAIN THREAD:
         • "Open questions / clarifications" → ask the user via AskUserQuestion (batch related, recommend a default).
           (The planner may try to ask directly; if it instead returns questions as markers, you relay them — same
           graceful degradation as write-spec, since a subagent cannot reliably prompt the user.)
         • [RESEARCH NEEDED: …] → fan out one or more `researcher` agents in parallel (main-thread only — the
           planner cannot); feed their cited findings back by re-invoking the planner for a follow-up pass.
         • Execution mode → confirm multi- vs single-agent (the planner recommends; you confirm via AskUserQuestion).
         Loop 2–3 until the plan has no blocking gap.
- [ ] 4. PERSIST — write the plan to `PLAN-<SPEC-ID>-<slug>.md` in the plan directory (default `plans/`; you
         do this — the planner is read-only). Reuse the spec's SPEC-NN id + slug so spec ↔ plan ↔ code stay traceable.
- [ ] 5. GATE — plan approval: show the plan summary (task units + tracks + parallel groups, scope, contract/
         schema changes, risks) and ask the user Approve / Adjust before any build. Do not hand off an unapproved plan.
- [ ] 6. (OPTIONAL) RETRO — if this phase fanned out several agents (planner re-invocations, researchers), offer
         **`sdd-engineering:retro`** while the per-agent telemetry is still fresh in context, before it scrolls out.
- [ ] 7. HANDOFF — point the user to `sdd-engineering:run-plan` on the persisted `PLAN-<SPEC-ID>-<slug>.md`
         for build → review → fix → gate.
```

## Quality bar for a plan
- Every requirement in the spec maps to ≥1 task unit; every task unit traces back to an `AC-N` (ids
  reused **verbatim**, each with its `Verify:` hint) — so `plan-verifier` gets a clean forward pass.
- Task units name exact files, the skills to apply, and the INSIGHTS pitfalls that bite them;
  parallel groups have **disjoint** file sets (shared-file units are sequenced).
- Non-functional requirements are carried from the spec into the plan (they shape design, not just
  behavior). Contract changes flag **every duplicated / vendored copy** of the shared contract (e.g.
  a type or schema shared across packages must be updated in each copy).
- Information gaps are `[RESEARCH NEEDED]` items you resolve (fan out researchers), never guesses
  baked into the plan.

## Boundaries recap
Orchestration only. No spec authoring (that is `sdd-engineering:write-spec`), no code (that is
`sdd-engineering:run-plan`), no plan writing by the planner (it is read-only — you persist). Keep the
plan directory for the HOW, the spec directory for the WHAT.

## Language
Converse in the language of the request; keep the plan body's paths, identifiers, commands, skill
names, and `AC-N` ids verbatim.
