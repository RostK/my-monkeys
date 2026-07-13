# Research Tools

A small, focused plugin that adds one **read-only `researcher` agent** — a grounded investigator that
finds information inside your codebase or on the web and returns a **cited, structured report**. It
never writes, edits, or mutates anything, so it is safe to run anywhere.

## The `researcher` agent

- **Two modes** (auto-detected): *project* (files, code, config, git history), *internet* (external
  facts), or *both*.
- **Interview first** — clarifies a broad or ambiguous request with 1–3 questions before searching.
- **Citations always** — project findings cite `file:line`; internet findings link sources with a
  reliability rating. Confidence is labelled High / Medium / Low.
- **Honest** — "not found" is a valid answer; it never invents paths, URLs, dates, or facts, and
  distinguishes cited claims from inferences.
- **Read-only by construction** — tools are limited to `Read, Glob, Grep, Bash` (read-only commands),
  `WebSearch`, and `WebFetch`. No writes, no mutations.

## Usage

Claude invokes `researcher` automatically when you ask for grounded answers rather than changes. To
call it explicitly:

```
@research-tools:researcher  how does our auth middleware refresh tokens?
```

It is also used as a building block by [`sdd-engineering`](../sdd-engineering) for the investigation
step of its workflow.

## Install

```bash
claude plugin marketplace add RostK/my-monkeys
claude plugin install research-tools@my-monkeys
```

`research-tools` is a leaf plugin — it has no dependencies.

## Versioning

See [CHANGELOG.md](CHANGELOG.md). Released as an immutable semver (`^1.0.0`).
