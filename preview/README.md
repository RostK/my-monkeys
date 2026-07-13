# Marketplace UI — design preview

A self-contained, static preview of the **my-monkeys** marketplace UI (dark, Nocturne-style).
It is intentionally kept **separate from the marketplace itself** — the catalog
(`.claude-plugin/marketplace.json`, `plugins/`) is never mixed into this folder.

Live site: **https://rostk.github.io/my-monkeys/**

## What this is

- A visual/interactive prototype of the search-and-browse experience described in
  [`docs/SPEC-marketplace-ui.md`](../docs/SPEC-marketplace-ui.md).
- Populated with **mock data** (25 sample artifacts across 6 plugins) baked into
  `app.js`. It does **not** read the real repository — that wiring is a later milestone.

## Files

| File          | Purpose                                                        |
| ------------- | ------------------------------------------------------------- |
| `index.html`  | Page shell + all styles (dark by default, respects `prefers-color-scheme`). |
| `app.js`      | Mock dataset, search, faceted filters, sort, detail modal, install-copy. |
| `.nojekyll`   | Tells GitHub Pages to serve files as-is (no Jekyll processing). |

## Run locally

No build step — it's plain HTML/CSS/JS. Open `index.html` directly, or serve the folder:

```bash
cd preview
python -m http.server 8080
# → http://localhost:8080
```

## Hosting

Published to GitHub Pages by [`.github/workflows/pages.yml`](../.github/workflows/pages.yml),
which uploads **only this `preview/` folder** as the Pages artifact. Pages must be enabled
once in **Settings → Pages → Build and deployment → Source: GitHub Actions**.
