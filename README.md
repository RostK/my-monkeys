# my-monkeys

A [Claude Code](https://code.claude.com/docs/en/plugin-marketplaces) **plugin marketplace** — a catalog that distributes plugins (skills, commands, agents, hooks, MCP servers) to Claude Code users.

## Structure

```
my-monkeys/
├── .claude-plugin/
│   └── marketplace.json          # marketplace catalog (required, repo root)
└── plugins/
    └── <name>/                   # one directory per plugin
        ├── .claude-plugin/
        │   └── plugin.json       # plugin manifest (name, description, version)
        ├── skills/                # <skill-name>/SKILL.md
        ├── commands/               # flat <command-name>.md slash commands
        ├── agents/                 # <agent-name>.md subagents
        └── hooks/                  # (optional) lifecycle hooks
```

> Each plugin folder ships whichever of `skills/`, `commands/`, `agents/`, `hooks/` it
> needs — not all four are required. `.claude-plugin/marketplace.json` has **no
> `pluginRoot` key**: each entry's `source` is a path relative to the **repo root**,
> e.g. `"./plugins/<name>"`. The catalog currently lists four published plugins
> (`engineering-paved-path`, `research-tools`, `architecture-review`,
> `sdd-engineering` — see `plugins/`), not placeholders.

## Add your first plugin

1. Create the manifest `plugins/<name>/.claude-plugin/plugin.json`:

   ```json
   {
     "name": "<name>",
     "description": "What this plugin does",
     "version": "1.0.0"
   }
   ```

2. Add at least one component, e.g. a skill at `plugins/<name>/skills/<skill>/SKILL.md`:

   ```markdown
   ---
   description: Short description of what the skill does
   ---

   Instructions Claude follows when this skill runs.
   ```

3. Register it in `.claude-plugin/marketplace.json` — `source` is a path relative to the
   **repo root** (there is no `pluginRoot` key):

   ```json
   "plugins": [
     {
       "name": "<name>",
       "source": "./plugins/<name>",
       "description": "What this plugin does",
       "version": "1.0.0"
     }
   ]
   ```

   `plugins/<name>/.claude-plugin/plugin.json`'s `version` is the **authoritative**
   source — `.claude-plugin/marketplace.json`'s `version` field is generated from it
   (`npm run gen:marketplace`); never hand-edit it. See § Release & rollback.

## Test locally

```bash
claude plugin validate .                 # validate marketplace.json + plugin manifests
claude plugin marketplace add ./         # register this marketplace locally
claude plugin install <name>@my-monkeys  # install a plugin from it
```

## Release & rollback

Helper scripts live in [`scripts/`](scripts) (Bash — run in Git Bash on Windows, or any
shell on macOS/Linux/CI; require `node`, not `jq`). Releases are cut as annotated git
tags; a rollback restores a previous tag's tree as a new forward commit — no
force-push, ever.

### Tag grammar

This is the normative definition — every other doc in this repo links here instead of
restating it. There are two tag families:

- **Family-P — per-plugin release: `<plugin>--v<X.Y.Z>`** (e.g. `sdd-engineering--v1.0.0`).
  Cut with `scripts/release.sh <version> --plugin <name>`. **This is what every tag in
  this repo uses today** — see `git tag -l`.
- **Family-M — marketplace-wide snapshot: `v<X.Y.Z>`** (e.g. `v1.0.0`). Cut with
  `scripts/release.sh <version>` (no `--plugin`). Implemented and available, but **no
  Family-M tag has ever been cut** in this repo — don't assume one exists.

```bash
# Cut a per-plugin release (Family-P): bump plugins/<name>/.claude-plugin/plugin.json's
# version, validate, tag <name>--v<version>, push.
scripts/release.sh 1.1.0 --plugin sdd-engineering

# Cut a marketplace-wide release (Family-M): validate, tag v<version>, push.
scripts/release.sh 1.0.0

# Preview without changing anything:
scripts/release.sh 2.0.0 --dry-run

# Roll back to a known-good tag (safe, non-destructive) — use a real tag,
# e.g. one of the four current Family-P tags from `git tag -l`:
scripts/rollback.sh sdd-engineering--v1.0.0
```

Both scripts validate the marketplace **before making any change**, via
`npm run validate:manifests` — ajv (draft-07 + ajv-formats) against this repo's own
committed copies of the upstream Claude Code JSON Schemas in [`schemas/`](schemas) —
**not** the `claude` CLI. `SKIP_VALIDATE=1` is the sole opt-out. Both scripts require a
clean tree on `main` and accept `--no-push`, `--dry-run`, and `-y`. Users receive
changes when they run `/plugin marketplace update`. See `scripts/release.sh --help` /
`scripts/rollback.sh --help` for all options.

> Prerequisite: configure git identity once (`git config user.name` / `user.email`) so tags and commits can be created.

## Notes

- `name` (marketplace and plugins) must be **kebab-case** (lowercase + hyphens).
- A plugin's `name` is an **immutable slug** once published — change the UI label via `displayName`, never by renaming `name`.
- Relative `source` paths only resolve when the marketplace is added via git or a local path, not via a direct URL to `marketplace.json`.
- Omit `version` in `plugin.json` to treat every git commit as a new version; otherwise
  set it and bump it there on each release. **`plugin.json`'s `version` is
  authoritative** — `.claude-plugin/marketplace.json`'s `version` fields are
  **generated output** (`npm run gen:marketplace`; CI enforces they're in sync via
  `npm run check:marketplace`). Never hand-edit a `version` in `marketplace.json`.
- CI backs this up: `Marketplace validate` checks every manifest against the schemas
  in `schemas/` on each PR (and that `marketplace.json` is the generator's byte-exact
  output); `Tag on merge` auto-cuts the Family-P tag when a plugin's version changes on
  `main`; `Schema drift` periodically checks the vendored copies in `schemas/` against
  upstream. See [`.github/workflows/`](.github/workflows).
- See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow,
  [`docs/PLUGIN-GUIDELINES.md`](docs/PLUGIN-GUIDELINES.md) for plugin authoring
  conventions, [`RELEASES.md`](RELEASES.md) for more on the release process, and
  [`SECURITY.md`](SECURITY.md) for the trust model and how to report a vulnerability.
