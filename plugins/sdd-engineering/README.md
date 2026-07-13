# SDD Engineering

A complete **Spec-Driven Development (SDD)** workflow for Claude Code: turn a request into a reviewed
**spec**, then a file-level **plan**, then execute it with delegated implementation, layered review,
and runtime verification, and finally a **retro** that documents how well the workflow itself ran.

Agents are thin orchestrators; the reusable procedures live in skills. Framework/testing/security depth
comes from [`engineering-paved-path`](../engineering-paved-path), structural review from
[`architecture-review`](../architecture-review), and investigation from
[`research-tools`](../research-tools) — all pulled in automatically as dependencies.

## The SDD loop

```
spec-creator ──▶ implementation-planner ──▶ run-plan ──▶ retro
   (WHAT)              (HOW)                (execute)   (document)
                                              │
              ┌───────────────────────────────┴───────────────────────────────┐
              build            review (parallel)            verify        gate
           implementer   plan-verifier · architecture-      /run     pr-self-review
                         reviewer · /code-review
```

1. **`spec-creator`** — authors the spec (the **WHAT**: problem, EARS acceptance criteria,
   boundaries) via `sdd-engineering:write-spec` and `sdd-engineering:requirements-engineering`.
   It can't ask you mid-run, so open decisions become `[NEEDS CLARIFICATION: NC-n]` markers you resolve.
2. **`implementation-planner`** — read-only architect that turns the approved spec into a file-level
   plan (the **HOW**) via `sdd-engineering:plan-implementation`. Never writes code.
3. **`run-plan`** — orchestrates execution and delegates every edit:
   - **build** — fans out **`implementer`** per task unit (worktree-isolated, file-scoped, tests +
     typecheck green);
   - **review** (parallel) — **`plan-verifier`** (requirement coverage with `path:line` verdicts),
     **`architecture-reviewer`** (structure), and `/code-review` (line-level bugs);
   - **fix loop** → **runtime verify** (`/run` drives the real stack) → **gate**
     (`engineering-paved-path:pr-self-review`) → report.
4. **`retro`** — documents SDD-harness performance: aggregates a durable telemetry ledger (see below)
   into a RETRO report + trend row and routes learnings back to project memory.

## Components

### Agents
| Agent | Role |
|-------|------|
| `spec-creator` | Authors/resolves the spec — WHAT only, with `NC-n` markers |
| `implementation-planner` | Read-only; turns a spec into a file-level plan |
| `implementer` | Executes ONE task unit in a git worktree, file-scoped, tests green |
| `plan-verifier` | Read-only acceptance gate: requirement traceability with `path:line` verdicts |

### Skills
| Skill | Purpose |
|-------|---------|
| `write-spec` | Drives spec authoring end-to-end |
| `requirements-engineering` | Completeness rubric for requirements |
| `plan-implementation` | Produces the file-level implementation plan |
| `run-plan` | Orchestrates the execution phase (build → review → fix → verify → gate) |
| `retro` | Documents harness performance from the telemetry ledger |

## Durable harness telemetry

SDD steps are often run **separately** — spec now, planning later, implementation in another session —
so by the end, the earlier steps' in-context telemetry is gone. To keep the record, this plugin ships a
**`SubagentStop` / `Stop` hook** that appends each step's telemetry (agent, tokens, tool-uses,
duration, status) to a durable per-project ledger (default `retros/ledger.jsonl`). `retro` then
**aggregates the ledger** — so `write-spec` and planning performance survive to the final report.
*Capture is per-step; the documented report is end-of-run.*

## Usage

Typical flow (Claude also triggers these automatically when the context fits):

```
/sdd-engineering:write-spec      # spec-creator drafts the spec; resolve any NC-n markers
# implementation-planner produces plans/PLAN-*.md from the approved spec
/sdd-engineering:run-plan        # execute the approved plan end-to-end
/sdd-engineering:retro           # document how the run went
```

## Dependencies

Installing `sdd-engineering` **auto-installs** its dependencies (all `^1.0.0`, same marketplace):

```
sdd-engineering
├── research-tools              (researcher — investigation)
├── architecture-review ─┐      (architecture-reviewer — review phase)
└── engineering-paved-path ◀────┘  (skills the agents preload; shared base)
```

## Install

```bash
claude plugin marketplace add RostK/my-monkeys
claude plugin install sdd-engineering@my-monkeys
```

## Versioning

See [CHANGELOG.md](CHANGELOG.md). Released as an immutable semver; dependencies are pinned with `^1.0.0`.
