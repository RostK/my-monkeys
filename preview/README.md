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

## Structure

```
preview/
├── index.html            # Vite entry
├── vite.config.js        # base "/my-monkeys/" in production, "/" in dev
├── public/.nojekyll      # copied into dist/ so Pages serves files as-is
└── src/
    ├── main.jsx          # React entry
    ├── App.jsx           # state, URL-hash sync, wiring
    ├── index.css         # theme (dark default, respects prefers-color-scheme)
    ├── data.js           # mock catalog + helpers
    ├── icons.jsx         # inline SVG icons
    ├── lib/              # search.js (filter/sort), markdown.js (renderer)
    └── components/       # Header, SearchBar, Filters, Card, DetailModal, Toast
```

## Hosting

Published to GitHub Pages by [`.github/workflows/pages.yml`](../.github/workflows/pages.yml),
which runs `npm ci && npm run build` and uploads **only** `preview/dist` as the Pages
artifact (auto-enabling Pages on first run). Requires the repo to be public or on a
Pages-eligible plan.
