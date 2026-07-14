# Marketplace UI — design preview

A **React + Vite** preview of the **my-monkeys** marketplace UI (dark, Nocturne-style).
It is intentionally kept **separate from the marketplace itself** — the catalog
(`.claude-plugin/marketplace.json`, `plugins/`) is never mixed into this folder.

Live site: **https://rostk.github.io/my-monkeys/**

## What this is

- A visual/interactive prototype of the search-and-browse experience described in
  [`docs/SPEC-marketplace-ui.md`](../docs/SPEC-marketplace-ui.md).
- Populated with **mock data** (25 sample artifacts across 6 plugins) in
  [`src/data.js`](src/data.js). It does **not** read the real repository yet —
  that wiring is a later milestone.

## Develop

```bash
cd preview
npm install
npm run dev      # Vite dev server + HMR → http://localhost:5173
```

In this repo's tooling you can also start the **`preview`** launch config, which runs
the same Vite dev server.

## Build

```bash
npm run build    # → preview/dist  (base path "/my-monkeys/")
npm run preview  # serve the production build locally
```

## Test

```bash
npm test         # runs `npm run index` first, then the full Vitest suite
                  # (unit tests + the build-index.mjs integration tests)
npm run test:watch
```

## Structure

```
preview/
├── index.html            # Vite entry
├── vite.config.js        # base "/my-monkeys/" in production, "/" in dev
├── vitest.config.js      # standalone Vitest config (unit + integration tests)
├── public/.nojekyll      # copied into dist/ so Pages serves files as-is
├── data/keywords.json    # search-keyword sidecar — see "Search keywords" below
├── scripts/              # build-index.mjs (real catalog), gen-keywords.mjs
│                         # (human-invoked keyword generator, never run by
│                         # the build/index/CI), lib/keywords.mjs (schema + hash)
└── src/
    ├── main.jsx          # React entry
    ├── App.jsx           # state, URL-hash sync, wiring
    ├── index.css         # theme (dark default, respects prefers-color-scheme)
    ├── data.js           # mock catalog + helpers
    ├── icons.jsx         # inline SVG icons
    ├── lib/              # search.js (filter/sort)
    └── components/       # Header, SearchBar, Filters, Card, DetailModal, Toast
```

## Search keywords

Lexical search over the catalog runs against more than each artifact's own name/description/
tags/body — it also matches a curated set of extra `keywords` per artifact, stored in the
**sidecar** file [`data/keywords.json`](data/keywords.json). At build time (`npm run index` /
`npm run build`), `scripts/build-index.mjs` reads that sidecar and attaches each artifact's
`keywords: string[]` to it before writing `src/catalog.json` — see `attachKeywords()` in
[`scripts/lib/keywords.mjs`](scripts/lib/keywords.mjs).

**The sidecar is hand-editable.** It's a plain, git-tracked JSON file keyed by artifact `id` —
open `data/keywords.json`, edit the `keywords` array for an entry, save, and re-run
`npm run index` (or `npm run dev`/`npm run build`, which run it for you). Your edit survives:
nothing in the build ever regenerates or overwrites the sidecar on its own.

**Regenerating with the LLM generator (optional, human-invoked only):**

```bash
ANTHROPIC_API_KEY=sk-ant-... node scripts/gen-keywords.mjs [--dry-run] [--only <id>] [--stale]
```

- `--dry-run` prints the diff summary (what would change) and writes nothing.
- `--only <id>` regenerates a single artifact by its catalog `id`.
- `--stale` regenerates only artifacts whose stored content hash has drifted from the current
  catalog (or that have no sidecar entry at all).
- With no flags it regenerates every artifact currently in `src/catalog.json` — run
  `npm run index` first so that catalog is up to date.

`scripts/gen-keywords.mjs` is the **only** place in this repo that calls an LLM. It refuses to
run (clear error, non-zero exit, writes nothing) if `ANTHROPIC_API_KEY` is unset, and it is
**never** invoked by `npm run index`, `npm run build`, `npm run dev`, `npm test`, or any CI
workflow — it has no npm script of its own on purpose, precisely so nothing can accidentally
wire it into an automated path. `scripts/gen-keywords.test.mjs` enforces that boundary with a
set of guard assertions (no npm script references it, no GitHub Actions workflow references it
or a secret, `build-index.mjs` never imports `fetch`/`http`/`https`) — treat that test as
load-bearing, not ceremony.

**The staleness warning.** Every build compares each artifact's live content (display name +
description + body) against the content hash stored alongside its sidecar entry. If they've
drifted — e.g. you edited a skill's `SKILL.md` after its keywords were last generated —
`build-index.mjs` prints a `[keywords] "<id>" content has drifted from its keyword sidecar …`
warning to the console and keeps building with the (now possibly stale) keywords; it never
fails the build over this. Silence the warning by hand-editing the sidecar entry yourself, or
by running `node scripts/gen-keywords.mjs --stale` (with an API key) to regenerate just the
drifted entries.

## Hosting

Published to GitHub Pages by [`.github/workflows/pages.yml`](../.github/workflows/pages.yml),
which runs `npm ci && npm run build` and uploads **only** `preview/dist` as the Pages
artifact (auto-enabling Pages on first run). Requires the repo to be public or on a
Pages-eligible plan.
