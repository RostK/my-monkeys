# Changelog

All notable changes to **sdd-engineering** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this plugin adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-13

### Added
- Initial release of the Spec-Driven Development workflow.
- **Agents:** `spec-creator`, `implementation-planner`, `implementer` (merged backend + UI),
  `plan-verifier`.
- **Skills:** `write-spec`, `requirements-engineering`, `plan-implementation`, `run-plan`
  (orchestrates build → review → fix → verify → gate), `retro` (documents harness performance).
- **Durable telemetry:** a `SubagentStop`/`Stop` hook (`scripts/capture-telemetry.mjs`) appends
  per-step telemetry to `retros/ledger.jsonl` so `retro` can aggregate performance across separately
  run steps.
- **Dependencies:** `engineering-paved-path`, `research-tools`, `architecture-review` (all `^1.0.0`),
  auto-installed with this plugin.
- Migrated and generalized from an internal SDD toolkit; all project-specific paths, packages, MCP
  tools, and names removed.
