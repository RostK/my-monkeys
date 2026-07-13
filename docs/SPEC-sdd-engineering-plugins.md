# Spec: SDD Engineering plugin suite

Design for a set of Claude Code plugins published from the `my-monkeys` marketplace,
extracted and generalized from the [`RostK/dev-digest`](https://github.com/RostK/dev-digest)
`.claude/` toolkit. The suite centers on **Spec-Driven Development (SDD) Engineering** and
its reusable dependencies.

- **Status:** Draft v1
- **Owner:** RostK
- **Date:** 2026-07-13
- **Source of truth for components:** `dev-digest/.claude/{agents,skills}`

---

## 1. Goals & scope

1. Ship **four plugins** through the existing `my-monkeys` marketplace, wired together with
   a real **dependency graph** (`plugin.json` `dependencies`, resolved within the marketplace).
2. Make three of them **reusable dependencies** that stand on their own, and one (`sdd-engineering`)
   the **top-level plugin** that composes them into a full SDD workflow.
3. **Generalize** everything lifted from `dev-digest`: no DevDigest-specific paths, product specs,
   secrets, cache, or repo-specific instructions travel with the plugins.
4. Ship `sdd-engineering` with a **README** (how the loop works end to end) and a **CHANGELOG**
   (versions & releases), plus a per-plugin release/tag model.

### Non-goals
- No changes to the marketplace UI spec ([`SPEC-marketplace-ui.md`](SPEC-marketplace-ui.md)).
- No migration of the DevDigest application code (server/client/reviewer-core/etc.).
- Content is **English-only** (marketplace convention).

---

## 2. Plugin catalog & dependency graph

Four marketplace entries. Arrows = `dependencies` in `plugin.json`.

```
sdd-engineering  (top-level)
   ├─ depends ^1.0.0 → research-tools                                    (leaf)
   ├─ depends ^1.0.0 → architecture-review ─ depends ^1.0.0 ┐
   └─ depends ^1.0.0 → engineering-paved-path ◄─────────────┘           (base, leaf)
```

`engineering-paved-path` is the shared **base**: both `architecture-review` (its `architecture-reviewer`
preloads paved-path skills) **and** `sdd-engineering` (its agents preload them) depend on it.
`research-tools` is a true leaf — `researcher` preloads no skills.

| Plugin | Role | Ships | Depends on |
|--------|------|-------|-----------|
| `engineering-paved-path` | dependency (base) | 13 reusable **skills** (React/Next/Fastify, architecture ×2, testing, security, pr-self-review, typescript, zod, drizzle, postgres, insights) | — |
| `research-tools` | dependency (leaf) | read-only **agent** `researcher` | — |
| `architecture-review` | dependency | generalized **agent** `architecture-reviewer` | `engineering-paved-path` `^1.0.0` |
| `sdd-engineering` | top-level | 4 agents; skills `run-plan`, `retro`, `write-spec`, `requirements-engineering`, `plan-implementation`; telemetry hook; evals; docs | all three at `^1.0.0` |

Installing `sdd-engineering` **auto-installs its dependencies** transitively (same marketplace, so no
`allowCrossMarketplaceDependenciesOn` needed): it pulls `research-tools`, `architecture-review`, and
`engineering-paved-path`, and `architecture-review` in turn pulls `engineering-paved-path` (resolved
once; both constrain it to `^1.0.0`). Each dependency is also independently installable.

---

## 3. Component migration map

Source is `dev-digest/.claude/`. Renames make names generic and match the slide deck.

### Agents

| Target (plugin) | Target name | Source file | Notes |
|-----------------|-------------|-------------|-------|
| sdd-engineering | `spec-creator` | `agents/spec-author.md` | WHAT-only spec author (Author/Resolve modes, `NC-n` markers, writes only under a specs dir); invokes `write-spec`/`requirements-engineering`. **Strip:** `permissionMode`, `mcp__devdigest__*` tools, `specs/TEMPLATE.md`+`INDEX.md` → explicit inputs |
| sdd-engineering | `implementation-planner` | `agents/implementation-planner.md` | read-only architect: requirements → file-level plan (HOW), never code; invokes `plan-implementation`; preloads `onion-architecture`, `frontend-ui-architecture`, `security`. **Strip:** `plans/`, `INSIGHTS.md` |
| sdd-engineering | `implementer` | `agents/implementer-backend.md` + `agents/implementer-ui.md` | **merged**; executes one task unit, `isolation: worktree`, file-scoped, tests+typecheck green. Preloads the **union** of both skill sets (see preload map). **Strip:** repo paths, `pnpm/npm` test commands, `CLAUDE.md`/`INSIGHTS.md` |
| sdd-engineering | `plan-verifier` | `agents/plan-verifier.md` | read-only **post-implementation acceptance gate**: requirements traceability citing `file:line`, verdicts MET/PARTIAL/NOT FOUND/UNPLANNED/UNVERIFIABLE (no quality judgment, no test runs); preloads `onion-architecture`, `frontend-ui-architecture`, `typescript-expert` |
| research-tools | `researcher` | `agents/researcher.md` | **read-only**: restrict tools (no Write/Edit) |
| architecture-review | `architecture-reviewer` | `agents/architecture-reviewer.md` | **generalized**; `architecture-reviewer-lite` **dropped** |

Not migrated as agents: `doc-writer`, `test-writer-backend`, `test-writer-ui` (out of scope
per the named component list; revisit if needed).

### Skills / workflow

| Target (plugin) | Target name | Source | Notes |
|-----------------|-------------|--------|-------|
| sdd-engineering | `write-spec` (skill) | `skills/write-spec` | SDD-process; paired with `spec-creator` |
| sdd-engineering | `requirements-engineering` (skill) | `skills/requirements-engineering` | SDD-process; reference used by `spec-creator` |
| sdd-engineering | `plan-implementation` (skill) | `skills/plan-implementation` | SDD-process; paired with `implementation-planner` |
| sdd-engineering | `run-plan` (skill) | `skills/implement` | **orchestrates** the execution phase of an approved plan: build (fan out `implementer`) → review (`plan-verifier` + `architecture-reviewer` + `/code-review`) → fix loop → runtime verify → gate (`pr-self-review`). Delegates all edits; never writes code itself |
| sdd-engineering | `retro` (workflow) | `skills/review-run` | **documents SDD-harness performance**: aggregates the durable per-step telemetry ledger (see the capture hook, §4.1) into a RETRO report + ledger trend row and routes learnings to memory. Aggregates *persisted* per-step records, not lost in-context session state. Packaged as a command/skill (§6) |
| engineering-paved-path | `react-best-practices` | `skills/react-best-practices` | React |
| engineering-paved-path | `next-best-practices` | `skills/next-best-practices` | Next.js |
| engineering-paved-path | `fastify-best-practices` | `skills/fastify-best-practices` | Fastify |
| engineering-paved-path | `onion-architecture` | `skills/onion-architecture` | architecture |
| engineering-paved-path | `frontend-ui-architecture` | `skills/frontend-ui-architecture` | architecture |
| engineering-paved-path | `react-testing-library` | `skills/react-testing-library` | testing |
| engineering-paved-path | `typescript-expert` | `skills/typescript-expert` | language (preloaded by implementer, plan-verifier) |
| engineering-paved-path | `zod` | `skills/zod` | validation (preloaded by implementer) |
| engineering-paved-path | `drizzle-orm-patterns` | `skills/drizzle-orm-patterns` | data layer (preloaded by implementer, planner) |
| engineering-paved-path | `postgresql-table-design` | `skills/postgresql-table-design` | data layer (preloaded by implementer) |
| engineering-paved-path | `security` | `skills/security` | security |
| engineering-paved-path | `pr-self-review` | `skills/pr-self-review` | security/quality |
| engineering-paved-path | `engineering-insights` | `skills/engineering-insights` | hook-based capture of pitfalls/insights read by `implementation-planner`/`implementer` |

**Included (decided):** `typescript-expert`, `drizzle-orm-patterns`, `zod`, `postgresql-table-design`
ship in `engineering-paved-path` because the SDD agents preload them (agents kept as-is; paved-path is
opinionated to the React/Next/Fastify/Drizzle/Postgres stack). **Truly optional, not shipped v1**
(no agent preloads them): `mermaid-diagram`, `dependencies-checker`.

### Agent → paved-path skill preload map

An agent cannot preload a skill that is not installed, so the agents' preloads determine both the
minimum skill set `engineering-paved-path` must ship **and** which plugins must depend on it:

| Agent (plugin) | Preloaded / named `engineering-paved-path:*` skills |
|----------------|------------------------------------------------------|
| implementation-planner *(sdd-engineering)* | onion-architecture, frontend-ui-architecture, security; per-task: fastify-/react-/next-best-practices, drizzle-orm-patterns |
| implementer *(sdd-engineering, merged)* | onion-architecture, frontend-ui-architecture, fastify-/next-/react-best-practices, react-testing-library, drizzle-orm-patterns, postgresql-table-design, zod, typescript-expert, security |
| plan-verifier *(sdd-engineering)* | onion-architecture, frontend-ui-architecture, typescript-expert |
| architecture-reviewer *(architecture-review)* | onion-architecture, frontend-ui-architecture, zod, security, typescript-expert |

**Union required in `engineering-paved-path`:** onion-architecture, frontend-ui-architecture,
react-best-practices, next-best-practices, fastify-best-practices, react-testing-library, security,
typescript-expert, drizzle-orm-patterns, zod, postgresql-table-design.

**Cross-plugin dependency:** because `architecture-reviewer` also preloads paved-path skills,
**`architecture-review` declares `dependencies: [engineering-paved-path ^1.0.0]`** (§4.4) — a
dependency *between* two dependency plugins, not only from the top-level one. `research-tools` needs
no such dependency (`researcher` preloads nothing).

---

## 4. Per-plugin composition

### 4.1 `sdd-engineering` (top-level)

```
plugins/sdd-engineering/
├── .claude-plugin/plugin.json      # version + dependencies (^1.0.0 × 3)
├── agents/
│   ├── spec-creator.md
│   ├── implementation-planner.md
│   ├── implementer.md
│   └── plan-verifier.md
├── skills/
│   ├── write-spec/SKILL.md         # SDD-process skills (paired with the agents)
│   ├── requirements-engineering/SKILL.md
│   ├── plan-implementation/SKILL.md
│   ├── run-plan/SKILL.md           # orchestrate execution; scripts via ${CLAUDE_SKILL_DIR}
│   └── retro/SKILL.md              # aggregates the telemetry ledger (← review-run) (see §6)
├── hooks/hooks.json                # SubagentStop/Stop → append per-step telemetry to the ledger
├── scripts/capture-telemetry.mjs   # invoked by the hook via ${CLAUDE_PLUGIN_ROOT}
├── evals/                          # maintainer/CI files, not loaded as components
├── README.md                       # end-to-end SDD loop
└── CHANGELOG.md                    # versions & releases
```

`plugin.json`:

```json
{
  "name": "sdd-engineering",
  "version": "1.0.0",
  "description": "Spec-Driven Development engineering workflow: spec → plan → verify → implement → retro",
  "author": { "name": "RostK", "email": "rkaniuchenko@gmail.com" },
  "dependencies": [
    { "name": "engineering-paved-path", "version": "^1.0.0" },
    { "name": "research-tools",         "version": "^1.0.0" },
    { "name": "architecture-review",    "version": "^1.0.0" }
  ]
}
```

**Agents are thin orchestrators; skills are the reusable procedures they invoke** (mirrors the
`dev-digest` agent↔skill pairing). The SDD loop (documented in the README):
1. **`spec-creator`** turns a request into a spec — the **WHAT** only, via `write-spec`
   (+ `requirements-engineering`); open questions become `[NEEDS CLARIFICATION: NC-n]` markers.
2. **`implementation-planner`** turns the approved spec into a file-level plan — the **HOW** — via
   `plan-implementation` (read-only; never writes code).
3. **`run-plan`** orchestrates the execution phase (it delegates; it never writes code itself):
   - **build** — fan out **`implementer`** per task unit (worktree-isolated, file-scoped, green tests);
   - **review** (parallel) — **`plan-verifier`** (requirement coverage citing `file:line`; verdicts
     MET/PARTIAL/NOT FOUND/UNPLANNED/UNVERIFIABLE), **`architecture-reviewer`** (structure),
     `/code-review` (line-level bugs);
   - **fix loop** → **runtime verify** (drive the real stack) → **gate** (`pr-self-review`) + report.
4. **`retro`** runs the end-of-run **orchestration retrospective** (from `review-run`): scores how well
   the harness performed, writes a RETRO report + ledger, and routes durable learnings to memory.
5. Dependencies plug in on demand: **`researcher`** for investigation, **`architecture-reviewer`**
   during `run-plan`'s review, and **`engineering-paved-path:*`** skills for framework/testing/security.
   `engineering-paved-path:engineering-insights` captures pitfalls the planner/implementer read back
   in — distinct from `retro`'s telemetry.

**Durable harness telemetry (why capture is per-step).** SDD steps are often run **separately and
manually** — `write-spec` now, planning later, `run-plan` in a different session. By the time
implementation ends, the earlier steps' in-context telemetry is gone, so a retro that only
reconstructs the current session (as the source `review-run` does) would miss `write-spec`/planning
performance. To prevent that, `sdd-engineering` ships a **`SubagentStop`/`Stop` hook** that appends
each step's harness telemetry (agent, tokens, tool-uses, duration, status) to a **durable per-feature
ledger** (e.g. `${CLAUDE_PROJECT_DIR}/retros/ledger.jsonl`). `retro` then **aggregates that ledger** —
so the record survives across separate runs. **Capture is per-step; the documented report is
end-of-run.** (Distinct from `engineering-insights`, which captures technical pitfalls, not harness
telemetry.)

### 4.2 `engineering-paved-path` (dependency)

Leaf plugin, no dependencies. Skills only, one directory each under `skills/`. Invoked by name
or namespace, e.g. `engineering-paved-path:react-best-practices`. It also ships
`engineering-insights` — a **hook-based** skill (always-on when enabled) that captures engineering
pitfalls/insights that `implementation-planner` and `implementer` read back in. (Distinct from
`retro`, which reconstructs run **telemetry**, not these insights.)

```json
{
  "name": "engineering-paved-path",
  "version": "1.0.0",
  "description": "Paved-path engineering skills: React, Next.js, Fastify, architecture, testing, security",
  "author": { "name": "RostK", "email": "rkaniuchenko@gmail.com" }
}
```

### 4.3 `research-tools` (dependency)

Leaf plugin — no `dependencies` (`researcher` preloads no skills).

```json
{
  "name": "research-tools",
  "version": "1.0.0",
  "description": "Read-only researcher agent for codebase and topic investigation",
  "author": { "name": "RostK", "email": "rkaniuchenko@gmail.com" }
}
```

`agents/researcher.md` is read-only by construction — tools `Read, Glob, Grep, Bash, WebSearch,
WebFetch` (no Write/Edit). Already free of DevDigest references.

### 4.4 `architecture-review` (dependency)

**Depends on `engineering-paved-path`** — `architecture-reviewer` preloads `onion-architecture`,
`frontend-ui-architecture`, `zod`, `security`, `typescript-expert` (all from paved-path). It is also
the most DevDigest-bound agent (see §5): its description and body reference `server/**`, `client/**`,
`reviewer-core/**`, `@devdigest/shared`, `@devdigest/ui`, `CLAUDE.md`, `INSIGHTS.md` — all to be
generalized to project-agnostic guidance / explicit inputs.

```json
{
  "name": "architecture-review",
  "version": "1.0.0",
  "description": "Generalized architecture-reviewer agent for design and structure reviews",
  "author": { "name": "RostK", "email": "rkaniuchenko@gmail.com" },
  "dependencies": [
    { "name": "engineering-paved-path", "version": "^1.0.0" }
  ]
}
```

---

## 5. Cross-plugin conventions (packaging rules)

Applied to every component lifted from `dev-digest`:

1. **Namespaced skill calls.** Reference shared skills by `plugin:skill`, e.g. an agent that
   needs React guidance calls `engineering-paved-path:react-best-practices` — never a bare local
   path.
2. **No hardcoded `.claude/skills/…` paths.** Supporting scripts inside a skill are resolved via
   **`${CLAUDE_SKILL_DIR}`** (the running skill's own directory). Plugin-level scripts/binaries use
   **`${CLAUDE_PLUGIN_ROOT}`**. Never traverse outside the plugin root (`../…` is stripped on install).
3. **De-DevDigest every agent *and* skill — no repo-specific paths, packages, or names.** These
   components are **public and project-agnostic**, so across **all** agents and **all** skills remove
   every hardcoded reference and replace it with an explicit input the component requests (or a
   configurable, sensibly-defaulted value). Strip, at minimum:
   - **Directories/files:** `server/**`, `client/**`, `reviewer-core/**`, `specs/**`, `plans/**`,
     `docs/retros/**`, `server/clones/**`, `INSIGHTS.md`, `CLAUDE.md`, `*/README.md` module paths.
   - **Packages/namespaces:** `@devdigest/shared`, `@devdigest/ui`.
   - **MCP tools:** `mcp__devdigest__get_conventions`, `mcp__devdigest__get_blast_radius` (and any
     `mcp__devdigest__*`) — remove from agent `tools:` and from bodies.
   - **Repo-specific commands:** fixed test runners in fixed dirs (`pnpm exec vitest`, `npm test`).
   - **Name/repo mentions:** the strings "DevDigest" / "dev-digest" and the repo URL, anywhere —
     including agent/skill frontmatter `description` (e.g. `architecture-reviewer`'s and
     `spec-creator`'s descriptions both name the repo).

   General stack *conventions* (onion layering, Next.js feature structure, Zod validation, EARS
   acceptance criteria) may stay as guidance — only the **project-bound specifics** go. Where a path
   is genuinely required (spec dir, plan dir, telemetry ledger), expose it as an input with a generic
   default, never a hardcoded DevDigest path.

   **Acceptance gate (must pass before release):**
   ```bash
   git grep -niE 'dev[- ]?digest|@devdigest|reviewer-core|server/clones|INSIGHTS\.md|mcp__devdigest' -- plugins/
   # → must return nothing
   ```
4. **Immutable `name` slugs.** kebab-case; change UI labels via `displayName`, never by renaming.
5. **Strip agent frontmatter unsupported in plugins.** Plugin-shipped agents may **not** set
   `permissionMode`, `mcpServers`, or `hooks`. `spec-creator` currently has `permissionMode: acceptEdits`
   and calls the DevDigest MCP tools `mcp__devdigest__get_conventions` / `get_blast_radius` — remove
   both, and replace the MCP-derived conventions/blast-radius with explicit inputs the agent requests.

### Excluded (not migrated)

Per the release selection: **Product specs**, **Secrets**, **Cache**, and any
**DevDigest-specific instructions**.

---

## 6. The `retro` "workflow" — packaging note

Claude Code plugins have **no dedicated `workflows/` component type** (components are skills,
commands, agents, hooks, MCP/LSP servers, monitors, themes, output-styles). So `retro` is delivered
as a **skill/command** (`skills/retro/SKILL.md`, invoked as `/sdd-engineering:retro`) that
orchestrates the retrospective — internally it may drive multiple steps (optionally via the
`Workflow` tool). Same applies to `run-plan`: it is a skill, not a special component.

`evals/` ships as plain files in the plugin directory for maintainers/CI; they are not auto-loaded
into Claude's context.

---

## 7. Marketplace registration

Add four entries to [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json)
(`pluginRoot: "./plugins"`, so `source` is the plugin's directory name):

```json
{
  "plugins": [
    { "name": "engineering-paved-path", "source": "engineering-paved-path", "version": "1.0.0",
      "description": "Paved-path engineering skills (React, Next.js, Fastify, architecture, testing, security)" },
    { "name": "research-tools", "source": "research-tools", "version": "1.0.0",
      "description": "Read-only researcher agent" },
    { "name": "architecture-review", "source": "architecture-review", "version": "1.0.0",
      "description": "Generalized architecture-reviewer agent" },
    { "name": "sdd-engineering", "source": "sdd-engineering", "version": "1.0.0",
      "description": "Spec-Driven Development engineering workflow" }
  ]
}
```

- Each plugin owns its `name`, `version`, `owner`/`author`, and `source`.
- **Dependencies live in each plugin's `plugin.json`** (mirrorable in the marketplace entry):
  `sdd-engineering` → all three; **`architecture-review` → `engineering-paved-path`**. All `name`s
  resolve **within this marketplace**.
- A commit or tag on the marketplace repo fixes the catalog state.

---

## 8. Versioning & releases

Two layers:

1. **Own version** — each `plugin.json` pins `"version"`. Bump it (semver `MAJOR.MINOR.PATCH`) to
   ship an update; pushing commits without bumping does nothing. Document changes in each plugin's
   **`CHANGELOG.md`** (Keep-a-Changelog style).
2. **Dependency resolution tags** — version ranges like `^1.0.0` resolve against git tags named
   **`{plugin-name}--v{version}`** (e.g. `engineering-paved-path--v1.0.0`). Create them per plugin:

   ```bash
   cd plugins/engineering-paved-path && claude plugin tag --push
   ```

   `claude plugin tag` validates that `plugin.json` and the marketplace entry agree on the version,
   requires a clean tree, and refuses duplicate tags.

> **Release-script model (decided).** [`scripts/release.sh`](../scripts/release.sh) stays the single
> entrypoint but **orchestrates `claude plugin tag`**: it validates the marketplace, then runs
> `claude plugin tag --push` for each changed plugin to emit the per-plugin `{name}--v{version}` tags
> that dependency ranges resolve against. It may keep the umbrella `vX.Y.Z` marketplace tag as a
> catalog snapshot, but the per-plugin tags are what make `^1.0.0` resolvable.

`README.md` (in `sdd-engineering`) documents how the whole suite works together; a top-level
`RELEASES.md` (optional) can aggregate the per-plugin changelogs.

---

## 9. Target directory layout

```
my-monkeys/
├── .claude-plugin/marketplace.json      # 4 registered plugins
└── plugins/
    ├── engineering-paved-path/
    │   ├── .claude-plugin/plugin.json
    │   ├── skills/{react,next,fastify}-best-practices/…
    │   ├── skills/{onion,frontend-ui}-architecture/…
    │   ├── skills/react-testing-library/…
    │   ├── skills/{typescript-expert,zod,drizzle-orm-patterns,postgresql-table-design}/…
    │   ├── skills/security/…  skills/pr-self-review/…
    │   ├── skills/engineering-insights/…   # includes hooks/ (always-on capture)
    │   └── CHANGELOG.md
    ├── research-tools/
    │   ├── .claude-plugin/plugin.json
    │   ├── agents/researcher.md
    │   └── CHANGELOG.md
    ├── architecture-review/
    │   ├── .claude-plugin/plugin.json
    │   ├── agents/architecture-reviewer.md
    │   └── CHANGELOG.md
    └── sdd-engineering/
        ├── .claude-plugin/plugin.json   # dependencies ^1.0.0 × 3
        ├── agents/{spec-creator,implementation-planner,implementer,plan-verifier}.md
        ├── skills/{write-spec,requirements-engineering,plan-implementation}/SKILL.md
        ├── skills/{run-plan,retro}/SKILL.md
        ├── hooks/hooks.json                 # per-step telemetry capture (SubagentStop/Stop)
        ├── scripts/capture-telemetry.mjs    # invoked by the hook via ${CLAUDE_PLUGIN_ROOT}
        ├── evals/
        ├── README.md
        └── CHANGELOG.md
```

---

## 10. Migration steps (ordered)

1. Scaffold the four plugin directories + `plugin.json` manifests; remove the `example-plugin`
   placeholder.
2. Build in dependency order: **`engineering-paved-path`** (base) first, then **`research-tools`** and
   **`architecture-review`** (the latter declares `dependencies: [engineering-paved-path ^1.0.0]`),
   with `sdd-engineering` last.
3. De-DevDigest every agent and skill (§5): strip repo paths/packages/MCP tools/name mentions →
   explicit inputs; switch script refs to `${CLAUDE_SKILL_DIR}` / `${CLAUDE_PLUGIN_ROOT}`; convert
   bare skill calls to `plugin:skill` namespaces.
4. Build `sdd-engineering`: migrate the four agents (merge implementer backend/UI), the five skills
   (`write-spec`, `requirements-engineering`, `plan-implementation`, `run-plan`, `retro`), the
   telemetry capture hook + script, copy `evals`, write README + CHANGELOG, declare `dependencies`.
5. Register all four in `marketplace.json`.
6. **De-DevDigest gate (§5) must return nothing**, then `claude plugin validate .` (add `--strict` in
   CI) and `claude plugin tag --push` per plugin.
7. Smoke test: `claude plugin marketplace add ./` → `claude plugin install sdd-engineering@my-monkeys`
   → confirm the three deps auto-install and `plugin:skill` namespaces resolve.

---

## 11. Decisions & remaining open items

**Decided:**
1. **`engineering-paved-path` skill set** — **decided (a):** ship all preloaded skills, agents kept
   as-is. Final set (13): onion-architecture, frontend-ui-architecture, react-/next-/fastify-best-practices,
   react-testing-library, typescript-expert, zod, drizzle-orm-patterns, postgresql-table-design, security,
   pr-self-review, engineering-insights. `mermaid-diagram` / `dependencies-checker` not shipped v1.
   Paved-path is opinionated to the React/Next/Fastify/Drizzle/Postgres stack. (§3, §4.2)
2. **`run-plan` and `retro`** — `run-plan` ← `implement`: an **orchestrator** (build → review → fix →
   verify → gate) that internally invokes `implementer`, `plan-verifier`, `architecture-reviewer`,
   `/code-review`, `pr-self-review`. `retro` ← **`review-run`** (they are the same "workflow retro"):
   an end-of-run orchestration retrospective. There is **no separate `review-run` skill**. (§3, §4.1)
3. **SDD process skills** — ship `write-spec`, `requirements-engineering`, `plan-implementation` as
   standalone skills (thin-agent model), not embedded. (§3, §4.1)
4. **`architecture-reviewer-lite`** — dropped; one generalized `architecture-reviewer`. (§3)
5. **Releases** — `release.sh` orchestrates `claude plugin tag` per changed plugin. (§8)

**Still open (minor, resolve during migration):**
- Whether `requirements-engineering` stays a separate skill or becomes a reference inside `write-spec`.
- **Decided:** harness telemetry is **captured per-step to a durable ledger via a `SubagentStop`/`Stop`
  hook** (SDD steps run separately, so in-context telemetry is lost); `retro` **aggregates the ledger**
  end-of-run. The hook + capture script are SDD-specific and live in `sdd-engineering`. Remaining detail:
  ledger location/format (`${CLAUDE_PROJECT_DIR}/retros/ledger.jsonl` proposed) and which events to record.
- Final home for `engineering-insights` (in `engineering-paved-path` per current plan; its consumers
  `implementation-planner`/`implementer` live in `sdd-engineering`).
```
