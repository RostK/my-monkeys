---
name: onion-architecture
description: "Onion / ports-and-adapters / layered architecture for a TypeScript/Node backend (Fastify modules plus a pure domain core) — deciding WHICH ring backend code belongs in and WHICH WAY its dependencies may point. Use this skill WHENEVER working server-side: adding or changing a route/service/repository, adding an adapter or port, wiring something into the DI Container, deciding whether a route or service may import Drizzle / an SDK / another module, or reviewing the backend's layering — even when the user does not say 'onion' or 'architecture'. It enforces the inward dependency rule, the ports-in-shared / implementations-in-adapters split, the Container as the single composition root, Drizzle-queries-only-in-the-repository, and the Zod contracts in your shared package as the shared domain + boundary type. Backend structure and boundaries only — not Drizzle query syntax (use engineering-paved-path:drizzle-orm-patterns), Fastify route mechanics (use engineering-paved-path:fastify-best-practices), Postgres schema design (use engineering-paved-path:postgresql-table-design), Zod syntax (use engineering-paved-path:zod), or frontend layout (use engineering-paved-path:frontend-ui-architecture)."
when_to_use: "Trigger phrases: 'where does this backend logic / query go', 'can a route or service import the db / Drizzle', 'add a new server module', 'add an adapter / external integration', 'wire this into the container', 'should the service know about Fastify', 'is this module's layering right', 'review the backend architecture', 'how do I keep the core pure', 'where do the Zod contracts go'."
version: 1.0.0
---

# Onion Architecture

Decisions about **which ring backend code lives in and which way its dependencies may point** for
your Fastify modules and the pure domain core. A well-structured backend is onion-shaped
(ports-and-adapters behind a DI Container) — this skill makes that structure explicit and
**enforces it on every new or changed module** so the layering does not erode.

This skill is about **boundaries and placement**, not syntax. For Drizzle queries use
**engineering-paved-path:drizzle-orm-patterns**; for Fastify route mechanics use
**engineering-paved-path:fastify-best-practices**; for Postgres schema design use
**engineering-paved-path:postgresql-table-design**; for Zod syntax use **engineering-paved-path:zod**.

## Opinionated defaults

The calls this paved path settles for you. When tempted to answer "it depends," default to these.

- **Dependencies point inward only.** `routes → service → repository → db`, and `service → Container
  → adapter (via a port)`. The domain core depends on nothing outer; the pure core is the proof — it
  runs with no Fastify and no DB.
- **Ports in the core, implementations in infrastructure.** Adapter *interfaces* (ports) live in your
  shared contracts/ports package (e.g. `shared/adapters.ts`); concrete adapters live in `adapters/*`.
  To add a capability, define the interface first, implement it outside, then wire it in the Container.
- **The Container (`platform/container.ts`) is the only composition root.** Services receive
  `Container` and pull adapters off it (`await container.llm(id)`, `container.git`,
  `container.secrets.get(...)`). **Never `new` a concrete adapter** in a service or route, and never
  read `process.env` for a key — go through `container.secrets`.
- **Drizzle queries live only in the repository.** All `drizzle-orm` / `db/schema` imports and query
  building stay in `repository.ts` (and the colocated `repository/<aggregate>.repo.ts`), every query
  scoped by your tenant key (e.g. `workspace_id`). Routes and services never build a query. (Row
  *types* from `db/rows.ts` may flow up as the persistence model — see persistence-and-contracts.md.)
- **Zod contracts in your shared package are the shared domain + boundary type.** One schema drives
  request validation, response serialization, *and* (where relevant) untrusted-source output. Importing
  a shared contract from any ring is correct — **not** a layering violation. Validate at the edges
  (schema-first routes, `safeParse` on untrusted input); map persistence rows to a contract DTO before
  returning over HTTP.
- **A module is a vertical slice** (`routes.ts → service.ts → repository.ts` + `helpers.ts` /
  `constants.ts`), registered once in your module registration barrel (e.g. `modules/index.ts`). **No
  sibling-module imports** — share cross-cutting data access via a repository on the Container (e.g.
  `container.<x>Repo`).

## Reference files

Load on demand — keep this file in context, open a reference only when the task needs that depth.

- **[references/the-onion.md](references/the-onion.md)** — the four rings mapped to concrete folders, a
  full request trace, and step-by-step recipes for a new module and a new adapter.
- **[references/dependency-rules.md](references/dependency-rules.md)** — the import matrix (what each
  ring may and must not import, and why), the inward rule, ports, and the composition root.
- **[references/persistence-and-contracts.md](references/persistence-and-contracts.md)** — Drizzle in
  the repository, the row-vs-DTO map-at-the-seam rule, Zod contracts as the shared type, secrets
  isolation, and keeping the domain core pure.

## The onion, ring by ring

| Ring (outer → inner) | What | Where |
|---|---|---|
| **Presentation** | Fastify route plugins — thin HTTP glue | `modules/<name>/routes.ts` (registered in `modules/index.ts`) |
| **Infrastructure** | adapter *implementations* + DI wiring + DB access | `adapters/*`, `platform/*` (Container, jobs, sse, errors, config), `db/*` |
| **Application** | use-cases / orchestration + the data-access facade | `modules/<name>/service.ts`, `repository.ts` (+ `repository/*.repo.ts`) |
| **Domain core** | Zod contracts + adapter *interfaces* (ports); the pure engine | your shared package's `contracts/*` and `adapters.ts` (ports); the pure domain core |

The inversion that makes it an onion: **the port (`adapters.ts` in your shared package) sits in the
innermost ring, its implementation in `adapters/` in the outer ring.** Inner defines the interface;
outer implements it; the Container injects the concrete at the edge.

## Decision framework — which ring does this go in?

Apply in order; each answers a "where does this belong?" question.

1. **An external call** (network, disk, a process, a third-party SDK)? → define a **port** in your
   shared package (`adapters.ts`), implement it in `adapters/<kind>/`, resolve it via the **Container**.
   Never make the call inline.
2. **A SQL / Drizzle query**? → `repository.ts` (or a `repository/<aggregate>.repo.ts`), scoped by your
   tenant key (e.g. `workspace_id`). Nowhere else.
3. **Use-case orchestration / business logic**? → `service.ts`, depending on `Container` + the
   repository, not on concrete adapters.
4. **An HTTP shape** (params / body / response)? → a Zod contract in your shared package (`contracts/*`),
   used **schema-first** in `routes.ts` (declare it in the route `schema`; do not hand-roll `.parse`).
5. **Pure domain logic** (a decision, a computation, an orchestration with no I/O of its own)? → the
   domain core, framework-free (no Fastify, no DB, no `fs`); its only side effects come through injected
   ports.
6. **Wiring** (which concrete implementation, lifecycle, secret resolution)? →
   `platform/container.ts`, the composition root — the one place allowed to import concrete adapters
   and module repositories.

## What each ring may import

The inward rule, made concrete. Full table with rationale in **references/dependency-rules.md**.

- **`routes.ts`** → its own `service.ts`, your shared contracts, `platform/errors`, the
  request-context helper. **Not** `drizzle-orm`/`db/schema`, an adapter implementation, or another
  module's internals.
- **`service.ts`** → `Container` (type), its `repository.ts`, your shared contracts + ports, the domain
  core, `platform/errors`, its own `helpers`/`constants`. **Not** `drizzle-orm`/`db/schema` (no
  queries), a concrete adapter class (get it off the Container), Fastify types, or a sibling module's
  service/repository (use `container.<x>Repo`).
- **`repository.ts`** → `db/client`, `db/schema`, `db/rows`, `drizzle-orm`, your shared contracts. **The
  only ring that imports Drizzle.**
- **`adapters/*`** → its SDK, the port interface from your shared package, `platform/errors`. It
  *implements* the port. **Not** a module's service/repository, **not** Fastify.
- **Your shared package** (domain core) → `zod` and other shared contracts. **Nothing else** — no
  Drizzle, no Fastify, no adapters, no SDKs.
- **The domain core** → your shared contracts + `zod` + its own internals. **Never** imports from an
  outer ring (routes, adapters, db, platform) — that would make the core depend on an outer ring.
- **`platform/container.ts`** → everything concrete. The composition root wires it all.

## Adding a new module

1. Create `modules/<name>/` with `routes.ts`, `service.ts`, `repository.ts` (add `helpers.ts` /
   `constants.ts` as needed). ESM relative imports carry the `.js` extension.
2. Put request/response shapes as Zod contracts in your shared package (`contracts/*`) (or reuse
   existing).
3. `repository.ts` owns **all** Drizzle for the module; scope every query by your tenant key (e.g.
   `workspace_id`).
4. `service.ts` takes `Container` in its constructor; call the repository and pull adapters off the
   Container. No `new Adapter(...)`, no `process.env`.
5. `routes.ts` is a Fastify plugin: **schema-first** validation, resolve `getContext()` for
   `{ workspaceId, userId }`, throw `AppError`/`NotFoundError`/`ValidationError`/`ConfigError`,
   delegate to the service, and **map rows → a contract DTO** before returning.
6. Register the module **once** in your module registration barrel (`modules/index.ts`) — one import
   + one `app.register`.

## Adding a new adapter / port

1. Declare the **interface** in your shared package (`adapters.ts`) — the port, a plain TS interface.
2. Implement it in `adapters/<kind>/<impl>.ts`.
3. Add it to `ContainerOverrides` + a lazy getter in `platform/container.ts` (resolve secrets there,
   not in callers).
4. Add a mock to `adapters/mocks.ts` so tests inject it via your test-app bootstrap
   (`buildApp({ overrides })`).

## Architecture smells (flag these in review)

- **`import ... from 'drizzle-orm'`** or `db/schema` in a `routes.ts` or `service.ts` → a query
  escaped the repository. Move it into `repository.ts`.
- **`new <ConcreteAdapter>(...)`** (any adapter class) in a service/route → bypasses the Container.
  Resolve it via `container.<x>`.
- **`process.env.<KEY>`** for a secret in a handler/service → must go through
  `container.secrets.get(...)`; secrets are never logged.
- **`import { ... } from '../<other>/service.js'`** → a cross-module reach. Use a repository on the
  Container, or lift the shared piece to the Container.
- **Returning a raw row / `$inferSelect` from a route** → map to a Zod-contract DTO (e.g.
  `helpers.ts`) at the HTTP seam.
- **`import ... from 'fastify'`** (or any outer-ring import) inside the domain core or a shared
  contract → framework/outer ring leaked into the core.
- **An inline `fetch` / `axios` / SDK call** in a service or route → wrap it behind a port in
  `adapters.ts` instead.
- **Hand-rolled `Schema.parse(req.body)`** in a handler → declare the schema in the route `schema`
  (fastify-type-provider-zod 422s invalid input before the handler).
- **A new external integration with no interface** → there must be a port in `adapters.ts` and a mock
  in `mocks.ts`, or it cannot be unit-tested.
