# Retro trends

One summary row per retro, appended by `sdd-engineering:retro`. Numbers match the source retro's
Metrics section verbatim — `unknown` / `~partial` are carried through, never replaced with a guess.

Distinct from `retros/ledger.jsonl` (per-step telemetry appended by the `SubagentStop` / `Stop` hook).

| Date | Workflow | Scope | Agents (prod/wasted) | Tokens | Cache-hit | Tool-calls | Wall vs agent-time | Rework | Source | Retro |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-07-14 | `write-spec` | SPEC-01 `preview` — research → draft → ask → resolve | 3 (3 / 0) | **unknown**, bounded [134k, 199k] `~partial` | **unknown** (no cache_read reported) | 61 | 1,185 s vs 727 s (≈0.61, serial by design) | 0 fix-loops · 1 extra clarification round · 1 NC left half-done (write-scope) | in-context notifications (**ledger telemetry all `null`**) | [RETRO-2026-07-14-write-spec.md](RETRO-2026-07-14-write-spec.md) |
| 2026-07-14 | `plan-implementation` | SPEC-01 → PLAN-01 — intake → plan → clarify → persist → gate | 1 (1 / 0) | **1,865,668** (47,548 out · 1,534,773 cache-read) | **84.4 %** | 22 | 1,200 s vs 610 s (single agent, n/a) | 0 fix-loops · **1 clarification round, no follow-ups** · 1 obsolete task unit (T8, already committed) caught at persist | ✅ **durable ledger — real telemetry** (fix `9bae60a` landed mid-run) | [RETRO-2026-07-14-plan-implementation.md](RETRO-2026-07-14-plan-implementation.md) |
