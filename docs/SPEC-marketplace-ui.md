# Spec: Marketplace UI on GitHub Pages

A web app for searching and browsing the `my-monkeys` plugin marketplace artifacts
(skills, commands, agents, plugins). Hosted on GitHub Pages — **no runtime backend**.

- **Status:** Draft v1 (MVP) — **the embeddings/semantic design is SUPERSEDED** (see below)
- **Owner:** RostK
- **Date:** 2026-07-13

> [!IMPORTANT]
> **The search design in this document is superseded by
> [SPEC-01 — Lexical search engine + build-time keyword enrichment](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md)
> (2026-07-14).** Where the two conflict, **SPEC-01 wins.**
>
> **Everything describing embeddings / vector search / semantic ranking is no longer the plan.**
> SPEC-01 NG-1 rejects embeddings, vector search, semantic re-ranking and on-device transformer
> models outright. Affected, each marked inline below:
>
> | Section | Fate |
> |---|---|
> | §1 scope & constraints (the "semantic +" half) | superseded |
> | §2 architecture diagram (embed step, `embeddings.json` fetch) | superseded |
> | §3.2 `embeddings.json` | superseded — replaced by a committed `keywords` sidecar |
> | §4 step 3 (`embed.mjs`) + embedding cache | superseded — the build makes **no** network call |
> | §5.1 keyword search (MiniSearch) | ✅ **survives** — confirmed on evidence |
> | §5.2 Semantic · §5.3 Fusion (RRF) | superseded — one lexical ranking, nothing to fuse |
> | §6 embeddings row | superseded |
> | §8 performance (model download, lazy fetch) | superseded — new budgets in SPEC-01 |
> | §10 milestone M3 | superseded |
> | §11 open questions 1–2 | closed |
>
> **What genuinely still stands:** §1 goals, §3.1 `index.json`, §5.1, the rest of §6, §7 UI/UX,
> §9 testing, milestones M0–M2 and M4.
>
> *Why:* at a 29-artifact corpus, BM25 ranking plus LLM-generated keywords baked into the index at
> build time achieves substantially the same perceived quality for a fraction of the cost and
> complexity — no model download, no vector payload, no build-time key.
>
> This document is **kept as history** — not rewritten or deleted.

---

## 1. Goals & scope

### In scope (MVP)
1. **Search across all repository content** — ~~semantic +~~ keyword. The user types a
   natural-language query ("I need a skill for refactoring") and gets relevant artifacts.
   > **The *goal* stands; the mechanism changed.** Natural-language queries are served by
   > **BM25 lexical ranking + baked keywords**, not semantics
   > ([SPEC-01](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md) §4, NG-1).
2. **Result cards** — type, name, plugin, description, tags, updated date.
3. **Install button** on the card — copies `claude plugin install <name>@my-monkeys`.
4. **Artifact detail view** — full render of `SKILL.md` / README with code highlighting.
5. **Faceted filters** — by type (skill/command/agent/plugin), plugin, tags;
   sorting (relevance / newest / A–Z).

### Out of scope for MVP (later iterations)
Live data from GitHub API, favorites/collections, relationship graph, feedback via
Issues, Cmd-K palette, dark-mode toggle (dark theme is the default).

### Constraints
- GitHub Pages = **static hosting**, no server-side code at runtime.
- All logic (indexing, ~~embeddings~~) runs **at build time** in GitHub Actions.
  > **⛔ Amended by [SPEC-01](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md)
  > (NG-8, AC-27):** no embedding step exists, and the build performs **no network call and uses no
  > API key** — CI runs `permissions: contents: read` with no secrets. Keyword generation happens
  > *offline*, by hand, outside the build entirely.
- ~~The client only loads static assets (`index.json`, `embeddings.json`, the SPA bundle).~~
  > **⛔ Reality diverged:** there is no `embeddings.json`, and the catalog is **not fetched** — it is
  > `import`ed and **bundled into the SPA** (`site/src/data.js`). The client loads the bundle and
  > nothing else.
- **English-only content.** All marketplace-facing text — UI labels, buttons, toasts,
  empty/error states, plus every artifact `name`, `displayName`, `description`, and
  `tags` surfaced from the repository — must be in English. Kept as a convention, no
  automated CI check.

---

## 2. Architecture

> **⛔ The diagram's embedding step (CI step 5) and the client's `embeddings.json` fetch are
> SUPERSEDED** by [SPEC-01](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md)
> (NG-1). What actually ships: CI emits **one** artifact (`src/catalog.json`, gitignored), which is
> **bundled into the SPA** rather than fetched, and the browser builds a MiniSearch BM25 index from
> it at startup (§4.5). The **"Key idea" below survives** — the smart work still happens once, at
> build time; it is simply keyword generation instead of embedding.

```
┌─────────────────── GitHub Actions (CI, "build-time backend") ──────────────────┐
│  push → build-index.mjs                                                          │
│    1. walk plugins/** and .claude-plugin/marketplace.json                        │
│    2. parse plugin.json, YAML frontmatter of SKILL.md, commands/*.md, agents/*.md│
│    3. read git last-modified date of each file                                   │
│    4. emit public/index.json                                                     │
│    5. embed.mjs → emit public/embeddings.json (vectors for semantic search)      │
│  → vite build → deploy to gh-pages                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │  static files
                                     ▼
┌──────────────────────── GitHub Pages (static SPA) ─────────────────────────────┐
│  React + Vite + Tailwind                                                         │
│  fetch index.json + embeddings.json → search/filter/cards/detail in the browser  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key idea:** the "smart backend" runs once on CI. The site stays 100% static yet
gets semantic search thanks to precomputed embeddings.

---

## 3. Data model

### 3.1 `index.json`
A flat array of all artifacts. Generated on CI.

```jsonc
{
  "generatedAt": "2026-07-13T09:58:00Z",   // ISO, injected in CI
  "marketplace": "my-monkeys",
  "stats": { "plugins": 0, "skills": 0, "commands": 0, "agents": 0 },
  "artifacts": [
    {
      "id": "example-plugin/skills/refactor",   // unique, stable
      "type": "skill",                          // skill | command | agent | plugin
      "name": "refactor",                       // artifact slug
      "displayName": "Refactor",                // from frontmatter, fallback = name
      "plugin": "example-plugin",               // owning plugin
      "description": "Short description…",       // from frontmatter/plugin.json
      "tags": ["refactoring", "cleanup"],       // if present in frontmatter
      "path": "plugins/example-plugin/skills/refactor/SKILL.md",
      "githubUrl": "https://github.com/<owner>/my-monkeys/blob/main/…",
      "updatedAt": "2026-07-10T12:00:00Z",      // git last-commit date of the file
      "installName": "example-plugin",          // for the install command
      "body": "…full markdown content…"         // for detail render + indexing
    }
  ]
}
```

**Field sources by type:**
| type    | source file                          | name         | description         |
|---------|--------------------------------------|--------------|---------------------|
| plugin  | `plugin.json`                        | `name`       | `description`       |
| skill   | `skills/<s>/SKILL.md` frontmatter    | dir name     | `description`       |
| command | `commands/<c>.md` frontmatter        | file name    | `description`/1st ¶ |
| agent   | `agents/<a>.md` frontmatter          | file name    | `description`       |

### 3.2 `embeddings.json`

> **⛔ SUPERSEDED by [SPEC-01](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md) (NG-1).**
> No embeddings file is produced or shipped. The ranking signal that replaces it is a committed
> `keywords` sidecar (SPEC-01 §4.2) — plain-English synonyms, a couple of KB, no vectors.
> Retained below as history only.

A parallel set of vectors keyed by the `id` from `index.json`.

```jsonc
{
  "model": "text-embedding-3-small",  // or a local model on CI
  "dim": 1536,
  "vectors": {
    "example-plugin/skills/refactor": [0.012, -0.034, …]  // normalized
  }
}
```

> Vectors are normalized at generation → a dot product suffices in the browser.
> To cut weight, they can be quantized to int8 (iteration 2).

---

## 4. Build pipeline (GitHub Actions)

`.github/workflows/deploy.yml` — trigger: push to `main`, changes in `plugins/**` or the UI.

Steps:
1. `checkout` with `fetch-depth: 0` (git history needed for dates).
2. `node scripts/build-index.mjs` → `apps/web/public/index.json`.
3. ~~`node scripts/embed.mjs` → `apps/web/public/embeddings.json`~~
   **⛔ SUPERSEDED by [SPEC-01](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md)
   (NG-8, AC-27).** There is **no embedding step**, and the build makes **no network call and uses no
   API key** — CI runs with `permissions: contents: read` and no secrets. Keywords are generated
   *offline* by a human-invoked local script and committed; the build only ever *reads* them.
4. `npm --prefix apps/web ci && npm --prefix apps/web run build`.
5. Deploy `apps/web/dist` to GitHub Pages (`actions/deploy-pages`).

~~**Embedding cache:** store `content-hash → vector`; recompute only changed artifacts.~~
**⛔ Superseded.** SPEC-01 §4.3 keeps a content hash, but for a different purpose: to *warn* when an
artifact's text has drifted from the keywords generated against it. It never fails the build.

---

## 5. Search

> [!WARNING]
> **This section is the one most affected by
> [SPEC-01](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md).**
> §5.1 survives (MiniSearch was the right call). **§5.2 and §5.3 do not.** Search is **purely
> lexical** — there is no second (semantic) list, so there is nothing to fuse. Read SPEC-01 §4
> for the design that actually ships.

Hybrid, fully client-side. *(No longer hybrid — see the warning above.)*

### 5.1 Keyword (fuzzy)

> ✅ **Still current.** SPEC-01 §4.1 confirms **MiniSearch** on evidence: it is the only candidate
> that does real BM25+ term ranking (Fuse.js has no document-frequency term at all — it is a Bitap
> string matcher), and it is the smaller bundle at 5,814 B gzipped. Field boosts are as sketched
> here, but SPEC-01 adds a `keywords` field and makes boost/length-norm tuning a *testable*
> requirement (AC-6, AC-7) against a committed golden-query set, because of the known
> field-length-norm issue `lucaong/minisearch#129`.

- Library: **MiniSearch** (lightweight, prefix/typo support, BM25-like ranking).
- Indexed fields: `displayName^3`, `tags^2`, `description^2`, `body^1`.
- Instant results as you type (debounce ~120 ms).

### 5.2 Semantic

> **⛔ SUPERSEDED by [SPEC-01](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md)
> (NG-1).** No on-device transformer, no `@xenova/transformers`, no query embedding, no model
> download. At 29 artifacts the *only* thing embeddings would really buy is closing the vocabulary
> gap — and SPEC-01 closes that far more cheaply by baking LLM-generated synonyms into the index at
> build time (§4.2). Retained below as history only.

- The query embedding is computed **in the browser** by a local model
  (`@xenova/transformers`, MiniLM) — so no key is kept on the client.
- Cosine (= dot, since normalized) between the query vector and `embeddings.json`.
- The query-embedding model **must match** the one used on CI. If CI uses OpenAI
  and the browser uses MiniLM, the vectors are incompatible. So by default:
  **MiniLM on both sides** (no keys, free). OpenAI is an optional branch, but then
  the query would also need a proxy/edge function — that is a backend, so not in MVP.

### 5.3 Fusion

> **⛔ SUPERSEDED by [SPEC-01](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md)
> (NG-1, AC-14–AC-17).** With no semantic list there is no second ranking to fuse, so **Reciprocal
> Rank Fusion does not apply.** Both modes are MiniSearch queries over one BM25 ranking, differing
> only in options:
> - **Fuzzy** (default) — `combineWith: 'OR'`, prefix + fuzzy on, searches `keywords`.
> - **Exact** — `combineWith: 'AND'`, no fuzzy, no prefix, does **not** search `keywords`.
>
> ⚠️ **The "Smart / Exact" toggle named below was never semantic.** The shipped code only ever varied
> *which fields were scanned*, while `site/src/strings.js` advertised
> `"Smart = semantic ranking · Exact = keyword only"`. SPEC-01 AC-17 requires that copy be renamed
> honestly and forbids the word "semantic" anywhere in the search UI. The empty-query →
> sort-by-recency behaviour below **does** survive (SPEC-01 AC-8).

- Reciprocal Rank Fusion: `score = Σ 1/(k + rank_i)`, `k≈60`, over the two lists.
- UI toggle: "Smart / Exact" (semantic ↔ keyword-only).
- Empty query → show all, sorted by `updatedAt`.

---

## 6. Stack & dependencies

| Layer          | Choice                                  |
|----------------|-----------------------------------------|
| UI             | **React 18 + Vite + Tailwind CSS**      |
| Routing        | hash routing (`#/artifact/<id>`) for GH Pages |
| Search (keyword)| MiniSearch — ✅ still current (SPEC-01 §4.1) |
| ~~Embeddings~~ | ~~`@xenova/transformers` (MiniLM, on-device)~~ — **⛔ SUPERSEDED (SPEC-01 NG-1): no embeddings dependency. Replaced by a committed `keywords` sidecar.** |
| Markdown       | `react-markdown` + `remark-gfm` + `rehype-highlight` |
| Icons          | lucide-react                            |
| CI             | GitHub Actions + `actions/deploy-pages` |

Directory layout:
```
my-monkeys/
├── apps/web/            # React+Vite SPA
│   ├── public/          # index.json, embeddings.json (CI-generated, gitignored)
│   └── src/
├── scripts/
│   ├── build-index.mjs
│   └── embed.mjs
└── .github/workflows/deploy.yml
```

---

## 7. UI / UX

### 7.1 Screens
1. **Home / Search** — large input at the top, a "Smart/Exact" toggle, a filter panel
   on the left, a card grid on the right. Counters in the header.
2. **Detail** (`#/artifact/<id>`) — modal or a route: title, type badge, plugin, tags,
   install button, "Open on GitHub" button, rendered body.

### 7.2 Artifact card
```
┌──────────────────────────────────┐
│ [🧠 skill]            refactoring │  ← type badge + first tag
│ Refactor                          │  ← displayName
│ Short description of what it does │  ← 2 lines, truncated
│ example-plugin · updated 3d ago   │  ← plugin + relative date
│ [ Install ▾ ]      [ Details → ]  │  ← install copies the command
└──────────────────────────────────┘
```
- Clicking the card (not the buttons) → detail view.
- "Install" copies `claude plugin install <installName>@my-monkeys` + a "Copied" toast.

### 7.3 Filters
- Type: checkboxes (skill/command/agent/plugin) with counts.
- Plugin: list with counts.
- Tags: clickable chips (union).
- Sort: relevance (default with a query) / newest / A–Z.
- Filter + query state → in the URL (share-friendly hash query).

### 7.4 States
- Empty (no query) → all artifacts, sorted by date.
- No results → hint + "Reset filters" button.
- Loading → card skeletons while fetching index.json / the model.

### 7.5 Accessibility & theme
- Keyboard navigation, `aria-*` on input/cards/modal, focus-trap in the modal.
- Dark theme by default; respect `prefers-color-scheme`.

---

## 8. Performance

> **⛔ The first two bullets are SUPERSEDED by
> [SPEC-01](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md).** There is **no
> 25–90 MB model download**, no Web Worker for it, and no "progressive upgrade to semantic" — that
> was the single largest cost of the embeddings design and it is gone. Nor is anything *fetched*:
> the catalog is `import`ed and **bundled** into the JS. SPEC-01's budgets instead: **≤ 12 KB gzipped**
> added weight total (AC-21), **≤ 100 ms** as-you-type latency (AC-22), **≤ 50 ms** index construction,
> non-blocking (AC-30), and **zero network requests at query time** (AC-23).

- ~~`index.json` lazy-fetched on start; `embeddings.json` after (does not block keyword search).~~
- ~~The embedding model (MiniLM ~25–90 MB) loads in a Web Worker, cached in Cache Storage;
  keyword search is available until it is ready (progressive upgrade to semantic).~~
- Target: first interactive < 2 s on an index up to ~500 artifacts without embeddings. *(Still a
  reasonable bar; the live corpus is 29.)*

---

## 9. Testing & quality
- Cover `build-index.mjs` with unit tests for frontmatter parsing of each type.
- Snapshot the `index.json` schema (field validation, `id` uniqueness).
- E2E (Playwright): search → card → install-copy → detail.
- CI lint + typecheck before deploy.

---

## 10. Milestones

| # | Scope                                                       | Outcome |
|---|-------------------------------------------------------------|---------|
| M0| `build-index.mjs` + `index.json` schema + CI generation     | index builds on push |
| M1| SPA scaffold, fetch index, card grid, keyword search        | keyword search + cards work |
| M2| Install button, markdown detail, faceted filters, URL state | full browse/filter |
| ~~M3~~| ~~`embed.mjs` + on-device MiniLM + RRF fusion + toggle~~ — **⛔ SUPERSEDED.** Replaced by [SPEC-01](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md): MiniSearch BM25 + a committed `keywords` sidecar | ~~semantic search~~ → ranked lexical search |
| M4| Performance, a11y, E2E, deploy to Pages                     | public MVP |

---

## 11. Open questions

> **Q1 and Q2 are CLOSED by
> [SPEC-01](../specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md).**

1. ~~Embedding model: MiniLM on-device vs OpenAI. **MVP decision: MiniLM.**~~
   **⛔ Moot — there is no embedding model** (SPEC-01 NG-1). The question that replaced it —
   *how are keywords generated?* — is answered in SPEC-01 §4.2: **offline, once, by a human-invoked
   local script; committed to the repo; never run in the build or CI** (CI has no secrets).
2. ~~`index.json`/`embeddings.json` — commit or generate only in CI?~~
   **✅ Answered, and reality diverged:** the catalog is generated in CI **and gitignored**
   (`site/.gitignore` → `src/catalog.json`), but it is **`import`ed and bundled**, not fetched.
   Consequently it is *not* a place data can be authored — which is exactly why SPEC-01 puts keywords
   in a **committed sidecar** (§4.2, AC-19) rather than in the catalog.
3. Single plugin vs a monorepo of several — the `id` scheme already supports it; confirm.
   *(Still open. Live corpus: 4 plugins, 29 artifacts.)*
