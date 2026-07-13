# Spec: Marketplace UI on GitHub Pages

A web app for searching and browsing the `my-monkeys` plugin marketplace artifacts
(skills, commands, agents, plugins). Hosted on GitHub Pages — **no runtime backend**.

- **Status:** Draft v1 (MVP)
- **Owner:** RostK
- **Date:** 2026-07-13

---

## 1. Goals & scope

### In scope (MVP)
1. **Search across all repository content** — semantic + keyword. The user types a
   natural-language query ("I need a skill for refactoring") and gets relevant artifacts.
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
- All logic (indexing, embeddings) runs **at build time** in GitHub Actions.
- The client only loads static assets (`index.json`, `embeddings.json`, the SPA bundle).
- **English-only content.** All marketplace-facing text — UI labels, buttons, toasts,
  empty/error states, plus every artifact `name`, `displayName`, `description`, and
  `tags` surfaced from the repository — must be in English. Kept as a convention, no
  automated CI check.

---

## 2. Architecture

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
3. `node scripts/embed.mjs` → `apps/web/public/embeddings.json`
   (secret `OPENAI_API_KEY` **or** local `@xenova/transformers` with no key —
   see §6, decided at implementation time; cache embeddings by hash of `body`
   so unchanged artifacts are not recomputed).
4. `npm --prefix apps/web ci && npm --prefix apps/web run build`.
5. Deploy `apps/web/dist` to GitHub Pages (`actions/deploy-pages`).

**Embedding cache:** store `content-hash → vector` (e.g. from the previous build's
`embeddings.json` via `actions/cache`); recompute only changed artifacts.

---

## 5. Search

Hybrid, fully client-side.

### 5.1 Keyword (fuzzy)
- Library: **MiniSearch** (lightweight, prefix/typo support, BM25-like ranking).
- Indexed fields: `displayName^3`, `tags^2`, `description^2`, `body^1`.
- Instant results as you type (debounce ~120 ms).

### 5.2 Semantic
- The query embedding is computed **in the browser** by a local model
  (`@xenova/transformers`, MiniLM) — so no key is kept on the client.
- Cosine (= dot, since normalized) between the query vector and `embeddings.json`.
- The query-embedding model **must match** the one used on CI. If CI uses OpenAI
  and the browser uses MiniLM, the vectors are incompatible. So by default:
  **MiniLM on both sides** (no keys, free). OpenAI is an optional branch, but then
  the query would also need a proxy/edge function — that is a backend, so not in MVP.

### 5.3 Fusion
- Reciprocal Rank Fusion: `score = Σ 1/(k + rank_i)`, `k≈60`, over the two lists.
- UI toggle: "Smart / Exact" (semantic ↔ keyword-only).
- Empty query → show all, sorted by `updatedAt`.

---

## 6. Stack & dependencies

| Layer          | Choice                                  |
|----------------|-----------------------------------------|
| UI             | **React 18 + Vite + Tailwind CSS**      |
| Routing        | hash routing (`#/artifact/<id>`) for GH Pages |
| Search (keyword)| MiniSearch                             |
| Embeddings     | `@xenova/transformers` (MiniLM, on-device) |
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
- `index.json` lazy-fetched on start; `embeddings.json` after (does not block keyword search).
- The embedding model (MiniLM ~25–90 MB) loads in a Web Worker, cached in Cache Storage;
  keyword search is available until it is ready (progressive upgrade to semantic).
- Target: first interactive < 2 s on an index up to ~500 artifacts without embeddings.

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
| M3| `embed.mjs` + on-device MiniLM + RRF fusion + toggle        | semantic search |
| M4| Performance, a11y, E2E, deploy to Pages                     | public MVP |

---

## 11. Open questions
1. Embedding model: MiniLM on-device (no keys, recommended) vs OpenAI (higher quality
   but needs a proxy → backend). **MVP decision: MiniLM.**
2. `index.json`/`embeddings.json` — commit to the repo or generate only in CI?
   **Recommendation:** generate in CI, keep gitignored.
3. Single plugin vs a monorepo of several — the `id` scheme already supports it; confirm.
