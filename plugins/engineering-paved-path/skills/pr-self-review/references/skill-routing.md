# Skill routing — which skills review which files

The skill classifies every changed file by path into one or more **buckets**, then runs that
bucket's skills against only those files. A file may match several buckets — review it under
each (e.g. a `routes.ts` that builds a database query is both Backend HTTP and a layering
concern; a shared contract is both Contracts and onion). The globs below are examples — match
by **role in the codebase**, not by an exact path, and adapt them to your project's layout.

## Buckets

### UI — frontend components (e.g. `**/*.{ts,tsx}` in a web/client package)
- **engineering-paved-path:frontend-ui-architecture** — file placement, feature boundaries,
  Server/Client split, business logic out of components, junk-drawer `utils`, cross-feature
  imports, secrets in a `"use client"` graph.
- **engineering-paved-path:react-best-practices** — hooks rules, state, rendering, memoization,
  effects, data fetching.
- **engineering-paved-path:next-best-practices** — App Router mechanics, RSC boundaries,
  `async` APIs, metadata, route handlers, image/font/bundling.
- **engineering-paved-path:typescript-expert** — type safety at the seams, `any`/unsafe casts,
  public types.

### UI tests — test files under the UI (e.g. `**/*.test.{ts,tsx}`, `e2e/**`)
- **engineering-paved-path:react-testing-library** — query priority, `userEvent`, async
  patterns, no-implementation testing, mocking. *(Plus the UI skills for the code under test.)*
- An `e2e/**` suite is typically the deterministic, no-LLM browser suite.

### Backend HTTP — routes / framework layer (e.g. `**/routes.ts`, a `platform/` or `http/` dir)
- **engineering-paved-path:fastify-best-practices** — schema-first validation, plugins, hooks,
  error handling, serialization, CORS/security headers, logging.
- **engineering-paved-path:onion-architecture** — routes stay thin HTTP glue: no direct DB
  access, no adapter `new`, no sibling-module imports; resolve the request context; map rows →
  a contract DTO before returning.

### Backend app / data — services & repositories (e.g. `**/{service,repository}*.ts`, `**/repository/**`)
- **engineering-paved-path:onion-architecture** — services depend on the injected container +
  their repository, not concrete adapters or `process.env`; **all** DB access stays in the
  repository; every query scoped by its tenant key; no cross-module reach.
- **engineering-paved-path:drizzle-orm-patterns** — query/relations/transaction correctness,
  schema usage.

### DB — schema & migrations (e.g. `**/db/schema*/**`, `**/db/migrations/**`)
- **engineering-paved-path:postgresql-table-design** — data types, indexing, constraints,
  normalization.
- **engineering-paved-path:drizzle-orm-patterns** — schema definition + migration mechanics.
- ⚠ Migration files are usually **generated** — flag any hand-edit (regenerate via your ORM's
  migration tool). Destructive migrations (drop column/table, type narrowing) are critical.

### Contracts — shared contracts / any `z.object(...)` (e.g. a `contracts/` or shared package)
- **engineering-paved-path:zod** — schema correctness, `safeParse` at boundaries, discriminated
  unions, no double validation, error shape.
- **engineering-paved-path:onion-architecture** — shared Zod contracts are the single source of
  truth (request validation + response serialization + LLM/external output). If the same
  contract is vendored into more than one package, the copies must stay in sync — never fork one.

### Pure engine — framework-free core (e.g. a domain/engine package)
- **engineering-paved-path:onion-architecture** — the engine is framework-free: **no** web
  framework, no DB, no `fs`, no imports from outer infrastructure rings. Its only side effects
  are injected dependencies. Any outer-ring import here is critical.
- **engineering-paved-path:typescript-expert** — keep the engine's public types tight.

### Cross-cutting — any file touching auth / secrets / user input / uploads / an endpoint
- **engineering-paved-path:security** (OWASP Top 10:2025) — authz/IDOR, injection, secret
  handling, upload safety, input validation. Secrets should flow through the app's configured
  secret store (never `process.env` for a key, never logged, never in a client bundle).

## Files to skip (not reviewed)

- `**/*.md`, docs, `*.json` fixtures, lockfiles, generated `dist/` — unless the change is the
  point of the PR.
- `engineering-paved-path:engineering-insights` (and any non-review skill) is **not** a review
  rubric and never runs here.

## When a file matches nothing

Review it under **engineering-paved-path:typescript-expert** (if `.ts`/`.tsx`) and
**engineering-paved-path:security** (if it handles input, auth, or secrets). If still nothing
applies, note it as "unrouted — manual eyeball" rather than silently dropping it.
