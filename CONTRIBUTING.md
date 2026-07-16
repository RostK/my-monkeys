# Contributing

Thanks for considering a contribution to **my-monkeys**, a [Claude Code](https://code.claude.com/docs/en/plugin-marketplaces)
plugin marketplace. This document covers the day-to-day contributor workflow — setup, local
validation, what CI checks, and how a change lands. All content in this repository (docs, code,
commit messages, PR descriptions) must be in **English**.

For the marketplace's on-disk shape, the tag grammar, and the release process, see
[`README.md`](README.md) — this document does not restate it. For plugin-authoring conventions
(what fields a `plugin.json` uses, dependency edges, naming rules), see
[`docs/PLUGIN-GUIDELINES.md`](docs/PLUGIN-GUIDELINES.md). For the full release/rollback mechanics,
see [`RELEASES.md`](RELEASES.md). For the trust model and how to report a vulnerability, see
[`SECURITY.md`](SECURITY.md).

## Prerequisites

- `node` (the only runtime dependency of this repo's tooling — there is no `jq` dependency).
- `git`, with `user.name` / `user.email` configured (needed to create commits and tags).
- The [`claude` CLI](https://code.claude.com/docs/en/plugin-marketplaces), for local iteration only
  (see "Test locally" below) — it is not required to make CI pass.

Install dependencies from the repo root:

```bash
npm ci
```

## Making a change

1. Fork/branch from `main`.
2. Add or change a plugin under `plugins/<name>/`, or edit the marketplace catalog
   `.claude-plugin/marketplace.json`. See [`docs/PLUGIN-GUIDELINES.md`](docs/PLUGIN-GUIDELINES.md)
   for what a `plugin.json` should contain.
3. **If you bump a plugin's version, bump it in exactly one place: `plugins/<name>/.claude-plugin/plugin.json`.**
   `plugin.json`'s `version` field is the **authoritative** source of truth for that plugin's
   version. `.claude-plugin/marketplace.json`'s `version` fields are **generated output** — never
   hand-edit them. Regenerate them locally with:

   ```bash
   npm run gen:marketplace
   ```

   and commit the regenerated `.claude-plugin/marketplace.json` alongside your `plugin.json` change.
4. Open a pull request against `main`.

## Repository-specific rules

A few naming/versioning rules apply across this repository (both plugin manifests and the root
catalog):

- `name` (both a plugin's own `plugin.json` and its entry in the root `marketplace.json`) must be
  **kebab-case** (lowercase + hyphens).
- A plugin's `name` is an **immutable slug** once published — never rename it.
- To change how a plugin is labeled in the UI, change `displayName` instead of renaming `name`.
- `version` in `plugin.json` has pin-vs-omit semantics: **omit** it to treat every git commit as a
  new version, or **set it and bump it on each release** — see "If you bump a plugin's version"
  above. `plugin.json`'s `version` is authoritative; never hand-edit
  `.claude-plugin/marketplace.json`'s `version`.

## Test locally

The `claude` CLI is your local iteration loop — it's how you exercise the marketplace and a plugin
the way an end user would, before you ever push:

```bash
claude plugin validate .                 # validate marketplace.json + plugin manifests
claude plugin marketplace add ./         # register this marketplace locally
claude plugin install <name>@my-monkeys  # install a plugin from it
```

Separately, run the same schema validation CI runs before you push:

```bash
npm run validate:manifests   # ajv (draft-07 + ajv-formats) against schemas/*.json
npm run check:marketplace    # asserts marketplace.json matches gen:marketplace's output
```

These two loops are complementary, not interchangeable: the `claude` CLI commands above are how
*you* sanity-check the marketplace and a plugin install locally; `npm run validate:manifests` /
`npm run check:marketplace` are the exact commands the CI gate below runs. **CI never shells out to
the `claude` CLI** — it validates purely via `ajv` against this repo's committed copies of the
upstream Claude Code JSON Schemas (`schemas/`). Passing the `claude` CLI checks locally does not
guarantee the CI gate passes (and vice versa) — run both before opening a PR.

## What CI checks

Every pull request that touches `.claude-plugin/marketplace.json`, `plugins/**`, `schemas/**`, the
root `package.json`/`package-lock.json`, or the validation scripts runs the **`Marketplace validate
/ validate`** check (`.github/workflows/marketplace-validate.yml`). It:

1. Runs `npm run validate:manifests` — validates every manifest against the schemas committed in
   [`schemas/`](schemas) (ajv, draft-07 + ajv-formats), plus two repo-local rules ajv can't express
   (a plugin's `source` must resolve inside the repo; no two plugins may share a `name`).
2. Runs `npm run gen:marketplace` and fails the check if that changes
   `.claude-plugin/marketplace.json` — i.e. it fails if `marketplace.json`'s `version` fields are
   out of sync with (or were hand-edited ahead of) their authoritative `plugin.json` sources.

This is the only status check a contributor's PR needs to pass. (Two other workflows exist —
`Tag on merge`, which auto-cuts a release tag on `push` to `main` after your PR merges, and
`Schema drift`, a scheduled job that checks the vendored schemas against upstream — neither runs on
your PR; see [`README.md`](README.md) and [`RELEASES.md`](RELEASES.md).)

## Code owners

[`.github/CODEOWNERS`](.github/CODEOWNERS) applies a blanket ownership rule to every file in this
repository.

## Non-goals for this document

This document does not cover the tag grammar, the release/rollback scripts, or the marketplace's
on-disk structure — see [`README.md`](README.md) and [`RELEASES.md`](RELEASES.md) for those.
