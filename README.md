# my-monkeys

A [Claude Code](https://code.claude.com/docs/en/plugin-marketplaces) **plugin marketplace** — a catalog that distributes plugins (skills, commands, agents, hooks, MCP servers) to Claude Code users.

## Structure

```
my-monkeys/
├── .claude-plugin/
│   └── marketplace.json          # marketplace catalog (required, repo root)
└── plugins/
    └── example-plugin/           # template folder — one directory per plugin
        ├── .claude-plugin/
        │   └── plugin.json       # plugin manifest (name, description, version)
        ├── skills/               # <skill-name>/SKILL.md
        ├── commands/             # flat <command-name>.md slash commands
        └── agents/               # <agent-name>.md subagents
```

> The `example-plugin` folders are placeholders (currently `.gitkeep`). `marketplace.json`
> ships with an empty `plugins: []` until you register your first plugin.

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

3. Register it in `.claude-plugin/marketplace.json` (relative to `pluginRoot: "./plugins"`):

   ```json
   "plugins": [
     {
       "name": "<name>",
       "source": "<name>",
       "description": "What this plugin does",
       "version": "1.0.0"
     }
   ]
   ```

## Test locally

```bash
claude plugin validate .                 # validate marketplace.json + plugin manifests
claude plugin marketplace add ./         # register this marketplace locally
claude plugin install <name>@my-monkeys  # install a plugin from it
```

## Release & rollback

Helper scripts live in [`scripts/`](scripts) (Bash — run in Git Bash on Windows, or any shell on macOS/Linux/CI). They use a **semver git-tag** model: each release is an annotated tag `vX.Y.Z`, and a rollback restores a previous tag as a new forward commit (no force-push).

```bash
# Cut a release: validate the marketplace, tag vX.Y.Z, push.
scripts/release.sh 1.0.0

# Also bump a specific plugin's version before tagging (needs jq):
scripts/release.sh 1.1.0 --plugin example-plugin

# Preview without changing anything:
scripts/release.sh 2.0.0 --dry-run

# Roll back to a known-good tag (safe, non-destructive):
scripts/rollback.sh v1.0.0
```

Both scripts run `claude plugin validate .` first, require a clean tree on `main`, and accept `--no-push`, `--dry-run`, and `-y`. Users receive changes when they run `/plugin marketplace update`. See `scripts/release.sh --help` / `scripts/rollback.sh --help` for all options.

> Prerequisite: configure git identity once (`git config user.name` / `user.email`) so tags and commits can be created.

## Notes

- `name` (marketplace and plugins) must be **kebab-case** (lowercase + hyphens).
- A plugin's `name` is an **immutable slug** once published — change the UI label via `displayName`, never by renaming `name`.
- Relative `source` paths only resolve when the marketplace is added via git or a local path, not via a direct URL to `marketplace.json`.
- Omit `version` (here or in `plugin.json`) to treat every git commit as a new version; set it and bump on each release to pin.
