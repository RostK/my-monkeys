# SPEC-01 — Lexical search engine + build-time keyword enrichment

- **Spec ID:** SPEC-01
- **Module:** `site` (the marketplace site)
- **Date:** 2026-07-14
- **Status:** approved
- **Owner:** RostK
- **Supersedes:** **`docs/SPEC-marketplace-ui.md` §5 (Search) and §6 (stack), in part** — specifically
  §5.2 (on-device embeddings via `@xenova/transformers`), §5.3 (Reciprocal Rank Fusion, `Smart` =
  semantic) and the embeddings row of the §6 stack table. *Rationale:* BM25 ranking plus baked
  keywords achieves substantially the same perceived quality at a 29-artifact corpus for a fraction
  of the cost and complexity, with no model download, no vector payload, and no build-time key.
  The rest of `docs/SPEC-marketplace-ui.md` stands. That document **stays readable as history** — it
  is not rewritten or deleted; only the sections named above are superseded by SPEC-01.

---

## 1. Problem

The marketplace site (https://rostk.github.io/my-monkeys/) ships 29 artifacts
(4 plugins, 18 skills, 6 agents, 1 command). Its search is a hand-rolled substring matcher in
`site/src/lib/search.js`, and it fails the primary use case the site exists for — a user
describing a *problem* in their own words and finding the artifact that solves it.

Grounded behaviour of the current matcher (`site/src/lib/search.js`):

- **Tokenization:** `state.q.toLowerCase().split(/\s+/)` — whitespace only. No stemming, no
  stop-word removal, no punctuation handling.
- **Matching:** every token must hit, or the artifact is dropped (`if (!hit) return false; // all
  tokens must match (AND)`). Matching is raw `String.indexOf` substring containment — no prefix
  semantics, no typo tolerance.
  - `mode === "smart"` → token must appear in `a.haystack` (`displayName + name + description +
    tags + plugin`, lowercased in `site/src/data.js`) **or** in `a.body` (full markdown).
  - `mode === "exact"` → token must appear in `displayName`, `name`, or `tags` only.
- **Scoring** (`score()`): fixed additive per-token weights — displayName +6, tags +4, description
  +3, plugin +2, body +1 (smart only). There is **no term frequency, no document frequency/IDF, and
  no field-length normalization**. A term that appears in all 29 documents scores exactly like a
  term unique to one.
- **Sorting:** the `Sort: Relevance` dropdown sorts by that additive score, tie-breaking on
  recency (`a.days`); with an empty query it silently falls back to `newest`.

Consequences:

1. **Sentence queries return zero results.** "how do I structure my React folders" hard-ANDs 6
   tokens; no artifact contains all of them, so the result set is empty even though
   `frontend-ui-architecture` is an exact conceptual match.
2. **Vocabulary gap.** A user searching "orm", "sql toolkit" or "database migrations" will not find
   *Drizzle ORM Patterns* unless those literal strings occur in its indexed text.
3. **No typo tolerance.** "fastfy" → zero results.
4. **"Relevance" is not relevance.** Without IDF, a common word ("code", "use") contributes the
   same weight as a discriminating one.
5. **The UI over-promises.** `site/src/strings.js` labels the toggle
   `"Smart = semantic ranking · Exact = keyword only"`. No semantic ranking exists; the shipped
   difference is only *which fields are scanned*. The copy is misleading today.

## 2. Goals

- **G1.** A natural-language / sentence query returns relevant artifacts, ranked, instead of an
  empty list.
- **G2.** Ranking is real information retrieval (term-frequency × inverse-document-frequency with
  length normalization), not a fixed additive weight table.
- **G3.** Typos, prefixes and word-form variation ("migrations" vs "migration") still find the
  artifact.
- **G4.** Close the vocabulary gap: an artifact is findable by the words users actually type
  (synonyms, problem phrasings), not only by the words its author happened to write.
- **G5.** All of the above stays **100% static and offline at query time** — no network call when
  the user types, no hosted service, no key on the client.
- **G6.** The `Smart` / `Exact` toggle and the `Sort: Relevance` dropdown gain a truthful,
  documented contract.

## 3. Non-goals

Explicitly **not** in this spec (state them so they are not re-litigated during planning):

- **NG-1.** Embeddings, vector search, semantic re-ranking, or any on-device transformer model
  (this supersedes `docs/SPEC-marketplace-ui.md` §5.2 — see the Supersedes field).
- **NG-2.** Any server-side or hosted search service (Algolia, Typesense, Meilisearch, a search
  proxy, an edge function). The site is a static GitHub Pages deployment.
- **NG-3.** Cross-session personalization, click-through learning, query logging, or any analytics
  that persists a user's queries.
- **NG-4.** Query-time LLM calls of any kind.
- **NG-5.** A redesign of the search UI (autocomplete dropdown, Cmd-K palette, result snippets with
  highlighting). Ranking quality only; the existing controls keep their shape. Auto-suggest is
  listed under Proposed improvements, not required here.
- **NG-6.** Changing the facet filters (type / plugin / tags) or the `Newest` / `A–Z` sorts.
- **NG-7.** **`keywords` do not replace, feed, or alter `tags`.** They are two different fields with
  two different jobs (see §4.2). Tag generation, the tag cap, the tag facet, the `?tag=` URL param
  and the tag chips on cards/modal are all out of scope and must come out of this change unchanged.
- **NG-8.** Generating keywords during the build, or in CI. Generation is an explicit, offline,
  human-initiated act (§4.2); the build only ever *reads* them.

## 4. Decisions

### 4.1 Search engine

**MiniSearch v7.2.0.** Stated as a decision, with the evidence from the pre-research:

| Criterion | MiniSearch 7.2.0 | Fuse.js 7.5.0 |
| --- | --- | --- |
| Ranking model | **BM25+** (`k=1.2, b=0.7, d=0.5`); Lucene-style `log(1 + …)` IDF guard, so the negative-IDF pathology does **not** occur at a ~29-doc corpus | **Bitap** approximate string match; score = fuzziness × key weight × field-length norm. **No document-frequency / IDF term at all** — not BM25, not TF-IDF |
| Size (gzipped) | **5,814 B** | 9,266 B (~60% larger) |
| Boolean | `combineWith: 'OR' \| 'AND' \| 'AND_NOT'` with BM25 ranking preserved | extended search gives AND/OR, but ranking is the fuzzy score |
| Prefix / fuzzy | `prefix: true`, edit-distance `fuzzy` | Bitap fuzziness |
| Field boosting | per-field `boost` | key weights |
| Stemming / stop-words | **not built in** — BYO via `processTerm` / `tokenize` hooks | none |
| Auto-suggest | `autoSuggest()` | none |
| Types | native TypeScript | — |

MiniSearch is smaller **and** is the only one of the two that actually does IR term ranking, which
is precisely what G2 requires. No repo constraint contradicts it: `site/package.json` depends
only on `react`, `react-dom`, `react-markdown`, `remark-gfm` — **Fuse.js is not already a
dependency**, and `docs/SPEC-marketplace-ui.md` §5.1/§6 already nominated MiniSearch.

**Known caveat, treated as a requirement, not a footnote:** open issue
[lucaong/minisearch#129] reports field-length normalization (`fieldLength / averageFieldLength`)
dominating IDF, letting a very short document outrank a longer, more relevant one. This bites here:
artifact `displayName`s are a few words while `body` is the entire `SKILL.md`. **Field-boost and
length-norm tuning is therefore an explicit, testable requirement of this spec** (AC-6, AC-7), proven
against the committed golden-query set (§4.4) — not left to "tune it later".

### 4.2 Keyword provenance and home

**Generated offline, once, by a human-initiated local run; committed to the repo.**

- An LLM produces the keywords in a **one-off local script the maintainer invokes by hand**. It is
  **not part of the build** and **not part of CI**.
- The output is **committed to the repository**, so it is human-reviewable in a normal PR diff and
  **hand-editable** afterwards. A maintainer may freely correct, add, or delete a keyword without
  re-running the generator.
- **`build-index.mjs` only ever *reads* the committed keywords. It never generates them.** No API
  key, no CI secret, no build-time network call; the build stays deterministic and offline.
- **Regeneration is a deliberate manual re-run**, not an automatic consequence of anything. The
  drift this permits is exactly what the staleness warning (§4.3, AC-20) exists to surface.

**Home: a sidecar file under `site/`** — e.g. `site/data/keywords.json`, a map keyed by
artifact `id`. **Not frontmatter.** This sidesteps the `fm.keywords` → `tagsFor()` collision
entirely (`build-index.mjs:80-91` reads `fm.tags || fm.keywords`, so a frontmatter key named
`keywords` would silently become an artifact's *tags*), and it keeps `plugins/**` — the shipped
product — untouched.

**`keywords` is a separate field from `tags`, with a different job:**

| | `tags` | `keywords` |
| --- | --- | --- |
| Count | few — capped at 4 (`build-index.mjs:89`) | many — ~10–20 per artifact |
| Visibility | **visible & clickable** | **invisible** |
| Surfaces | sidebar facet (`Filters.jsx:67`), URL param `?tag=`, card badge (`Card.jsx:14`), modal chips | none — never rendered, never a facet |
| Purpose | browsing / filtering | **ranking signal only** |
| This spec | **unchanged** (NG-7) | new |

### 4.3 Stale-keyword policy — warn, never fail

`build-index.mjs` hashes each artifact's source text and compares it to the hash the artifact's
keywords were generated against (stored alongside them in the sidecar). WHEN the hashes differ, the
build **emits a warning**. It **never fails the build and never blocks a release** — a stale keyword
set degrades ranking slightly; it must not stop a deploy. (AC-20.)

### 4.4 Golden-query set — a committed relevance regression suite

Boost and length-norm tuning has no meaning without a target. The golden set is **committed as a
relevance regression suite** and is the acceptance test for AC-7, AC-10 and AC-11.

Proposed default (a **starting point** the maintainer may revise or extend at will — the set is
explicitly extensible; new cases are added as new failures are found):

| # | Query | Expected | Why it is in the set |
| --- | --- | --- | --- |
| 1 | "how should I structure my React folders" | `frontend-ui-architecture` | **Sentence-shaped query** — the exact thing today's hard-AND matcher returns zero results for |
| 2 | "sql toolkit" | `drizzle-orm-patterns` | **Vocabulary-gap case** — passes *only* via a baked keyword; the phrase occurs nowhere in the artifact's own text |
| 3 | "fastfy" | `fastify-best-practices` | typo tolerance |
| 4 | "write requirements" | `requirements-engineering` | plain lexical match |
| 5 | "check my code before pushing" | `pr-self-review` | problem-phrasing → artifact name mismatch |

The set MUST always contain **at least one sentence-shaped query** and **at least one query that
passes only via a baked keyword**. Cases 1 and 2 satisfy that today.

### 4.5 Index construction — in the browser, not pre-serialized

The MiniSearch index is **built in the browser at startup from the already-bundled catalog**.
`MiniSearch.toJSON()` / `loadJSON()` pre-serialization is **rejected**. Rationale: 29 documents index
effectively instantaneously; `site/src/catalog.json` is already `import`ed and bundled by
`site/src/data.js`, so the source data is present at zero extra cost; and pre-serialization would
add a second payload *plus* a library-version lockstep burden (a serialized index must be rebuilt in
step with the MiniSearch version) for no measurable win at this scale.

---

## 5. User stories

- **US-1.** As a developer who knows the problem but not the artifact's name, I want to type a
  sentence ("how should I organize my Next.js folders") and get ranked matches, so that I don't
  have to guess the exact title.
  *(Independent · Valuable · Testable → AC-1, AC-2, AC-8)*
- **US-2.** As a developer who uses different vocabulary than the artifact's author, I want to find
  *Drizzle ORM Patterns* by typing "sql toolkit" or "database migrations", so that the catalog is
  findable in my words.
  *(→ AC-9, AC-10, AC-11)*
- **US-3.** As a fast typist, I want "fastfy" and "postgre" to still find the right artifact, so
  that a typo or a half-typed word doesn't dead-end me.
  *(→ AC-3, AC-4)*
- **US-4.** As a user who knows exactly what they want, I want an `Exact` mode that does literal
  matching with no fuzzy noise, so that precise queries stay precise.
  *(→ AC-12, AC-13)*
- **US-5.** As a maintainer, I want the search keyword vocabulary to be reviewable in a pull request,
  hand-editable, and to warn me when it has gone stale, so that the index does not silently rot.
  *(→ AC-19, AC-20, AC-27, AC-28)*

---

## 6. Acceptance criteria

Each is one testable statement. `Verify:` gives the proof method. *(There is no test runner in
`site/package.json` today — see Assumption A-5.)*

### Ranking engine (Smart mode)

- **AC-1.** WHEN the user submits a multi-word query in `Smart` mode and at least one artifact
  matches at least one query term, the system SHALL return a non-empty, ranked result list (OR
  semantics with ranking — never the current hard-AND empty set).
  *Verify: unit — query "how do I structure my React folders" returns ≥ 1 result.*
- **AC-2.** The system SHALL rank `Smart` results by a BM25-family score that incorporates term
  frequency, inverse document frequency, and field-length normalization over the 29-document
  corpus.
  *Verify: unit — a query term present in ≥ 20 of 29 documents SHALL contribute strictly less to
  the score than a term present in exactly 1 document.*
- **AC-3.** WHEN a query term is a prefix of an indexed term ("postgre", "refac"), the system SHALL
  match the artifact in `Smart` mode.
  *Verify: unit — "postgre" returns `postgresql-table-design` in the top 3.*
- **AC-4.** WHEN a query term is within the configured edit distance of an indexed term ("fastfy" →
  "fastify"), the system SHALL match the artifact in `Smart` mode.
  *Verify: unit — "fastfy best practices" returns `fastify-best-practices` as top-1.*
- **AC-5.** IF a query term matches an indexed term exactly, THEN that artifact SHALL NOT rank below
  an artifact that matches the same term only via fuzzy or prefix expansion, all else being equal.
  *Verify: unit — fixture with one exact and one edit-distance-1 match; assert the ordering.*
- **AC-6.** The system SHALL apply per-field boosts such that a query matching an artifact's
  `displayName` or `name` outranks an artifact matching the same term only in its `body`.
  *Verify: unit — "zod" returns the `zod` skill as top-1, above every skill whose body merely
  mentions Zod.*
- **AC-7.** IF field-length normalization would let a short-field artifact outrank a longer, more
  relevant one (issue lucaong/minisearch#129), THEN the field boosts and length-norm configuration
  SHALL be tuned so that every case in the committed golden-query set (§4.4) still passes.
  *Verify: unit — the golden-query regression suite; every case asserts an expected top-1 or top-3
  membership. This is the acceptance test for boost/length-norm tuning, not an afterthought.*
- **AC-8.** WHEN the query is empty, the system SHALL show all artifacts and SHALL fall back to
  `newest` ordering (unchanged from today's `search.js:52`).
  *Verify: unit.*

### Keyword enrichment (build time)

- **AC-9.** `site/scripts/build-index.mjs` SHALL read the committed keyword sidecar (§4.2) and
  emit a `keywords: string[]` field on every artifact in `site/src/catalog.json`, for all 29
  artifacts (no artifact left with an empty array).
  *Verify: unit — assert `catalog.artifacts.every(a => a.keywords.length > 0)`.*
- **AC-10.** The system SHALL index the `keywords` field in `Smart` mode with a boost between that
  of `tags` and `description`, so that a keyword hit is a strong but not overriding signal.
  *Verify: unit + the golden-query suite.*
- **AC-11.** WHEN the user queries a synonym or problem phrasing present in an artifact's
  `keywords` ("orm", "sql toolkit", "database migrations"), the system SHALL return that artifact
  in the top 3.
  *Verify: unit — each of the three phrasings returns `drizzle-orm-patterns` in the top 3.*
- **AC-12.** All `keywords` values SHALL be English (project convention: all marketplace + UI text
  is English; the keyword vocabulary inherits it).
  *Verify: manual review at PR time; the vocabulary is human-reviewable by AC-19.*
- **AC-13.** The `keywords` field SHALL NOT alter any artifact's visible `tags`, the tag facet, the
  `?tag=` URL param, the card badges, or the tag counts in the left filter panel (NG-7). Keywords
  SHALL NOT be rendered anywhere in the UI — they are an invisible ranking signal only.
  *Verify: unit — snapshot `ALL_TAGS`, `TYPE_COUNTS` and `PLUGIN_COUNTS` before/after; they are
  identical. Plus e2e — no keyword string appears in the rendered DOM. **Guaranteed structurally by
  the sidecar decision (§4.2):** because keywords never enter frontmatter, `tagsFor()`'s
  `fm.tags || fm.keywords` fallback can never see them.*

### Search modes and sort (UI contract)

**One engine, one code path.** Both modes are MiniSearch queries differing only in options; the old
`indexOf` substring matcher in `site/src/lib/search.js` is **deleted**.

- **AC-14.** WHERE the mode is the default, typo-tolerant one (labelled `Fuzzy` — AC-17; `mode`
  value unchanged internally), the system SHALL query MiniSearch with `combineWith: 'OR'`, prefix
  matching on, fuzzy matching on, and the `keywords` field indexed — ranked by BM25.
  *Verify: unit + manual.*
- **AC-15.** WHERE the mode is `Exact`, the system SHALL query MiniSearch with
  `combineWith: 'AND'`, **no fuzzy**, **no prefix expansion**, and **without searching the
  `keywords` field** — still ranked by BM25.
  *Verify: unit — in `Exact` mode: "fastfy" returns 0 results; "fastify" returns the skill; a query
  that matches only via a baked keyword ("sql toolkit") returns 0 results; results are BM25-ordered,
  not additively scored.*
- **AC-16.** WHEN `Sort: Relevance` is selected with a non-empty query, the system SHALL order
  results by the engine's BM25 score descending — **in both modes** — tie-breaking on recency
  (`days` ascending) as today.
  *Verify: unit.*
- **AC-17.** The search-mode labels and copy in `site/src/strings.js` SHALL describe what actually
  happens — typo-tolerant + ranked versus literal + ranked (e.g. `Fuzzy` / `Exact`) — and the word
  **"semantic" SHALL NOT appear anywhere in the search UI copy** (nothing semantic exists or ever
  shipped; NG-1 rejects it outright). All such copy SHALL be English and SHALL live in
  `site/src/strings.js`, not hardcoded in a component.
  *Verify: unit — assert `/semantic/i` does not match any string under `t.search`; plus manual copy
  review. Today's offending string: `"Smart = semantic ranking · Exact = keyword only"`.*
- **AC-18.** The system SHALL preserve the existing URL-hash contract (`#q=…&mode=…&sort=…`),
  including the `mode=exact` value, so that existing shared links keep working. Renaming the *labels*
  (AC-17) SHALL NOT change the URL param values.
  *Verify: unit — `parseHash` / `writeHash` round-trip; an old `#q=zod&mode=exact` link still opens in
  the literal mode.*

### Keyword governance

- **AC-19.** The `keywords` vocabulary SHALL live in a **single committed sidecar file under
  `site/`**, keyed by artifact `id`, reviewable as a normal diff in a pull request and editable by
  hand without re-running any generator.
  *Verify: manual — `git ls-files` shows the sidecar; a PR diff shows keyword changes; a hand-edited
  keyword survives `npm run index`.*
- **AC-20.** IF an artifact's source text changes without a corresponding keyword update (its stored
  content hash no longer matches), THEN `build-index.mjs` SHALL emit a **build warning** naming the
  drifted artifact, and SHALL **still complete successfully** — a stale keyword set SHALL NEVER fail
  the build or block a release.
  *Verify: integration — mutate a fixture artifact's description, run the indexer; assert (a) a
  warning naming that artifact is emitted, and (b) the process exit code is 0 and `catalog.json` is
  written.*

### Non-functional

- **AC-21.** The production bundle SHALL grow by **no more than 12 KB gzipped** in total (engine +
  keyword data + glue) versus the current `main` build. MiniSearch v7.2.0 is 5,814 B gzipped, so this
  leaves generous headroom; the budget is a hard ceiling, not a target.
  *Verify: integration — compare the gzipped bundle size before/after in CI; fail if the delta
  exceeds 12,288 B.*
- **AC-22.** WHILE the user is typing, the system SHALL return updated results within **100 ms** of
  the last keystroke on a mid-range laptop, for the 29-document corpus.
  *Verify: integration — timed benchmark over the golden-query set.*
- **AC-23.** The system SHALL make **zero network requests at query time**.
  *Verify: e2e — record the network panel while typing; assert no request is issued.*
- **AC-24.** The user's query string SHALL be treated as untrusted data: it SHALL NOT be interpreted
  as markup, HTML, or a regular expression, and SHALL NOT be persisted anywhere except the URL hash
  (as today).
  *Verify: unit — query `<img src=x onerror=alert(1)>` and `a.*(b|c)+` produce no error and no DOM
  injection.*
- **AC-25.** IF the search engine fails to initialize for any reason, THEN the system SHALL degrade
  to showing the full, unfiltered artifact list with the facet filters still working, rather than an
  empty page or a crash.
  *Verify: unit — force an engine-construction throw; assert results.length === 29 and no unhandled
  error.*
  *(The catalog is `import`ed at build time in `site/src/data.js`, so it is **bundled**, not
  fetched, and per §4.5 the index is built in the browser from it — there is no runtime
  "index failed to load" path at all. This AC therefore covers **engine initialization**, which is the
  only remaining failure mode.)*
- **AC-26.** The search input SHALL retain its current accessible name (`aria-label`) and keyboard
  behaviour; no new control introduced by this change SHALL be reachable only by mouse.
  *Verify: manual — keyboard walkthrough.*

### Provenance, regression suite, index construction

- **AC-27.** `site/scripts/build-index.mjs` SHALL NOT generate keywords, SHALL NOT call any LLM,
  and SHALL NOT make any network request. Keyword generation SHALL be a separate, human-invoked local
  script that is not run by `npm run index`, `npm run build`, `predev`, `prebuild`, or any CI
  workflow.
  *Verify: integration — run the full build with the network disabled and no API key present; it
  completes and produces an identical `catalog.json` on a second run (deterministic). Plus manual —
  no CI workflow references a generation script or a secret.*
- **AC-28.** The golden-query set (§4.4) SHALL be committed to the repository as a relevance
  regression suite that runs on every CI build, and SHALL contain at least one sentence-shaped query
  and at least one query that passes **only** via a baked keyword.
  *Verify: unit — the suite runs and passes in CI; assert its cases include both required kinds.*
- **AC-29.** The system SHALL build the MiniSearch index in the browser from the bundled catalog.
  It SHALL NOT ship a pre-serialized index (`MiniSearch.toJSON()`), and the build SHALL NOT emit one.
  *Verify: integration — no serialized-index asset exists in `site/dist`; unit — the engine is
  constructed from the catalog at runtime.*
- **AC-30.** WHEN the app starts, index construction for the 29-document corpus SHALL complete within
  **50 ms** on a mid-range laptop and SHALL NOT block first paint.
  *Verify: integration — timed benchmark of index construction; e2e — first paint precedes the first
  query being answerable.*

---

## 7. Edge cases

- **E-1.** Empty query, whitespace-only query, single-character query. (Single-char + `prefix: true`
  can match nearly everything — decide whether prefix matching applies below a minimum term length.)
- **E-2.** Query that is entirely stop-words ("how do I", "the a of"). MiniSearch ships **no**
  stop-word list; a stop-word-only query must not return a meaningless ranked list of all 29 items
  in arbitrary order.
- **E-3.** Query with punctuation / slashes (`/version-check`, `next.js`, `c++`). Commands are named
  with a leading `/` (`build-index.mjs` prefixes them). Tokenization must not make `/version-check`
  unfindable.
- **E-4.** Query matching zero artifacts even after OR + fuzzy → the existing "No matches" empty
  state must still render.
- **E-5.** A query term that appears in *every* document (e.g. "skill", "claude"). With the
  Lucene-style `log(1 + …)` IDF guard the score is small but non-negative; ranking must not become
  arbitrary.
- **E-6.** Facet filters + query combined: filters must still apply, and relevance ranking must be
  computed over the filtered set (or the ranking must be stable when a filter is toggled).
- **E-7.** Very long query (a pasted paragraph). Must not blow the latency budget (AC-22).
- **E-8.** Mixed case and Unicode in the query.
- **E-9.** An artifact whose `body` is empty (a command with no content) — must not divide by zero
  in the length norm nor be dropped from the index.
- **E-10.** `keywords` that duplicate an existing `tag` or the `displayName` — must not double-count
  into an artificial score boost.

---

## 8. Assumptions & dependencies

- **A-1.** The corpus stays small (tens, not thousands). Everything here — in-browser indexing,
  no pagination of the index, no pre-serialization — is scoped to that. (Not verifiable: no
  published benchmark at exactly ~29 docs; at this scale in-browser indexing is expected to be
  effectively instant.)
- **A-2.** `site/src/catalog.json` is **gitignored** (`site/.gitignore:7 → src/catalog.json`)
  and regenerated on every build by the `predev` / `prebuild` npm scripts. It is therefore **not** a
  place keywords can be authored — they must come from a committed source that `build-index.mjs`
  reads (AC-19).
- **A-3.** `site/src/data.js` does `import catalog from "./catalog.json"` — the catalog is bundled
  into the JS bundle at build time. There is **no runtime fetch** of the index (contrast with
  `docs/SPEC-marketplace-ui.md` §3, which assumed a fetched `index.json`).
- **A-4.** CI (`.github/workflows/pages.yml`, `site-build.yml`) runs `npm ci && npm run build`
  with `permissions: contents: read` and **no repository secrets configured**. The build is
  deterministic and offline, and §4.2 keeps it that way: no secret is added, no network step is
  introduced, and no LLM is invoked by any build or CI path (AC-27).
- **A-5.** `site/package.json` has **no `test` script and no test runner**. Every `Verify: unit`
  hint above presumes one is introduced by the implementation plan; choosing it is a HOW decision.
- **A-6.** MiniSearch ships no stemmer and no stop-word list; word-form variation (G3) requires a
  `processTerm` / `tokenize` hook. This is a stated dependency, not an optional extra.
- **A-7.** Project convention: **all marketplace + UI text is English**, enforced by convention, no
  CI check. Keywords inherit this (AC-12).

---

## 9. Inputs and provenance

| Input | Provenance |
| --- | --- |
| Current matcher behaviour | `site/src/lib/search.js`, `site/src/data.js` (read) |
| Index generation | `site/scripts/build-index.mjs` (read) |
| Corpus size (29 = 4 plugins + 18 skills + 6 agents + 1 command) | counted from `plugins/**` |
| Catalog is gitignored / bundled | `site/.gitignore`, `site/src/data.js` |
| CI has no secrets | `.github/workflows/pages.yml`, `.github/workflows/site-build.yml` |
| `Smart`/`Exact` + `Sort: Relevance` wiring | `site/src/components/SearchBar.jsx`, `site/src/App.jsx`, `site/src/strings.js` |
| MiniSearch 7.2.0 / Fuse.js 7.5.0 comparison, sizes, BM25+ params, issue #129 | pre-verified research supplied with the brief (primary sources) |
| Prior intent for search | `docs/SPEC-marketplace-ui.md` §5, §6 |

## 10. Untrusted inputs

- **The user's query string** is the only untrusted input at runtime. It is data, never markup, never
  a regular expression, never an instruction (AC-24). It reaches the URL hash today; that stays.
- **Artifact `body`/`description` text** comes from the repository (trusted authors) but is rendered
  as markdown; nothing in this change adds a new rendering path for it.
- **LLM-generated keywords** are model output that lands in a **committed** file (§4.2). They are
  data, not instructions: plain English strings, never executable, never interpreted as instructions
  by any later step. Because they are committed and reviewed in a PR before they ever reach a build
  (AC-19), a human is always in the loop between the model and the shipped site.

## 11. Cross-module impact

- **`site/src/lib/search.js`** — rewritten as the engine adapter. The `score()` and
  `matchesQuery()` `indexOf` matcher is **deleted**; both modes become MiniSearch queries (AC-14,
  AC-15).
- **`site/src/data.js`** — the `haystack` field exists solely for the old substring matcher; it
  becomes dead weight once MiniSearch indexes fields directly (PI-2).
- **`site/scripts/build-index.mjs`** — reads the keyword sidecar, emits the `keywords` field, and
  emits the staleness warning (AC-9, AC-20, AC-27). **Collision avoided by design:** `tagsFor()`
  reads `fm.tags || fm.keywords`, so a frontmatter key named `keywords` would silently become an
  artifact's *tags*. The sidecar decision (§4.2) means keywords never touch frontmatter, so this path
  can never fire.
- **New: `site/data/keywords.json`** (or equivalent sidecar) — committed, hand-editable.
- **New: a local, human-invoked keyword generation script** — not wired into any npm lifecycle hook
  or CI workflow (AC-27).
- **New: the committed golden-query regression suite** (§4.4, AC-28).
- **`site/src/strings.js`** — mode labels and copy renamed; "semantic" removed (AC-17).
- **`plugins/**`** — **untouched.** The sidecar decision keeps the shipped plugins out of the blast
  radius entirely.
- **`docs/SPEC-marketplace-ui.md`** — §5.2/§5.3 and the embeddings row of §6 are **superseded by this
  spec** (see the Supersedes field). The document stays as history; a pointer to SPEC-01 is added.
- **CI** — `site-build.yml` / `pages.yml` gain the golden-query suite (AC-28) and the bundle-size
  check (AC-21). They gain **no secret and no network step** (AC-27).

---

## 12. Proposed improvements

Surfaced by the completeness pass; still optional, offered for the owner to accept or reject:

- **PI-1.** Use MiniSearch's `autoSuggest()` for a query-completion dropdown. It comes free with the
  engine and is the single biggest perceived-smartness win after ranking. (Currently NG-5.)
- **PI-2.** Delete the now-dead `haystack` field from `site/src/data.js` once the engine indexes
  fields directly — otherwise the whole lowercased blob ships in the bundle for nothing. (Also helps
  AC-21.)
- **PI-3.** Show *why* an artifact matched (e.g. "matched: orm, migrations") when the hit came from
  `keywords` rather than visible text — otherwise a top result can look inexplicable to the user.
  Note this is in tension with AC-13 (keywords are invisible) and would need an explicit exception.
- **PI-5.** Give the empty state a "did you mean" using the fuzzy engine, instead of the current
  static hint.

*Promoted into the spec proper and no longer optional:* **PI-4** (golden-query regression suite →
§4.4, AC-28) and **PI-6** (honest mode names → AC-17).

---

## 13. Resolution log

All eight `[NEEDS CLARIFICATION]` markers raised in the draft were answered by the owner on
2026-07-14 and folded in. No open questions remain.

| Was | Answer | Landed in |
| --- | --- | --- |
| NC-1 Keyword provenance | Offline, once, by a human-invoked **local** script; committed; never in the build or CI | §4.2, NG-8, AC-9, AC-19, AC-27, A-4 |
| NC-2 Keyword home & visibility | **Sidecar** under `site/`, keyed by artifact `id`; **invisible**, ranking-only; separate from `tags` | §4.2, NG-7, AC-13, AC-19 |
| NC-3 Stale-keyword policy | **Warn, never fail** (content-hash drift) | §4.3, AC-20 |
| NC-4 `Exact` contract | Stricter MiniSearch mode: `combineWith: 'AND'`, no fuzzy, no prefix, no `keywords`; still BM25-ranked. Old `indexOf` matcher **deleted** | AC-14, AC-15, AC-16 |
| NC-5 Golden-query set | The 5-case seed, committed as a regression suite; extensible; must keep ≥1 sentence query and ≥1 keyword-only query | §4.4, AC-7, AC-28 |
| NC-6 Index construction | **In the browser**, no `toJSON()` pre-serialization | §4.5, AC-25, AC-29, AC-30 |
| NC-7 Bundle budget | **≤ 12 KB gzipped** added weight | AC-21 |
| NC-8 Old spec | `docs/SPEC-marketplace-ui.md` §5–§6 (embeddings + RRF) **superseded in part**; document kept as history | Supersedes field, §11 |
