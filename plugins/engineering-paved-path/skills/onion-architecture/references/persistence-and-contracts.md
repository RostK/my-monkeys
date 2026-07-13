# Persistence & contracts — Drizzle, Zod, and the mapping seam

How this paved path places its two most-coupling tools — **Drizzle** (persistence) and **Zod**
(boundary) — under the onion, and how it resolves the real debates about each. The wider research and
links are in the skill README.

## Drizzle lives in the repository

**Rule: all `drizzle-orm` and `db/schema` imports, and all query building, stay in `repository.ts`
and the colocated `repository/<aggregate>.repo.ts`.** The repository is the *only* layer that touches
the DB for its domain. A repository is a facade composing per-aggregate query modules (e.g.
`order.repo.ts`, `line-item.repo.ts`), every query scoped by your tenant key (e.g. `workspace_id`).

Why here and nowhere else: persistence is the most volatile, most infrastructural concern, so it sits
at the outer edge. A service that builds a query has pulled the database into the application ring; a
route that does is worse. Keeping queries in one place also makes the tenant-scoping invariant
auditable — you can read every query for a domain in one folder.

### Queries vs. types — the nuance this paved path follows

There is a well-known purist position (the "rotten onion" critique; see the skill README) that the
domain must never even *reference* an ORM-inferred type — that `type User = typeof users.$inferSelect`
leaks the database shape inward. **This paved path does not go that far, and the skill should not
pretend it does.** The real, lighter rule here:

- **Queries never escape the repository.** This is the hard line.
- **Row types *may* flow up to the service as the "persistence model."** The repository exposes e.g.
  `OrderRow = typeof t.orders.$inferSelect` and returns row types (from `db/rows.ts`); the service
  consumes them. That is accepted — Drizzle is a typed SQL builder with no proxies or lazy loading, so
  a row type is just a shape, not a live ORM entity.
- **Rows are mapped to a Zod-contract DTO before crossing the HTTP boundary out.** A `helpers.ts`
  mapper (e.g. `orderToDto`) converts `OrderRow` → `OrderDto` in the application ring; the route
  returns the DTO, never the raw row. Mapping happens **at the seam where the shape actually changes**
  (persistence → wire), not ceremonially at every layer.

So: *map at the HTTP seam, keep queries in the repository, and don't return `$inferSelect` rows from a
route.* That's the middle way (Bozho's "map only when the shape diverges"; see the skill README).

## Zod contracts in your shared package are the shared domain + boundary type

This paved path deliberately makes one Zod schema the single source of truth — it drives **request
validation, response serialization, AND untrusted-source output** (e.g. an LLM reply). That places it
in the **schema-as-source-of-truth** camp, *not* the purist "the domain must not import Zod" camp. Two
consequences the skill enforces:

1. **Importing a shared contract from any ring is correct** — including the domain core. It is not a
   layering violation. (The contracts depend only on `zod`, so the core stays infrastructure-free.)
2. **Validate at the edges; trust within.** "Parse, don't validate" at every boundary:
   - **HTTP in** — schema-first routes: declare the Zod `params`/`body` in the route `schema`
     (fastify-type-provider-zod 422s bad input before the handler). Never hand-roll
     `Schema.parse(req.body)`.
   - **HTTP out** — serialize against the response contract; return a DTO, not a row.
   - **Untrusted output** (e.g. an LLM reply) — the untrusted boundary. The domain core converts the
     Zod schema to JSON Schema, then `safeParse`s the reply (with reprompt-on-error). Such output is
     treated exactly like user input — never trusted raw.

## The three representations and when to map

Three shapes are in play. Keep them straight, and only map where they genuinely differ:

| Representation | Type | Lives in | Example |
|---|---|---|---|
| **Persistence row** | Drizzle `$inferSelect` (`db/rows.ts`) | repository → service | `OrderRow`, `LineItemRow` |
| **Boundary / DTO** | Zod contract (shared package `contracts/*`) | crosses HTTP; untrusted I/O | `OrderDto`, `LineItem`, `Order` |
| **Domain value** | a contract type, or a service-local shape | application + core | `Money`, `OrderStatus` |

- **Map** when the shapes diverge — row → DTO at the HTTP seam (`helpers.ts`). Drop internal columns,
  reshape for the client, enrich (e.g. compute a derived total at read time).
- **Share** when they coincide — a Zod contract that is already exactly the wire shape needs no second
  type. Don't add a mapper for a 1:1 passthrough; that's the ceremony the research warns against.

The test: *does the outward shape differ from the stored shape?* If yes, map; if no, share the
contract. Don't impose a mapper layer the codebase doesn't have.

## Secrets are infrastructure

API keys and tokens are resolved **only** through `SecretsProvider` (`container.secrets.get(...)`),
which the Container injects into adapters at construction. No ring reads `process.env` for a key, and
secrets are never logged or persisted to the DB. This is the same inversion as every other port: the
*interface* (`SecretsProvider`) is in the core, the *implementation* (`LocalSecretsProvider`, reading a
local secrets file or a cloud secrets manager) is in `adapters/secrets/`.

## Keep the domain core pure

The domain core is the innermost ring and the purity yardstick. It imports your shared contracts +
`zod` only. Any structured-output path (Zod schema → JSON Schema → `safeParse` the reply →
repair/retry) is a model boundary handled through injected ports. If a feature tempts you to give the
core a DB handle, an HTTP client, or a Fastify type, that feature belongs in the application ring (the
module's `service.ts`), which passes already-resolved data *into* the pure core.
