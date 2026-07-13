# The onion — rings, trace, and recipes

The concentric rings mapped to a concrete folder layout, a worked request trace, and step-by-step
recipes. Dependencies point **inward**: an outer ring may call any inner ring; an inner ring never
imports an outer one. (The canonical statement of that rule — Palermo's tenets, Martin's Dependency
Rule — is in the skill README.)

## The four rings, concretely

```
            ┌──────────────────────────────────────────────────────────┐
            │  PRESENTATION   modules/<name>/routes.ts                  │   Fastify plugins
            │  ┌────────────────────────────────────────────────────┐  │   (registered in
            │  │  INFRASTRUCTURE                                     │  │    modules/index.ts)
            │  │   adapters/*      (port implementations)           │  │
            │  │   platform/*      (Container, jobs, sse…)          │  │
            │  │   db/*            (schema, client, migrations)     │  │
            │  │  ┌──────────────────────────────────────────────┐  │  │
            │  │  │  APPLICATION                                 │  │  │
            │  │  │   modules/<name>/service.ts    (use-cases)   │  │  │
            │  │  │   modules/<name>/repository.ts (data access) │  │  │
            │  │  │  ┌────────────────────────────────────────┐  │  │  │
            │  │  │  │  DOMAIN CORE                           │  │  │  │
            │  │  │  │   shared/contracts/*  (Zod)            │  │  │  │
            │  │  │  │   shared/adapters.ts  (ports)          │  │  │  │
            │  │  │  │   core/*  (pure domain logic)          │  │  │  │
            │  │  │  └────────────────────────────────────────┘  │  │  │
            │  │  └──────────────────────────────────────────────┘  │  │
            │  └────────────────────────────────────────────────────┘  │
            └──────────────────────────────────────────────────────────┘
```

**Domain core** — your shared contracts/ports package. The Zod contracts (`shared/contracts/*`) and the
adapter *interfaces* (`shared/adapters.ts`: e.g. `LLMProvider`, `GitHubClient`, `GitClient`,
`SecretsProvider`). Plus the pure domain core (`core/*`) — framework-free logic whose only side effects
arrive through injected ports. Imports `zod` and nothing else infrastructural.

**Application** — `modules/<name>/`. `service.ts` orchestrates a use-case (it takes a `Container`,
calls the repository, pulls adapters off the Container, may call the pure core). `repository.ts` is the
data-access facade — the **only** layer that touches the DB for that domain — composing query modules
under `repository/` split by aggregate.

**Infrastructure** — the outer ring that *implements* the ports and wires everything. `adapters/*`
holds the concrete adapters (e.g. `github/octokit.ts`, `git/simple-git.ts`, `llm/openai.ts`,
`secrets/local.ts`). `platform/*` holds the Container (composition root), a job runner, an event/SSE
bus, `errors.ts`, `config.ts`. `db/*` holds the Drizzle schema, client, and migrations.

**Presentation** — `modules/<name>/routes.ts`, a Fastify plugin doing schema-first validation and
delegating to the service, registered once in `modules/index.ts`.

## Why it is an *onion*, not just layers

The defining move: a **port is declared in the innermost ring and implemented in the outermost**. For
example `LLMProvider` is an interface in `shared/adapters.ts` (core), while
`OpenAIProvider`/`AnthropicProvider` live in `adapters/llm/` (infrastructure). The application (a
service) depends on the **interface**, and the **Container** injects the concrete at the edge:

```ts
// service.ts (application) — depends on the PORT, resolves via the Container
const llm = await this.container.llm(job.provider);   // LLMProvider, not OpenAIProvider
const result = await runJob({ input, llm, /* … */ });
```

Tests substitute a mock through `ContainerOverrides.llm` without touching the service — that
substitutability is the whole point of the inversion.

## A request trace (an order submission)

1. **Presentation** — `modules/orders/routes.ts` receives `POST /orders/:id/submit`. Zod
   `params`/`body` contracts validate it (422 before the handler). It resolves `getContext()` →
   `{ workspaceId }` and calls `new OrderService(app.container).submit(...)`.
2. **Application** — `OrderService` (`service.ts`) loads the order via its `OrderRepository`, applies
   the business rules, and records the state transition.
3. **Infrastructure (via ports)** — for any external effect it pulls adapters off the **Container**
   (e.g. `await container.payments()` or `await container.github()`), concrete implementations resolved
   from secrets there, and streams progress over `container.eventBus`.
4. **Domain core** — it calls a pure function from the core (e.g. `priceOrder(...)` /
   `validateTransition(...)`): a decision or computation with no I/O of its own; any side effect arrives
   through an injected port.
5. **Application → Infrastructure** — results persist through `OrderRepository` (the only Drizzle
   caller), scoped by `workspace_id`.
6. **Presentation** — the handler maps rows → a Zod-contract DTO (`helpers.ts: orderToDto`) and
   returns; Fastify serializes against the response contract.

Every arrow points inward or is mediated by the Container. No ring reaches around another.

## Recipe — add a new module

Say you add `modules/<name>/` (CRUD over a simple resource):

1. `modules/<name>/{routes.ts, service.ts, repository.ts}` (+ `helpers.ts` for DTO mapping). Relative
   imports carry `.js`.
2. Add the request/response shapes as Zod contracts in your shared package (`contracts/*`) (or reuse).
   These are the boundary type *and* the DTO type.
3. `repository.ts`: a `<Name>Repository` class taking `Db`; all `drizzle-orm` + `db/schema` use lives
   here, every query `where(eq(t.<table>.workspaceId, workspaceId))`.
4. `service.ts`: a `<Name>Service` taking `Container`. Business rules here; data via the repository;
   any external call via a Container adapter. Throw `NotFoundError` etc. from `platform/errors`.
5. `routes.ts`: a Fastify plugin — declare contracts in the route `schema`, `getContext()` for the
   workspace, delegate to the service, map rows → contract DTO before returning.
6. Register once in `modules/index.ts`.

If the module needs a brand-new external dependency, do the adapter recipe **first**.

## Recipe — add a new adapter / port

Say the product needs to send Slack notifications:

1. **Port (core)** — add an interface to your shared package (`adapters.ts`):
   ```ts
   export interface SlackClient {
     postMessage(channel: string, text: string): Promise<{ ts: string }>;
   }
   ```
2. **Implementation (infrastructure)** — `adapters/slack/web-api.ts` implements `SlackClient` using the
   Slack SDK; it imports the port + its SDK + `platform/errors`, nothing else.
3. **Wire it in the composition root** — add `slack?: SlackClient` to `ContainerOverrides` and a lazy
   getter on `Container` that resolves the token via `this.secrets.get('SLACK_TOKEN')` (mirroring the
   `github()` getter).
4. **Mock** — add a `SlackClient` mock to `adapters/mocks.ts` so `buildApp({ overrides })` injects it;
   unit tests never hit the network.

Now any service depends on the **interface** and gets the concrete from `container.slack` — the new
capability obeys the inward rule from day one.

## The pure core — the reference ring

The domain core is the cleanest ring: pure modules (an algorithm, a decision function, a state machine)
that import only your shared contracts and `zod`. It has **no** Fastify, DB, HTTP, or filesystem
dependency — its side effects arrive exclusively through injected ports. Treat it as the yardstick: if
a change would make the core import anything from an outer ring (routes, adapters, db, platform), the
change belongs in the application ring instead.
