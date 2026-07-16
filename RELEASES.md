# Releases

This document is the release history of every plugin published from this marketplace: which
versions have shipped, when, and under which git tag. It follows the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format — one top-level section per
plugin, versions newest-first — and this marketplace's plugins adhere to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each plugin also carries its own more detailed `plugins/<name>/CHANGELOG.md` with full
per-version release notes; the entries here are release-tracking summaries, cross-referenced to
the git tag (or pending tag) each version corresponds to.

For what a tag actually looks like — the two tag families, which one every real tag in this repo
uses, and how to cut one — see the **[README's "Tag grammar" section](README.md#tag-grammar)**.
That section is the single normative definition; it is not restated here.

## A note on the three backfilled tags

Three of the seven versions below shipped to `main` before a tag existed for them (the tag was
cut later, pointing at the historical commit that actually shipped the version — see
[`scripts/backfill-tags.sh`](scripts/backfill-tags.sh)). As of this writing, `git tag -l` shows
only the **four** tags for versions that were tagged at release time; the three backfilled tags
are created by a maintainer running `scripts/backfill-tags.sh --apply` and pushing the result —
this has not happened yet. Each affected entry below is marked **(backfilled tag)** and states
the tag name that names the version's commit either way, whether or not that tag has been pushed
at the time you're reading this.

## At a glance

All seven versions ever released, across all four catalog plugins:

| Plugin | Version | Date | Tag | Status |
|---|---|---|---|---|
| `engineering-paved-path` | 1.0.0 | 2026-07-13 | `engineering-paved-path--v1.0.0` | tagged |
| `research-tools` | 1.0.0 | 2026-07-13 | `research-tools--v1.0.0` | tagged |
| `architecture-review` | 1.0.0 | 2026-07-13 | `architecture-review--v1.0.0` | tagged |
| `architecture-review` | 1.1.0 | 2026-07-14 | `architecture-review--v1.1.0` | shipped before tagged; backfilled tag |
| `sdd-engineering` | 1.0.0 | 2026-07-13 | `sdd-engineering--v1.0.0` | tagged |
| `sdd-engineering` | 1.1.0 | 2026-07-14 | `sdd-engineering--v1.1.0` | shipped before tagged; backfilled tag; **superseded by 1.1.1** |
| `sdd-engineering` | 1.1.1 | 2026-07-14 | `sdd-engineering--v1.1.1` | shipped before tagged; backfilled tag; current |

## engineering-paved-path

### [1.0.0] - 2026-07-13

**Tag:** `engineering-paved-path--v1.0.0` — cut at release.

Initial release: thirteen reusable engineering skills spanning architecture (onion architecture,
frontend UI architecture), framework conventions (React, Next.js, Fastify), language & validation
(TypeScript, Zod), data (Drizzle ORM, PostgreSQL table design), testing (React Testing Library),
quality & security (security review, PR self-review), and a hook-based `engineering-insights`
capture skill. Migrated and generalized from an internal engineering toolkit.

## research-tools

### [1.0.0] - 2026-07-13

**Tag:** `research-tools--v1.0.0` — cut at release.

Initial release: a read-only `researcher` agent for project and internet research, with citations,
confidence levels, and an interview-first flow.

## architecture-review

### [1.1.0] - 2026-07-14

**Tag:** `architecture-review--v1.1.0` **(backfilled tag)** — this version shipped to `main`
before a tag existed for it; see the note above.

Added a read-only `/version-check` command: reports the installed version of each my-monkeys
plugin and compares it against the version pinned in the marketplace manifest, flagging anything
stale.

### [1.0.0] - 2026-07-13

**Tag:** `architecture-review--v1.0.0` — cut at release.

Initial release: a generalized, read-only `architecture-reviewer` agent covering onion-architecture
and feature-based frontend topology checks, with Violation/Smell/Nit tiering and `path:line`
citations. Declares a dependency on `engineering-paved-path` `^1.0.0`.

## sdd-engineering

### [1.1.1] - 2026-07-14 — current

**Tag:** `sdd-engineering--v1.1.1` **(backfilled tag)** — this version shipped to `main` before a
tag existed for it; see the note above.

Fixed the telemetry ledger recording phantom agent rows: the harness's internal `SubagentStop`
events (not only real Task-tool agent launches) were being recorded as zero-cost agents, inflating
`retro`'s "N agents launched" count. Also fixed a case where a subagent's cost could be
misattributed to the main thread's transcript, and added `coldStart` bookkeeping so a
transcript-watermark reset is distinguishable from genuine cumulative usage. This release
**supersedes 1.1.0**, which is retained below for the historical record but is not the version any
consumer should install.

### [1.1.0] - 2026-07-14 — superseded by 1.1.1

**Tag:** `sdd-engineering--v1.1.0` **(backfilled tag)** — this version shipped to `main` before a
tag existed for it; see the note above.

> **Superseded.** 1.1.1 replaced this version the same day it shipped; it is listed here only
> because it is a real, distinct release that reached `main` on its own commit (naming its own
> backfilled tag, `sdd-engineering--v1.1.0`, per the note above). Install 1.1.1, not this version.

Fixed the telemetry ledger recording `null` for every cost field (the hook read a usage block the
event payload never carried; usage is now read from the transcript instead) and fixed
unattributable `SubagentStop` rows. Added `cacheReadTokens`/`cacheCreationTokens` and incremental,
watermark-based accounting so re-reading a growing transcript doesn't double-bill it.

### [1.0.0] - 2026-07-13

**Tag:** `sdd-engineering--v1.0.0` — cut at release.

Initial release of the Spec-Driven Development workflow: the `spec-creator`,
`implementation-planner`, `implementer`, and `plan-verifier` agents; the `write-spec`,
`requirements-engineering`, `plan-implementation`, `run-plan`, and `retro` skills; and a durable
`SubagentStop`/`Stop` telemetry hook writing to `retros/ledger.jsonl`. Depends on
`engineering-paved-path`, `research-tools`, and `architecture-review` (all `^1.0.0`), auto-installed
with this plugin.
