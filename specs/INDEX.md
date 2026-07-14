# Spec index

Every SDD spec in this repository, newest last. `SPEC-NN` ids are **globally unique** and never
reused. Files live at `specs/<module>/SPEC-NN-YYYY-MM-DD-<slug>.md`.

Status: `draft` → `approved` → `implemented` (or `superseded`). A spec with any open
`[NEEDS CLARIFICATION]` marker stays `draft`.

| Spec ID | Date | Feature | Module | Status | Supersedes | File |
| --- | --- | --- | --- | --- | --- | --- |
| SPEC-01 | 2026-07-14 | Lexical search engine (MiniSearch/BM25) + baked keyword enrichment | `preview` | **approved** | `docs/SPEC-marketplace-ui.md` §5–§6 (embeddings + RRF), in part | [specs/preview/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md](preview/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md) |

## Note on `docs/SPEC-*.md`

The two pre-SDD design documents — `docs/SPEC-marketplace-ui.md` and
`docs/SPEC-sdd-engineering-plugins.md` — predate this index and do not follow the
`SPEC-NN-YYYY-MM-DD-<slug>` convention. They are **not** tracked here and keep their own ids.
