# Engineering Paved Path

A **reusable base plugin** of engineering *skills* — modular, on-demand packages of specialized
knowledge and conventions that Claude loads only when a task needs them. It is the "paved path" the
other plugins in this marketplace build on: [`architecture-review`](../architecture-review) and
[`sdd-engineering`](../sdd-engineering) both declare it as a dependency.

Skills here are framework- and stack-opinionated (React / Next.js / Fastify / Drizzle / PostgreSQL)
but **project-agnostic** — no repository-specific paths or names are baked in.

## Skill catalog

| Skill | Area | What it gives Claude |
|-------|------|----------------------|
| `onion-architecture` | Architecture | Onion / ports-and-adapters: routes → service → repository, DI, inward dependency rule, ORM confined to repositories |
| `frontend-ui-architecture` | Architecture | Feature-based Next.js/React structure: thin pages, colocated components, server/client boundary |
| `react-best-practices` | Framework | Idiomatic React patterns and pitfalls |
| `next-best-practices` | Framework | Next.js App Router: RSC boundaries, data patterns, routing, metadata, hydration |
| `fastify-best-practices` | Framework | Fastify: routes, plugins, hooks, schemas, error handling, performance, security |
| `react-testing-library` | Testing | Behaviour-first React component testing |
| `typescript-expert` | Language | Strict TypeScript, utility types, diagnostics |
| `zod` | Validation | Schema design, parsing, composition, error handling, performance |
| `drizzle-orm-patterns` | Data | Drizzle schema, queries, relations, migrations, transactions |
| `postgresql-table-design` | Data | Relational table design conventions |
| `security` | Quality | Security checklists, patterns, and references |
| `pr-self-review` | Quality | Structured self-review gate with a severity rubric before you push |
| `engineering-insights` | Feedback | Hook-based capture of engineering pitfalls/insights so later planning/implementation can read them back |

Skills that need more depth ship supporting `references/`, `rules/`, or `examples.md` files that Claude
opens on demand — so the always-on cost stays small.

## Usage

Once installed and enabled, Claude **invokes these skills automatically** when a task matches. You can
also call one explicitly by its namespaced name:

```
engineering-paved-path:react-best-practices
engineering-paved-path:onion-architecture
```

Other plugins reference them the same way — e.g. `sdd-engineering`'s `implementer` preloads
`engineering-paved-path:typescript-expert`, and `architecture-review`'s reviewer preloads
`engineering-paved-path:onion-architecture`.

`engineering-insights` is **hook-based**: when enabled it captures insights as work happens, writing to
a project-local store so that `sdd-engineering`'s planning and retro steps can learn from them.

## Install

```bash
claude plugin marketplace add RostK/my-monkeys
claude plugin install engineering-paved-path@my-monkeys
```

You rarely install this alone — installing `architecture-review` or `sdd-engineering` pulls it in
automatically as a dependency.

## Versioning

See [CHANGELOG.md](CHANGELOG.md). Released as an immutable semver — dependents pin it with `^1.0.0`.
