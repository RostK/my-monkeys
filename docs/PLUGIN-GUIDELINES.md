# Plugin authoring guidelines

Conventions for authoring or changing a plugin in this marketplace, `plugins/<name>/`. For the
contribution workflow (setup, local validation, CI), see [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
For the marketplace's on-disk structure and the tag grammar, see [`../README.md`](../README.md).

## `plugin.json` fields

The fields below are what the four plugins actually published in this marketplace today
(`architecture-review`, `engineering-paved-path`, `research-tools`, `sdd-engineering`) use in their
`plugins/<name>/.claude-plugin/plugin.json`. Verify against those files directly if in doubt — they
are the source of truth, not this table.

| Field | Used by | Notes |
|---|---|---|
| `name` | all 4 | kebab-case (lowercase + hyphens). **Immutable slug** once published — see below. |
| `displayName` | all 4 | The human-readable label shown in UI. Legitimate and expected on every plugin, even though `README.md`'s minimal "add your first plugin" example omits it for brevity. |
| `version` | all 4 | Semver (`X.Y.Z`). **Authoritative** for this plugin — see below. |
| `description` | all 4 | One sentence, what the plugin does. |
| `author` | all 4 | Object: `{ "name": ..., "email": ... }`. |
| `keywords` | all 4 | Array of lowercase strings for discoverability. |
| `license` | all 4 | `"MIT"` on all four today. |
| `dependencies` | 2 of 4 (`architecture-review`, `sdd-engineering`) | Optional. Array of `{ "name": "<plugin>", "version": "<semver-range>" }`. See "Dependencies" below. |

### `plugin.json` is authoritative for `version`

**`plugins/<name>/.claude-plugin/plugin.json`'s `version` field is the authoritative source of
truth for that plugin's version.** `.claude-plugin/marketplace.json`'s `version` fields are
**generated output** (`npm run gen:marketplace`) and CI enforces they stay in sync
(`npm run check:marketplace`, run inside the `Marketplace validate / validate` check). **Never
hand-edit a `version` field in `.claude-plugin/marketplace.json`.** If you're bumping a plugin's
version, bump it in exactly one place — `plugin.json` — then run `npm run gen:marketplace` and
commit the regenerated `marketplace.json` alongside it.

### Naming

- `name` (both the plugin's own `plugin.json` and its entry in the root `marketplace.json`) must be
  **kebab-case**.
- A plugin's `name` is an **immutable slug** once published. If you want to change how it's
  displayed, change `displayName` — never rename `name`.

## Plugin layout

Each plugin folder ships whichever of the following it needs — not all four are required:

```
plugins/<name>/
├── .claude-plugin/
│   └── plugin.json         # the manifest — see the field table above
├── skills/
│   └── <skill-name>/
│       └── SKILL.md        # one folder per skill
├── commands/
│   └── <command-name>.md   # flat — one file per slash command, no subfolders
├── agents/
│   └── <agent-name>.md     # flat — one file per subagent, no subfolders
└── hooks/                  # optional — lifecycle hooks (e.g. hooks.json + scripts)
```

`skills/` is nested one level (`<skill-name>/SKILL.md`, so a skill can carry its own
`references/`/`assets/` alongside `SKILL.md`); `commands/` and `agents/` are flat (`<name>.md`
directly under the folder, no per-item subfolder).

## Writing a `SKILL.md` `description` for reliable triggering

A skill's `description` frontmatter field is the **only** signal Claude uses to decide whether to
invoke that skill — write it as a triggering spec, not a summary. Follow the pattern already used
throughout this marketplace's own skills (e.g. `plugins/engineering-paved-path/skills/zod/SKILL.md`,
`plugins/engineering-paved-path/skills/react-best-practices/SKILL.md`):

1. **State what it does** in one clause up front.
2. **State when to use it**, with concrete trigger phrases/scenarios ("Use when defining
   `z.object` schemas, using `z.string` validations, `safeParse`, or `z.infer`" — name the literal
   APIs/keywords a user's request would contain, not an abstract category).
3. **State what it does *not* cover**, naming the sibling skill that does, whenever two skills in
   this marketplace could plausibly both match the same request (e.g. Zod's own description
   excludes React Hook Form integration and OpenAPI client generation, pointing to the
   `react-hook-form` and `orval` skills instead). This disambiguation clause is what keeps two
   skills from both firing — or neither firing — on an ambiguous request.

Keep the same discipline for `agents/*.md` and `commands/*.md` frontmatter descriptions: lead with
what it does, then when to invoke it.

## Dependencies

A plugin may declare other marketplace plugins it depends on via `dependencies`, an array of
`{ "name": "<plugin>", "version": "<semver-range>" }`. **A plugin declaring `dependencies` must name
only plugins present in `.claude-plugin/marketplace.json`, with a range satisfied by that plugin's
current version.** The real dependency edges in this marketplace today
(`.claude-plugin/marketplace.json:26-28,35-39`) satisfy that rule:

- `architecture-review` depends on `engineering-paved-path` (`^1.0.0`) — satisfied by
  `engineering-paved-path`'s current `1.0.0`.
- `sdd-engineering` depends on `engineering-paved-path` (`^1.0.0`), `research-tools` (`^1.0.0`), and
  `architecture-review` (`^1.0.0`) — satisfied by their current `1.0.0`, `1.0.0`, and `1.1.0`.

**This is documentation, not enforcement.** Neither `scripts/validate-manifests.mjs` nor the CI
`Marketplace validate` check resolves these ranges against the depended-on plugin's actual
`version`, and nothing prevents publishing a `dependencies` entry whose range can never be
satisfied by the target plugin's current version. Declare dependencies accurately for the reader's
benefit; don't rely on tooling to catch a mismatch.

## Registering a new plugin

1. Create `plugins/<name>/.claude-plugin/plugin.json` with at minimum `name`, `displayName`,
   `version`, `description`, `author`, `keywords`, and `license` (see the field table above).
2. Add at least one component under `skills/`, `commands/`, `agents/`, or (optionally) `hooks/` —
   see "Plugin layout" above.
3. Register it in the root `.claude-plugin/marketplace.json`. `source` is **repo-root-relative**
   (there is no `pluginRoot` key) — e.g. `"./plugins/<name>"`, resolved as
   `resolve(REPO_ROOT, entry.source)`. Do not hand-write the `version` field there; run
   `npm run gen:marketplace` to generate it from `plugin.json`.
4. Run `npm run validate:manifests` locally before opening a PR (see
   [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for the full local-validation loop).

## Releasing

Once your change lands on `main`, cutting a release (bumping `version` and tagging it) is covered in
[`../RELEASES.md`](../RELEASES.md) — this document is about authoring the plugin, not the release
mechanics.
