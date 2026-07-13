# Architecture Review

Adds a **read-only `architecture-reviewer` agent** that reviews the *structure* of a change — a diff,
a module, or a whole branch — and reports how well it holds to architectural invariants. It checks
**topology**, not line-level correctness, and it **writes nothing**.

## The `architecture-reviewer` agent

- **Backend (onion / ports-and-adapters):** routes → service → repository layering, DI, the inward
  dependency rule, ports living in your shared contracts package, ORM access confined to repositories.
- **Frontend (feature-based Next.js/React):** thin pages, colocated components, a clean
  server/client boundary.
- **Findings are tiered** `Violation` / `Smell` / `Nit`, each grounded in an exact `path:line`
  import/type edge. When it finds no violation, it honestly recommends approval.
- **Read-only** — tools are `Read, Glob, Grep, Bash, Skill`; it never edits.

### When to use it

- **Use** for architectural/structural review of a diff, module, or branch.
- **Don't use** for line-level bug review — that's `/code-review`. For planning, use
  `sdd-engineering`'s `implementation-planner`.

## Usage

Claude invokes it automatically for structural reviews, or call it explicitly:

```
@architecture-review:architecture-reviewer  review the structure of this branch
```

It is one of the parallel review gates inside `sdd-engineering`'s `run-plan` workflow.

## Dependencies

Depends on [`engineering-paved-path`](../engineering-paved-path) `^1.0.0` — the reviewer preloads
`engineering-paved-path:onion-architecture`, `frontend-ui-architecture`, `zod`, `security`, and
`typescript-expert` to know where evidence should live and how to interpret it. Installing this plugin
pulls that dependency in automatically.

## Install

```bash
claude plugin marketplace add RostK/my-monkeys
claude plugin install architecture-review@my-monkeys
```

## Versioning

See [CHANGELOG.md](CHANGELOG.md). Released as an immutable semver (`^1.0.0`).
