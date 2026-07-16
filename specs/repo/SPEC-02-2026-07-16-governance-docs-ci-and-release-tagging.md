# SPEC-02 — Governance documents, marketplace CI validation, and an authoritative release-tag invariant

- **Spec ID:** SPEC-02
- **Module:** `repo` (cross-cutting: repository root, `.github/`, `docs/`, `scripts/`)
- **Date:** 2026-07-16
- **Status:** approved
- **Owner:** RostK
- **Supersedes:** none

> **Module note.** This is the first spec whose subject is the repository itself rather than a code
> module such as `site`. It is filed under `specs/repo/` per the `specs/<module>/` convention in
> `specs/INDEX.md`.

---

## 1. Problem

`my-monkeys` is a public Claude Code **plugin marketplace** (remote: `https://github.com/RostK/my-monkeys`)
distributing four plugins to third parties. It has grown a real release surface — a published site,
versioned plugin manifests, a dependency graph between plugins, and git tags — but it has **no
contributor-facing governance layer and no machine-enforced release invariant**. Three distinct gaps,
each grounded below.

### 1.1 Missing governance documents (confirmed)

None of the following exist in the repository:

| Path | Exists |
| --- | --- |
| `CONTRIBUTING.md` | no |
| `CODEOWNERS` (root or `.github/`) | no |
| `docs/PLUGIN-GUIDELINES.md` | no |
| `SECURITY.md` | no |
| `RELEASES.md` | no |
| `LICENSE` | **no — yet all four `plugin.json` manifests declare `"license": "MIT"`** |

`.github/` contains **only** `workflows/pages.yml` and `workflows/site-build.yml` — no issue
templates, no PR template, no `CODEOWNERS`.

Consequence: the knowledge needed to contribute a plugin correctly exists today only in `README.md`
(the kebab-case rule, the immutable-`name` rule, the `displayName` rule, the `version` pinning rule)
and in `scripts/release.sh --help`. There is no reviewable contract, no ownership routing, and no
disclosure channel for a repository that ships executable agent instructions to other people's
machines.

> **`LICENSE` is deliberately deferred.** The manifests-declare-MIT-but-no-`LICENSE`-file discrepancy
> is real and is recorded here once, as context. The maintainer has **excluded it from this spec** and
> will handle it separately. See NG-10.

### 1.2 CI: workflows exist, but nothing validates the marketplace

**The premise "there are no GitHub Actions workflows for CI deploy" is false and is not carried into
this spec.** Two workflows exist and are functional:

- **`pages.yml`** — on push to `main` (paths `site/**`, `plugins/**`, `.claude-plugin/marketplace.json`,
  itself) builds `site/` and deploys `site/dist` to GitHub Pages. Has `permissions: contents:read,
  pages:write, id-token:write`, `concurrency: pages`, `configure-pages@v5` with `enablement: true`.
- **`site-build.yml`** — on `pull_request` and on pushes to non-`main` branches (same paths) runs
  `npm ci`, `npm run build`, `npm test`, `npm run check:dist` in `site/`, with `permissions: contents:read`.

Site deploy and site CI are therefore **solved**. The actual delta is the **marketplace catalog
itself**:

1. **No schema validation of `marketplace.json` / `plugin.json` runs in CI.** `claude plugin validate .`
   is invoked in exactly one place — `validate_marketplace()` in `scripts/_common.sh`, from
   `release.sh`/`rollback.sh` — i.e. **locally, at release time, after the change has already
   merged**. Worse, that function *silently degrades*: if the `claude` CLI is absent from `PATH` it
   prints a warning and **returns 0**. On a machine without Claude Code installed, `release.sh` will
   happily tag an invalid marketplace.
2. **Coverage today is incidental, not intentional.** `site-build.yml` *does* trigger on `plugins/**`
   and `marketplace.json`, and `site/scripts/build-index.mjs` reads both (`readJson` at line 28,
   `marketplace.json` at line 97, each `plugins/<name>/.claude-plugin/plugin.json` at line 101). So a
   **JSON syntax error** would likely fail the site build as a side effect. But a *schema*-invalid or
   *semantically* wrong manifest — non-kebab-case `name`, missing `description`, an unsatisfiable
   `dependencies` range, a `source` pointing at a non-existent directory — parses fine and ships.
3. **Version drift between the two manifests is invisible by construction.** Every plugin's version is
   stored **twice**: in `plugins/<name>/.claude-plugin/plugin.json` and in the corresponding
   `.claude-plugin/marketplace.json` entry. Nothing reconciles them. The site indexer at
   `build-index.mjs:105` resolves `const pluginVersion = manifest.version || entry.version || null;`
   — it *prefers* `plugin.json` and silently falls back, so drift renders as a plausible number rather
   than an error. They happen to agree today; nothing keeps them agreeing.
4. `release.sh --plugin <name>` bumps **only** `plugins/<name>/.claude-plugin/plugin.json` (via `jq`,
   line ~90). It **never touches `marketplace.json`**. The tool that exists to bump versions is itself
   a drift source; the two manifests agreeing today is the product of manual effort.

### 1.3 Release tagging: two tag models with two different units, and three untagged releases

The premise "the update to the new version is not recorded by a release tag" is **directionally right
but under-diagnoses the problem**. Tagging is not absent — the repository's **tooling implements a
different tag grammar than the repository's tags use**.

**Model A — what git actually contains** (all four annotated, dated 2026-07-13):

```
architecture-review--v1.0.0
engineering-paved-path--v1.0.0
research-tools--v1.0.0
sdd-engineering--v1.0.0
```

→ a **per-plugin** grammar, `<plugin>--v<semver>`.

**Model B — what the tooling and README implement:** `scripts/release.sh:58` computes `TAG="v$VERSION"`
— a **single repo-wide** `vX.Y.Z` tag. `README.md` § "Release & rollback" documents the same:
*"each release is an annotated tag `vX.Y.Z`"*, `scripts/release.sh 1.0.0`, `scripts/rollback.sh v1.0.0`.

**Resolution (NC-2, maintainer):** these are **not competing models — they are two tag families with
different units, and both are authoritative for their own unit**:

- **Family P (per-plugin)** — `<plugin>--vX.Y.Z`. **This is the release unit.** Each plugin releases
  independently; the four existing tags are exactly this.
- **Family M (marketplace-wide)** — `vX.Y.Z`. A **periodic** tag marking the catalog as a whole. None
  exists yet; that is expected, not a defect.

**The actual bug is narrower than "two models":** `scripts/release.sh:58` computes `TAG="v$VERSION"`
(Family M) for what is really a **per-plugin bump** (`--plugin <name>` edits one plugin's manifest).
The script emits a Family-M tag for a Family-P event. `release.sh`'s duplicate-tag guard
(`git rev-parse --verify refs/tags/$TAG`, line 67) therefore cannot detect an existing
`sdd-engineering--v1.1.1`. Both grammars must be documented in `README.md`, with the rule for when
each applies.

**Grounded version-vs-tag state of every plugin:**

| Plugin | `plugin.json` | `marketplace.json` entry | Newest tag | Released version tagged? |
| --- | --- | --- | --- | --- |
| `engineering-paved-path` | 1.0.0 | 1.0.0 | `engineering-paved-path--v1.0.0` | yes |
| `research-tools` | 1.0.0 | 1.0.0 | `research-tools--v1.0.0` | yes |
| `architecture-review` | **1.1.0** | 1.1.0 | `architecture-review--v1.0.0` | **no — 1.1.0 untagged** |
| `sdd-engineering` | **1.1.1** | 1.1.1 | `sdd-engineering--v1.0.0` | **no — 1.1.1 untagged** |

**Grounded backfill targets (NC-6 — verified against git, not inferred):**

| Plugin | Version | Commit where the manifest first declares it | On `main`? |
| --- | --- | --- | --- |
| `architecture-review` | 1.1.0 | `4f56941` — *"feat(architecture-review): add /version-check command, bump to 1.1.0"* | yes |
| `sdd-engineering` | **1.1.0** | `9bae60a` — *"fix(sdd-engineering): record real usage in the telemetry ledger"* | yes (merged via `a779183`, PR #6) |
| `sdd-engineering` | 1.1.1 | `1cf5ea9` — *"fix(sdd-engineering): stop the telemetry hook inventing agents (#7)"* | yes |

**New finding — there are three untagged shipped versions, not two.** `sdd-engineering` **1.1.0**
existed on `main` at `9bae60a` (both manifests agreed at `1.1.0` there) before `1.1.1` superseded it at
`1cf5ea9`. It was never named in the brief or in the NC-6 answer, which enumerated only
`sdd-engineering` 1.1.1 and `architecture-review` 1.1.0.

**Resolution (NC-12, maintainer): backfill it, at `9bae60a`.** All three get tags (AC-23), and the
Family-P invariant is settled in its **wider** form — *every version that ever shipped* carries a tag,
not merely every currently-released version (AC-22). Being superseded does not forfeit a tag.

**Complete released-version enumeration (verified 2026-07-16 by walking `main`'s first-parent history of
each `plugin.json`).** This closes the "is there a fourth surprise?" question the 1.1.0 finding raised —
there is not; the catalog has released exactly **seven** versions, so AC-23's three tags are provably
sufficient to satisfy AC-22:

| Plugin | Released versions on `main` | Tagged | Backfill needed |
| --- | --- | --- | --- |
| `engineering-paved-path` | 1.0.0 | 1.0.0 | — |
| `research-tools` | 1.0.0 | 1.0.0 | — |
| `architecture-review` | 1.0.0, 1.1.0 | 1.0.0 | **1.1.0 → `4f56941`** |
| `sdd-engineering` | 1.0.0, 1.1.0, 1.1.1 | 1.0.0 | **1.1.0 → `9bae60a`**, **1.1.1 → `1cf5ea9`** |

**Tag targets are authoring commits, not merge commits.** `4f56941` reached `main` via merge `c143d3c`
(PR #5) and `9bae60a` via merge `a779183` (PR #6); `1cf5ea9` sits on the first-parent line directly. All
three are reachable from `main` and declare the version they will be tagged with (each verified by
`git show <sha>:plugins/<name>/.claude-plugin/plugin.json`), which is what AC-22 requires. See AC-23's
placement note.

`git log --decorate` shows **no tag on any commit since 2026-07-13**. Users consuming this marketplace
by ref, and the `architecture-review:version-check` command (which exists precisely to confirm an
update landed), have no immutable point to resolve.

---

## 2. Goals

- **G1.** A newcomer can contribute a correct plugin — and a maintainer can review it — from documents
  in the repository, without reading `scripts/*.sh` or reverse-engineering `README.md`.
- **G2.** A change to `plugins/**` or `.claude-plugin/marketplace.json` is **validated in CI on the PR**,
  before merge, rather than locally at release time after merge.
- **G3.** The plugin-version-to-git-tag relationship is a **stated, checkable invariant**, with each tag
  family's grammar and unit defined once and implemented consistently by the tags, the scripts, and the
  docs.
- **G4.** Every plugin version that has **ever** shipped on `main` — not merely each plugin's current one
  — becomes resolvable at an immutable ref pointing at the commit where it actually shipped, including
  versions since superseded (NC-12).
- **G5.** Security reports have a documented, non-public intake path.
- **G6.** Version drift between `plugin.json` and `marketplace.json` becomes **structurally impossible**
  (generated), not merely detected.

## 3. Non-goals

- **NG-1.** Rewriting, replacing, or porting `pages.yml` / `site-build.yml`. They work; this spec only
  *adds* checks alongside them. Site build/test/dist-budget behaviour is out of scope.
- **NG-2.** Publishing to any registry other than this git repository (no npm, no OCI). Distribution
  stays `/plugin marketplace update`.
- **NG-3.** Changing any plugin's *functional* behaviour, skills, agents, or commands.
- **NG-4.** Rewriting git history, moving, or deleting existing tags. Backfill is additive only.
- **NG-5.** Adopting a Conventional-Commits gate, a commit-lint, or automated semver *inference* from
  commit messages. Version numbers stay human-chosen.
- **NG-6.** Issue/PR templates, a Code of Conduct, a discussions setup, or branch-protection
  configuration (not a repository file; not settable by a spec).
- **NG-7.** Signing tags (GPG/SSH) or provenance attestation.
- **NG-8.** Retro-documenting the history of releases 1.0.0→1.1.1 in narrative form beyond what the
  tag/version record and `RELEASES.md` (AC-10) require.
- **NG-9.** Auto-generating `docs/PLUGIN-GUIDELINES.md` from the manifests, or building a manifest
  JSON-Schema artifact for third-party reuse.
- **NG-10.** **Adding a `LICENSE` file, or resolving the manifests-declare-MIT-but-no-`LICENSE`
  discrepancy.** Explicitly excluded by the maintainer (NC-9); it will be handled outside this spec. No
  requirement here may add, imply, or depend on a `LICENSE` file. §1.1 records the discrepancy as
  known-and-deferred context only.
- **NG-11.** Validating anything beyond JSON shape and the repo-local structural rules in AC-16/AC-33/
  AC-34 — specifically **not** skill/agent markdown frontmatter validity and **not** `hooks/hooks.json`
  semantics. `claude plugin validate` covers these; the chosen CI validator (AC-15) does not. This
  boundary is stated because the gap is real, not because it is unimportant. See PI-10.
- **NG-12.** Cutting the first Family-M (`vX.Y.Z`) marketplace tag. This spec defines the grammar and
  the invariant for that family (AC-17, AC-38); *when* to cut one is a maintainer act.

## 4. User stories

- **US-1.** *As an external contributor*, I want a single document that tells me how to add a plugin,
  what the manifest rules are, and how my PR will be judged, so that my first PR is mergeable.
- **US-2.** *As the maintainer*, I want CI to reject a malformed manifest on the PR, so that a broken
  catalog never reaches `main` and never reaches users via `/plugin marketplace update`.
- **US-3.** *As the maintainer*, I want each tag family's grammar and unit defined once and implemented
  by both git and `scripts/`, so that `release.sh` cannot emit a repo-wide tag for a per-plugin bump.
- **US-4.** *As a plugin consumer*, I want every released version to resolve to an immutable tag, so
  that I can pin, diff, and verify what `/version-check` reports.
- **US-5.** *As a security researcher*, I want a documented private disclosure channel, so that I do
  not have to open a public issue describing a flaw in code that runs on users' machines.
- **US-6.** *As the maintainer*, I want a plugin's version recorded in exactly one editable place, so
  that I cannot ship a catalog whose two manifests disagree.

---

## 5. Acceptance criteria

### 5.1 Governance documents

- **AC-1.** The repository shall contain `CONTRIBUTING.md` at the root.
  *Verify:* `test -f CONTRIBUTING.md`.
- **AC-2.** `CONTRIBUTING.md` shall document the local verification loop that `README.md` already
  names — `claude plugin validate .`, `claude plugin marketplace add ./`,
  `claude plugin install <name>@my-monkeys` — and state which CI checks gate a PR.
  *Verify:* each of the three commands appears verbatim; the named checks match the job names in
  `.github/workflows/*.yml`.
- **AC-3.** `CONTRIBUTING.md` shall state the repository-specific rules currently only in `README.md`:
  kebab-case `name`, `name` immutable once published, relabel via `displayName`, and the `version`
  pin-vs-omit semantics.
  *Verify:* review against `README.md` § Notes — all four rules present, none contradicting it.
- **AC-4.** The repository shall contain a `CODEOWNERS` file at a path GitHub honours
  (`.github/CODEOWNERS`, root, or `docs/`) whose entire content is the blanket rule `* @RostK`.
  *Verify:* file exists at an honoured path and contains exactly one non-comment line, `* @RostK`;
  GitHub shows `@RostK` as owner on a test PR touching any path.
- **AC-5.** Every pattern in `CODEOWNERS` shall match at least one existing tracked path, and every
  named owner shall have write access to the repository.
  *Verify:* for each pattern, `git ls-files <pattern>` is non-empty; GitHub reports no "Unknown owner"
  / "not a collaborator" annotation on the file.
- **AC-6.** The repository shall contain `docs/PLUGIN-GUIDELINES.md` defining the quality bar for a
  plugin in **this** marketplace: required `plugin.json` fields as actually used by all four existing
  manifests (`name`, `displayName`, `version`, `description`, `author`, `keywords`, `license`,
  optional `dependencies`), the `skills/<skill>/SKILL.md` + `commands/<cmd>.md` + `agents/<agent>.md`
  layout, description-writing rules for skill triggering, and the inter-plugin `dependencies` semver-range
  rule.
  *Verify:* each of the four manifests under `plugins/*/.claude-plugin/plugin.json` conforms to the
  documented field list; the layout matches `README.md` § Structure.
- **AC-7.** `docs/PLUGIN-GUIDELINES.md` shall state that a plugin declaring `dependencies` must name
  only plugins present in `.claude-plugin/marketplace.json`, with a range satisfied by that plugin's
  current version.
  *Verify:* `architecture-review` (`engineering-paved-path ^1.0.0`) and `sdd-engineering`
  (`engineering-paved-path ^1.0.0`, `research-tools ^1.0.0`, `architecture-review ^1.0.0`) both satisfy
  the stated rule against the current catalog.
- **AC-8.** The repository shall contain `SECURITY.md` naming **GitHub Private Vulnerability Reporting
  as the sole intake channel**, and stating the supported-version policy of AC-31.
  *Verify:* `test -f SECURITY.md`; GitHub renders the "Security policy" tab; the document points to the
  repository's PVR "Report a vulnerability" flow and does **not** direct reporters to
  `rkaniuchenko@gmail.com` or to a public issue.
- **AC-8a.** `SECURITY.md` shall describe triage as **best-effort by a solo maintainer** and shall state
  **no numeric acknowledgement or response commitment** — no "within N days/hours", no SLA, no
  time-bounded promise of any kind.
  *Verify:* review of the document's text (this AC constrains what `SECURITY.md` **says**, not how fast
  anyone actually responds — response timing is not a testable property of this repository): the triage
  language is present and conveys best-effort; and no duration appears anywhere in a
  response/acknowledgement claim. Mechanically: no match for a time-window pattern (e.g.
  `/within\s+\d+\s+(hour|day|week|business)/i`, `\d+\s*(h|hrs|hours|days|weeks)` in a triage sentence)
  in `SECURITY.md`. A stated supported-version policy (AC-31) is not a timing claim and is unaffected.
  *Rationale (NC-11, maintainer):* a solo maintainer cannot guarantee a window, and a promise that gets
  broken is worse than no promise.
- **AC-9.** `SECURITY.md` shall state the marketplace's trust model explicitly: installing a plugin
  from this marketplace executes its skills, agents, commands, and hooks in the user's Claude Code
  session with that user's permissions.
  *Verify:* review — the statement is present and names the hook/agent execution surface (grounded:
  `sdd-engineering` ships a `SubagentStop`/`Stop` telemetry hook).
- **AC-10.** The repository shall contain `RELEASES.md` in **Keep a Changelog** format, **hand-written**,
  **grouped into one section per plugin**, recording for each release the version, its Family-P git tag,
  and the user-visible change in prose.
  *Verify:* the file declares the Keep a Changelog convention; it has one top-level section per plugin in
  `.claude-plugin/marketplace.json`; every Family-P tag in `git tag -l` has an entry under its plugin's
  section, and every entry names a tag that exists. Generated commit dumps do not satisfy this AC.
- **AC-11.** `RELEASES.md` shall cover **exactly** the plugin versions that are evidenced in git history
  — no invented entries, and none of the seven omitted. Per AC-22's released-version enumeration, that is
  all **seven**: `engineering-paved-path` 1.0.0, `research-tools` 1.0.0, `architecture-review` 1.0.0 and
  1.1.0, `sdd-engineering` 1.0.0, **1.1.0**, and 1.1.1. It shall record that `architecture-review` 1.1.0,
  `sdd-engineering` 1.1.0, and `sdd-engineering` 1.1.1 each shipped before they were tagged, and shall
  mark `sdd-engineering` 1.1.0 as **superseded by 1.1.1** (NC-12 option (c)).
  *Verify:* the set of versions named in `RELEASES.md` equals AC-22's enumeration exactly (no more, no
  fewer); every version named is declared by that plugin's `plugin.json` at some commit reachable from
  `main` (`git log -p -- plugins/<name>/.claude-plugin/plugin.json`); the ship-before-tag note is present
  for all three; the superseded marker is present on `sdd-engineering` 1.1.0.
- **AC-12.** All five documents shall be written in English.
  *Verify:* review (repo convention: all marketplace + UI text is English).
- **AC-13.** `README.md` shall link to `CONTRIBUTING.md`, `docs/PLUGIN-GUIDELINES.md`, `SECURITY.md`,
  and `RELEASES.md`.
  *Verify:* all four links present and resolving.
- **AC-14.** No governance document shall restate either tag grammar in a way that contradicts
  `scripts/release.sh` or the tags in `git tag -l`.
  *Verify:* each grammar string appears in exactly one normative place (per AC-17); every other mention
  links to it. This AC exists because that contradiction is live today (§1.3).

### 5.2 CI validation

- **AC-15.** When a pull request changes `.claude-plugin/marketplace.json` or any file under
  `plugins/**`, the CI shall validate `.claude-plugin/marketplace.json` against
  `https://json.schemastore.org/claude-code-marketplace.json` and every
  `plugins/*/.claude-plugin/plugin.json` against
  `https://json.schemastore.org/claude-code-plugin-manifest.json` using **`ajv`** (draft-07), and report
  it as a status check distinct from `Site build / build`.
  *Verify:* open a PR touching `plugins/**`; two separately-named checks appear, and the new one's log
  names both schema URLs and all four plugin manifests. The workflow shall **not** install or invoke the
  `claude` CLI (rationale: §7 D-1).
- **AC-16.** If `.claude-plugin/marketplace.json` or any `plugins/*/.claude-plugin/plugin.json` fails
  its AC-15 schema, then the validation check shall fail with a non-zero exit and name the offending
  file and JSON pointer.
  *Verify:* on a scratch branch, delete `marketplace.json`'s required `owner.name`, and separately
  delete a `plugin.json`'s required `name` → check fails in both cases, naming the file and path;
  revert → passes. At least one of these error classes must be one the site build tolerates today
  (§1.2.2).
- **AC-17.** The repository shall define **two** release tag families, each authoritative for its own
  unit, each stated in exactly one normative location:
  - **Family P — per-plugin release (the release unit):** `<plugin>--vX.Y.Z`, where `<plugin>` is the
    plugin's `name` in `.claude-plugin/marketplace.json` and `X.Y.Z` is that plugin's `plugin.json`
    version. Cut whenever a plugin's version changes.
  - **Family M — marketplace-wide snapshot:** `vX.Y.Z`, marking the catalog as a whole. Cut
    periodically; carries no claim about any individual plugin's version.

  Neither family supersedes the other, and no document may present one as replacing the other.
  *Verify:* every tag in `git tag -l` matches exactly one family's grammar; `README.md` documents both
  families **and the rule for when each applies**; `scripts/release.sh`, `scripts/rollback.sh`, and
  `RELEASES.md` conform; no document states a third grammar or calls either family legacy.
- **AC-18.** The `version` field of every entry in `.claude-plugin/marketplace.json` shall be
  **generated** from the corresponding `plugins/<name>/.claude-plugin/plugin.json`, which is the single
  authoritative source. No workflow, script, or documented procedure shall instruct a human to edit a
  `marketplace.json` `version` by hand.
  *Verify:* a generator exists and is the only writer of those fields; running it on a clean tree is a
  no-op (`git diff --exit-code`); `CONTRIBUTING.md` and `docs/PLUGIN-GUIDELINES.md` tell contributors to
  bump `plugin.json` only.
- **AC-19.** The **validation** workflow shall declare least-privilege permissions, granting no more
  than `contents: read`.
  *Verify:* the workflow's `permissions:` block matches `site-build.yml`'s (`contents: read`).
- **AC-20.** The validation workflow shall not expose repository secrets or a writable `GITHUB_TOKEN`
  to code originating from a fork's pull request.
  *Verify:* the workflow triggers on `pull_request` (not `pull_request_target`); no `secrets.*` is
  referenced in any step that runs contributor-supplied code; no PR-controlled string (title, branch
  name, body) is interpolated into a `run:` block.
- **AC-21.** `scripts/_common.sh :: validate_marketplace()` shall **hard-fail** when it cannot run
  validation, rather than warning and returning 0.
  *Verify:* run `release.sh --dry-run` in an environment where the validator cannot run → non-zero exit
  before any tagging step (current behaviour: prints a warning and continues). The `command -v claude`
  fail-open branch is removed; `ajv` has no PATH-or-auth dependency that would justify degrading.
  `SKIP_VALIDATE=1` remains the single explicit, deliberate opt-out.

### 5.3 Release versioning and tagging invariant

- **AC-22.** **Family-P invariant (NC-12 — wider form: every version that ever shipped, not merely every
  current one).** For every plugin `P` in `.claude-plugin/marketplace.json` and **every version `V` that
  `P` has ever released**, an annotated git tag `P--vV` shall exist and point at a commit reachable from
  `main` at which `P`'s `plugin.json` declares `V`. A version is **released** iff `P`'s `plugin.json`
  declares it at some commit on `main`'s **first-parent** line — i.e. `V` was the catalog's current
  version for some interval on `main`. Superseding a version does not retire its tag: once released,
  always tagged.
  *Verify:* for each plugin, enumerate its released versions —
  `for c in $(git log --first-parent --format=%H main -- plugins/<name>/.claude-plugin/plugin.json)`,
  reading `version` at each — and assert every one resolves to an annotated `<name>--v<version>` whose
  commit's manifest declares that version. Grounded enumeration (verified 2026-07-16): exactly **seven**
  released versions exist across the catalog — `engineering-paved-path` 1.0.0, `research-tools` 1.0.0,
  `architecture-review` 1.0.0 + 1.1.0, `sdd-engineering` 1.0.0 + 1.1.0 + 1.1.1. Four are tagged; the
  three of AC-23 violate this AC today.
  *Scope note:* the selection rule is deliberately `main`'s first-parent line, not "any reachable
  commit". A version that existed only on an intra-PR commit and was superseded before its PR merged was
  never the catalog's current version and reaches no user, so it is **out of** the invariant rather than
  in violation of it — the same treatment EC-2 gives a version-less plugin. Tag *placement* (AC-23) may
  still be an authoring commit off the first-parent line, since AC-22 requires only reachability.
- **AC-23.** The untagged released versions shall satisfy AC-22, tagged at the **historical commit where
  each version actually shipped** — **three** tags (NC-12; all SHAs and manifest versions verified
  against git 2026-07-16, §1.3):
  - `architecture-review--v1.1.0` at `4f56941` (`4f569417c433e9890349410e4bf5316f4e87b0ef`)
  - `sdd-engineering--v1.1.0` at `9bae60a` (`9bae60a325f61c9411900d39d028286112c52bf6`)
  - `sdd-engineering--v1.1.1` at `1cf5ea9` (`1cf5ea9ac330b5506a226951a08690c541e5d548`)

  Tags shall not be placed at current `main`, and the versions shall not be rolled forward into new
  numbers.
  *Verify:* `git rev-parse <tag>^{commit}` equals each SHA above; `git show <tag>:plugins/<name>/.claude-plugin/plugin.json`
  declares the tag's version (verified true at all three today); `git tag -l` grows from 4 to **exactly
  7**, at which point AC-22 holds for the whole catalog.
  *Placement note:* `4f56941` and `9bae60a` are the **authoring** commits, each merged to `main` via a
  merge commit (`c143d3c`/PR #5 and `a779183`/PR #6 respectively); `1cf5ea9` is on `main`'s first-parent
  line directly. All three are reachable from `main` and declare the tagged version, so all three satisfy
  AC-22. The authoring commit is chosen over the merge commit per NC-6's "tag the historical commits
  where each version actually shipped". This is a deliberate asymmetry with AC-36, which tags *future*
  releases at the merge commit — that is what CI can observe at the time; both placements satisfy AC-22.
- **AC-24.** Every release tag shall be an **annotated** tag object, not a lightweight ref.
  *Verify:* `git for-each-ref --format='%(objecttype)' refs/tags` returns `tag` for all — matching the
  four existing tags, which are already annotated.
- **AC-25.** When a per-plugin release is cut, `scripts/release.sh` shall create a **Family-P** tag
  `<plugin>--v<version>`, never `v<version>`.
  *Verify:* `scripts/release.sh 1.2.0 --dry-run --plugin sdd-engineering` prints
  `sdd-engineering--v1.2.0`. Today line 58 unconditionally computes `TAG="v$VERSION"` — the Family-M
  grammar — for what is a per-plugin event; that is the defect.
- **AC-26.** When `scripts/release.sh` is asked to create a tag that already exists, it shall refuse.
  *Verify:* `scripts/release.sh 1.1.1 --plugin sdd-engineering` after AC-23's backfill → non-zero exit
  naming `sdd-engineering--v1.1.1`. The existing guard at line 67 checks only the Family-M name and must
  check the AC-17 grammar for the family being cut to remain effective.
- **AC-27.** If a plugin's manifest version does not match the version being released, then the release
  shall not proceed silently.
  *Verify:* invoke `release.sh` for a version differing from `plugin.json`'s without `--plugin` → the
  mismatch is surfaced, not tagged over.
- **AC-28.** `scripts/rollback.sh` shall accept and resolve tags in **either** AC-17 family.
  *Verify:* `scripts/rollback.sh sdd-engineering--v1.0.0 --dry-run` resolves; the README example is
  updated to a tag that actually exists (today it shows `v1.0.0`, which does not).
- **AC-29.** The release documentation shall state where a released version is recorded — `plugin.json`
  (authoritative), the generated `marketplace.json` entry, the Family-P tag, and `RELEASES.md` — and
  that `plugin.json` is authoritative.
  *Verify:* review — `README.md`, `CONTRIBUTING.md`, and `docs/PLUGIN-GUIDELINES.md` all name
  `plugin.json` as the source of truth; no document instructs a hand-edit of a `marketplace.json`
  version (AC-18); no two documents disagree.
- **AC-30.** When a pull request changes any `plugins/<name>/.claude-plugin/plugin.json` `version`, CI
  shall fail if the committed `.claude-plugin/marketplace.json` differs from the AC-18 generator's
  output.
  *Verify:* bump `plugin.json` only, commit without regenerating → check fails, naming both paths and
  the diff; regenerate and commit → passes. (Rationale: the drift is currently unobservable —
  `build-index.mjs:105` falls back silently.)
- **AC-31.** `SECURITY.md` shall state that **only the latest version of each plugin** receives security
  fixes, with no backports to earlier versions.
  *Verify:* the policy is stated per plugin and names no supported version other than each plugin's
  current one. It may note as context that `engineering-paved-path` is a dependency of
  `architecture-review` and `sdd-engineering`; that relationship shall **not** be stated as widening the
  support window.
- **AC-32.** GitHub Private Vulnerability Reporting shall be enabled on the repository.
  *Verify:* the repository's Settings → Security → "Private vulnerability reporting" is enabled, and the
  "Report a vulnerability" button appears on the Security tab. (Repository setting, not a file — AC-8's
  document is inert without it.)
- **AC-33.** The AC-15 validation shall fail if any `source` in `.claude-plugin/marketplace.json` does
  not resolve to an existing directory **within the repository** containing a
  `.claude-plugin/plugin.json`.
  *Verify:* on a scratch branch set a `source` to `../outside`, then to `./plugins/does-not-exist` →
  check fails in both cases; revert → passes. (`..`-traversal and absolute/symlinked paths are rejected;
  UT-3. `ajv` does not cover this — it is a separate repo-local rule.)
- **AC-34.** The AC-15 validation shall fail if two entries in `.claude-plugin/marketplace.json` declare
  the same `name`.
  *Verify:* duplicate an entry's `name` on a scratch branch → check fails naming both indices; revert →
  passes. (`ajv` does not cover this.)
- **AC-35.** `site/scripts/build-index.mjs` shall not silently substitute one manifest's version for the
  other's.
  *Verify:* `build-index.mjs:105`'s `manifest.version || entry.version || null` no longer falls back
  across sources: with `plugin.json` and the `marketplace.json` entry disagreeing, the indexer fails or
  reports the drift rather than rendering a plausible number. (This is the last silent-drift path once
  AC-18 lands; it is in scope because NC-7 made `plugin.json` authoritative. NG-1 is unaffected — no
  workflow changes.)
- **AC-36.** Tagging shall be **automated in CI**: when a pull request merges to `main` having changed a
  plugin's `version` in `plugins/<name>/.claude-plugin/plugin.json`, the CI shall create and push the
  annotated Family-P tag `<name>--v<new-version>` at the merge commit.
  *Verify:* merge a PR bumping one plugin → the tag exists at the merge commit within that run and
  satisfies AC-22 and AC-24; merge a PR touching no `version` → no tag is created.
- **AC-37.** The tagging job shall be granted `contents: write`, scoped to **that job only** and not at
  workflow level, and shall run only on `push` to `main` — never on `pull_request` or
  `pull_request_target`.
  *Verify:* the workflow declares no top-level `permissions:` broader than `contents: read`; exactly one
  job declares `permissions: contents: write`; that job's `if:` restricts it to `main`. This elevation is
  a **deliberate, accepted trade-off** against the least-privilege posture of AC-19/NF-1 — the price of
  NC-3's automation decision — and is confined to the smallest unit GitHub allows.
- **AC-38.** **Family-M invariant.** A `vX.Y.Z` tag shall be an annotated tag pointing at a commit
  reachable from `main`, and shall imply nothing about any individual plugin's version.
  *Verify:* no `vX.Y.Z` tag is created by the per-plugin path (AC-25) or by the AC-36 automation; no
  document asserts that `vX.Y.Z` names a plugin's release. (No Family-M tag exists yet — NG-12; this AC
  constrains the first one.)

---

## 6. Edge cases

- **EC-1.** A plugin is added to `plugins/**` but never registered in `marketplace.json` (or vice
  versa) — orphan in one direction. **Listed-but-missing** is now an error (AC-33). **Present-but-
  unlisted** is tolerated: the site indexer walks from `marketplace.json`, so the directory is simply
  invisible and reaches no user. Directional asymmetry is intentional.
- **EC-2.** `plugin.json` omits `version` entirely. `README.md` documents this as legal ("Omit `version`
  … to treat every git commit as a new version"), and the schema makes `version` optional (only `name`
  is required). AC-22's Family-P invariant is undefined for such a plugin — no released version means
  nothing to tag — and AC-18 has nothing to generate. All four plugins currently set it. NC-7 resolved
  the source-of-truth question but not whether omission stays permitted → the invariants are written to
  apply per plugin *that declares a version*, so an omitting plugin is out of the invariant rather than
  in violation of it.
- **EC-3.** A dependency range becomes unsatisfiable — e.g. `engineering-paved-path` majors to 2.0.0
  while three plugins pin `^1.0.0`. Nothing detects this today; AC-15's `ajv` check will not either
  (`dependencies` is shape-valid). AC-7 documents the rule; PI-4 proposes enforcing it.
- **EC-4.** Two plugins are bumped in one PR. **Resolved by AC-17:** the release unit is per-plugin, so
  this produces **two** Family-P tags, one per plugin, both at the merge commit (AC-36). It is not one
  release, and it does not imply a Family-M tag.
- **EC-5.** A release is tagged and then a defect is found — `rollback.sh` restores a prior tag as a
  forward commit (non-destructive, per README), leaving a tag whose version is no longer on `main`'s
  tip. AC-22 requires only "a commit reachable from `main` at which the manifest declares V", which a
  rolled-back release still satisfies; this is intentional.
- **EC-6.** A fork PR modifies a workflow file; `pull_request` runs the *base* workflow definition, so
  a malicious change cannot self-approve — but AC-20's no-`pull_request_target` rule and AC-37's
  push-only tagging job are what preserve that property. A fork PR must never reach the `contents: write`
  job.
- **EC-7.** A PR touches only `docs/` or `CONTRIBUTING.md`. Neither existing workflow's path filter
  matches, so no check runs at all; the PR shows zero status checks.
- **EC-8.** The SchemaStore schemas are community-maintained and versionless at their URL: they may
  change under the repository, and they may lag or lead what `claude plugin validate` actually enforces.
  A manifest can then pass CI and fail the CLI (or the reverse). Fetching them at run time also makes CI
  depend on a third-party host's availability. This is the accepted cost of NC-10's decision (§7 D-1);
  PI-11 proposes vendoring.
- **EC-9.** `release.sh` requires `jq` for `--plugin` and dies without it; a CI runner or contributor
  machine lacking `jq` cannot bump. AC-18's generator and AC-36's tagging job inherit this dependency.
- **EC-10.** A backfilled tag is placed at a commit whose manifest version differs from the tag
  (mis-targeted backfill), permanently cementing a false claim, since tags are not to be moved (NG-4).
  AC-23 pins exact commit SHAs verified against the manifests at those commits, and AC-22's verify step
  re-checks the claim, precisely to prevent this.
- **EC-11.** A version reaches `main` and is superseded before any tag is cut — exactly what happened to
  `sdd-engineering` 1.1.0 at `9bae60a` (§1.3). **Resolved by NC-12 in AC-22's wider form:** being
  superseded does not forfeit a tag, so 1.1.0 is backfilled at `9bae60a` (AC-23) and marked superseded in
  `RELEASES.md` (AC-11). Under AC-36 this cannot recur — tagging fires on each merge that bumps a
  version, so a version is tagged while it is current rather than retrospectively.
- **EC-12.** AC-36's tagging job runs on a merge to `main` that bumps a version, but the push fails or
  the job errors after the tag is created locally. The tag either does not exist (invariant AC-22
  violated silently until the next run) or exists unpushed. Re-running must be safe — AC-26's refuse-on-
  existing-tag behaviour makes a retry non-destructive but also non-repairing. **Sharpened by NC-12's
  wider invariant:** if that version is superseded before anyone notices, a job that reconciles only
  *current* versions can never heal the gap — the miss is permanent, and repairing it means a manual
  backfill exactly like AC-23's. This is the general form of the incident AC-23 exists to clean up. See
  PI-13, PI-14.
- **EC-13.** A single PR bumps a plugin twice — e.g. 1.2.0 in one commit, then 1.2.1 in a later commit —
  and merges. Both commits become reachable from `main`, but only 1.2.1 was ever the catalog's current
  version; 1.2.0 reached no user. AC-22's first-parent selection rule puts 1.2.0 **out of** the invariant,
  and AC-36 tags only 1.2.1 at the merge commit. This is the boundary of "every version that ever
  shipped": reachable-but-never-current is not shipped. Contrast `sdd-engineering` 1.1.0, which *was*
  current on `main` for seven commits and therefore is in (EC-11).

## 7. Assumptions and dependencies

- **A-1.** The remote is GitHub (`https://github.com/RostK/my-monkeys`), so GitHub-native conventions
  apply: `CODEOWNERS` at an honoured path, `SECURITY.md` surfacing the Security tab, Private
  Vulnerability Reporting (AC-32), GitHub Actions.
- **A-2.** The repository is public, or intended to be — `pages.yml` sets `enablement: true` with the
  comment "once the repo is public". PVR (AC-32) is available on public repositories.
- **A-3.** `main` is the release branch. Grounded: `ensure_branch "$MAIN_BRANCH"` with
  `MAIN_BRANCH=${MAIN_BRANCH:-main}` in `release.sh`.
- **A-4.** The four existing annotated tags are intentional and authoritative — NC-2 confirmed them as
  Family P, the release unit — and they are **not to be deleted** (NG-4).
- **A-5.** Semver is the versioning scheme. Grounded: `release.sh` enforces
  `^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$`.
- **A-6.** The scripts are Bash and run in Git Bash on Windows (the maintainer's platform) or on
  Linux/CI, per `README.md`.
- **A-7.** There is **no root `package.json`** (verified: the only one is `site/`'s). The AC-15 `ajv`
  check and the AC-18 generator therefore need a runtime home — a root dev-dependency, an `npx` call, or
  placement under `site/` — which is a **HOW** decision left to the implementation plan.
- **D-1.** **Resolved (NC-10): CI depends on `ajv` and the two published SchemaStore JSON Schemas, not
  on the `claude` CLI.**
  - `claude plugin validate` is real, documented, supports `--strict` (which the docs recommend for CI),
    and validates more than JSON shape — marketplace.json, local-path plugin.json, skill/agent
    frontmatter, and `hooks/hooks.json`
    ([plugin-marketplaces](https://code.claude.com/docs/en/plugin-marketplaces),
    [plugins-reference](https://code.claude.com/docs/en/plugins-reference)).
  - **It is nonetheless rejected for CI**, on three grounded risks: no official documentation states any
    subcommand can run without completing interactive onboarding/login; there is a first-run
    onboarding/trust gate in `$HOME/.claude.json` (`hasCompletedOnboarding`, `hasTrustDialogAccepted`);
    and [anthropics/claude-code#9026](https://github.com/anthropics/claude-code/issues/9026) reports the
    CLI hanging with no TTY (closed "not planned"). Its exit-code contract (0 pass / non-zero fail) is
    also **undocumented** — `_common.sh`'s `|| die` rests on an inference. No official Action wraps
    `plugin validate`; `anthropics/claude-code-action` is a PR bot needing an API key, not a CLI lint.
  - **The schemas** are the ones Anthropic's own `.claude-plugin/marketplace.json` references via
    `"$schema"` (verified at
    [raw.githubusercontent.com/anthropics/claude-code](https://raw.githubusercontent.com/anthropics/claude-code/main/.claude-plugin/marketplace.json)):
    [claude-code-marketplace.json](https://json.schemastore.org/claude-code-marketplace.json) (draft-07;
    required: `name`, `owner.name`, `plugins`) and
    [claude-code-plugin-manifest.json](https://json.schemastore.org/claude-code-plugin-manifest.json)
    (draft-07; required: `name`; documents `version`, `dependencies`, `hooks`, `commands`, `agents`,
    `skills`).
  - **Reliability: Medium — Anthropic-*referenced*, not Anthropic-*hosted*.** SchemaStore is
    community-run. This is a real dependency on a third party (EC-8, PI-11).
  - **Coverage gap, stated plainly:** `ajv` checks JSON shape only. It does **not** catch skill/agent
    frontmatter validity, `hooks.json` semantics, duplicate plugin names, or `..` path traversal.
    Duplicate names and traversal are recovered as explicit repo-local rules (AC-34, AC-33); frontmatter
    and hooks are **not covered by this spec** (NG-11, PI-10).
- **D-2.** Depends on `.claude-plugin/marketplace.json` remaining the catalog root — `pages.yml`,
  `site-build.yml`, and `build-index.mjs:97` all hard-code that path.
- **D-3.** AC-32 (PVR) and AC-37's `contents: write` are **repository settings/permissions**, not files.
  They cannot be delivered by a commit alone and need a maintainer action in the GitHub UI (PVR) plus a
  workflow-level grant that only the repository owner can authorise.

## 8. Non-functional requirements

- **NF-1 (security).** The **validation** workflow follows `site-build.yml`'s least-privilege posture
  (`permissions: contents: read`) and never grants a fork's code secrets or write scope (AC-19, AC-20).
- **NF-1a (security — accepted exception).** The **tagging** job (AC-36) requires `contents: write` on
  `GITHUB_TOKEN`. This is a **deliberate, maintainer-accepted trade-off**, not an open concern: it is the
  cost of NC-3's "automate tagging on merge" decision. It is bounded by AC-37 — job-scoped (never
  workflow-level), `push`-to-`main` only, never reachable from a fork PR (EC-6).
- **NF-2 (security/trust).** This marketplace ships executable instructions and at least one hook
  (`sdd-engineering`'s telemetry `SubagentStop`/`Stop` hook). `SECURITY.md` must state this trust model
  plainly (AC-9) rather than implying the artifacts are inert documentation.
- **NF-3 (supply chain).** Validation actions are pinned in the manner already used by the repo
  (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/configure-pages@v5`, `actions/deploy-pages@v4`
  — major-version tags). Consistency with existing practice is the bar; see PI-5. The `ajv` dependency
  and the two remote schemas are themselves supply-chain inputs (EC-8, PI-11).
- **NF-4 (performance).** The validation check should not materially slow the PR loop; it is a
  manifest-scale JSON check over five files, and must not become a second full `site/` build.
- **NF-5 (i18n).** All documents English (AC-12), per repo convention.
- **NF-6 (legal).** All four manifests declare `"license": "MIT"` with no `LICENSE` file present — the
  repository asserts a license it does not ship. **Recorded as known and deliberately deferred; out of
  scope for this spec** (NG-10). No AC addresses it.
- **NF-7 (accessibility).** Not applicable — no UI surface is touched (NG-1); AC-35 changes indexer
  behaviour, not rendering.

## 9. Inputs and provenance

| Input | Provenance |
| --- | --- |
| The five missing documents; "no CI deploy workflows"; "the update is not recorded by a release tag" | Maintainer's verbatim feature request (Ukrainian), 2026-07-16, relayed in the authoring brief. |
| CONTRIBUTING/CODEOWNERS/SECURITY/RELEASES/PLUGIN-GUIDELINES absent; no `LICENSE` | Verified directly: `ls` of repo root, `ls docs/`, `find .github -type f`. |
| **Correction:** `pages.yml` + `site-build.yml` exist and work | Verified directly by reading both files; contradicts the request's CI premise. Recorded in §1.2. |
| **Correction:** two plugins untagged, not one (`architecture-review` 1.1.0 also) | Verified: `git tag -l` × all four `plugin.json` + `marketplace.json` entries. The brief named only `sdd-engineering`. |
| **New finding:** `release.sh` emits a Family-M `vX.Y.Z` tag for a per-plugin bump | Verified: `scripts/release.sh:58` (`TAG="v$VERSION"`) vs `git for-each-ref refs/tags`. Not in the brief; root cause per §1.3. |
| **New finding:** `validate_marketplace()` returns 0 when `claude` is not on `PATH` | Read from `scripts/_common.sh:63-81`. |
| **New finding:** version stored twice; `build-index.mjs:105` silently prefers `plugin.json` | Read from `site/scripts/build-index.mjs`. |
| **New finding:** `sdd-engineering` **1.1.0** also shipped untagged on `main` at `9bae60a` | Verified: `git show 9bae60a:plugins/sdd-engineering/.claude-plugin/plugin.json` → `1.1.0`; marketplace entry agrees at `1.1.0`; `git merge-base --is-ancestor 9bae60a main` → true; merged via `a779183` (PR #6). Named in neither the brief nor the NC-6 answer; raised as NC-12 → **resolved: backfill it**. |
| Backfill target commits (`4f56941`, `9bae60a`, `1cf5ea9`) — full SHAs, manifest version at each, reachability | Verified this revision: `git rev-parse`, `git show <commit>:<manifest>`, `git merge-base --is-ancestor <commit> main` for all three. Merge parents (`c143d3c`/PR #5, `a779183`/PR #6) verified via `git log -1 --format='%h %p %s'`. |
| **Complete released-version enumeration (seven versions; no fourth untagged surprise)** — §1.3 table | Verified this revision: `git log --first-parent --format=%H main -- plugins/<name>/.claude-plugin/plugin.json` per plugin × `git show <commit>:<manifest>`, cross-checked against the all-reachable-commits version set. Establishes AC-23's three tags as sufficient for AC-22. |
| **New finding (this revision):** no root `package.json` | Verified: `ls` of repo root; the only `package.json` is `site/`'s. Recorded as A-7. |
| Manifest rules (kebab-case, immutable `name`, `displayName`, `version` pinning) | `README.md` § Notes. |
| Tag/version/manifest state table (§1.3) | `git tag -l`, `git for-each-ref refs/tags`, `git log --oneline --decorate --first-parent`, four `plugin.json`s, `marketplace.json`. |
| README's Model-B grammar + non-existent `v1.0.0` rollback example | `README.md:66-86`. |
| NC-1…NC-9 resolutions (CODEOWNERS, tag families, CI tagging, PVR, latest-only, historical backfill, `plugin.json` authoritative, Keep a Changelog, `LICENSE` out of scope) | Maintainer decisions, 2026-07-16, relayed in the resolve brief. |
| NC-11 resolution: `SECURITY.md` states best-effort solo-maintainer triage with **no** numeric window (AC-8a) | Maintainer decision, 2026-07-16, relayed in the final resolve brief. Rationale (maintainer's): a solo maintainer cannot guarantee a window; a broken promise is worse than no promise. |
| NC-12 resolution: backfill `sdd-engineering--v1.1.0` at `9bae60a`; AC-22's invariant settled in the **wider** form (every version that ever shipped) | Maintainer decision, 2026-07-16, relayed in the final resolve brief; the `9bae60a` SHA and its manifest version independently re-verified against git by this agent before folding in, per the brief's instruction. |
| **Interpretation applied (not maintainer-stated):** AC-22's "ever shipped" selects versions via `main`'s **first-parent** line, excluding reachable-but-never-current intra-PR versions (EC-13) | This agent, to make the wider invariant testable and bounded. A literal "any reachable commit" reading would demand tags for versions no user could ever install. Flagged for maintainer awareness; a one-line change if the wider literal reading is intended. |
| NC-10 resolution: `ajv` + SchemaStore, not the `claude` CLI; CLI onboarding/TTY/exit-code risks; schema URLs and required fields; SchemaStore reliability caveat; ajv coverage gap | Researcher agent findings with cited sources, relayed in the resolve brief; sources listed inline at D-1. **Not independently re-verified by this agent** (no network access). |
| Spec id, filename, index, status conventions | `specs/INDEX.md`; `specs/site/SPEC-01-2026-07-14-lexical-search-and-keyword-index.md`. |
| English-only rule | Project memory (repo convention; no CI check). |
| Remote / GitHub-native assumption | Authoring brief; consistent with `pages.yml` using GitHub Pages. |

## 10. Untrusted inputs

- **UT-1. Fork pull requests.** Any contributor may propose a plugin containing arbitrary skill/agent/
  hook text that will run on users' machines after merge. CI validates *shape*, never intent — a
  schema-valid manifest is not a safe plugin, and `ajv` validates strictly less than
  `claude plugin validate` did (D-1, NG-11). Human review (AC-4's CODEOWNERS routing) is the control;
  this spec must not imply CI is one.
- **UT-2. PR-controlled strings** — title, body, branch name, author, filenames. Never interpolate into
  a `run:` block (AC-20); classic Actions script-injection sink. Sharpened by AC-36/AC-37: a job holding
  `contents: write` must never consume them.
- **UT-3. Manifest content** — `marketplace.json` / `plugin.json` are attacker-controllable on a fork
  PR. `source` is a *path* consumed by tooling: `..`-traversal or an absolute/symlinked path is a
  validation concern that `ajv` does **not** cover — hence AC-33 as an explicit rule. A plugin `name` is
  likewise interpolated into a tag ref by AC-25/AC-36; a hostile `name` is a ref-injection surface, and
  the schema's kebab-case constraint is what bounds it.
- **UT-4. Inbound security reports** (AC-8, via PVR) — untrusted by definition; content may be hostile.
- **UT-5. Third-party Actions** pulled by any new workflow — executable code from outside this repo
  (NF-3, PI-5).
- **UT-6. The SchemaStore schemas** (D-1) — fetched from a community-run host and used to gate merges.
  A compromised or broken schema either blocks all PRs or admits invalid manifests (EC-8, PI-11).
- **UT-7. `SKILL.md` / agent markdown bodies** — the site renders them (`react-markdown`) and Claude
  Code executes them. Prompt-injection carriers; out of scope to solve here, in scope to acknowledge
  in `SECURITY.md` (AC-9).

## 11. Cross-module impact

- **`.github/workflows/`** — a *new* validation workflow is added, plus the AC-36 tagging job.
  `pages.yml` and `site-build.yml` are untouched (NG-1). Both already trigger on `plugins/**` and
  `marketplace.json`, so PRs touching the catalog will now show a third check; AC-15 requires it be
  distinguishable, consistent with `site-build.yml`'s own header comment ("Deliberately SEPARATE … so on
  a PR you get a distinct status"). The tagging job introduces the repo's **first** `contents: write`
  grant (NF-1a).
- **`scripts/`** — `release.sh` (line 58 tag construction, line 67 duplicate guard, the `--plugin` bump)
  and `_common.sh` (`validate_marketplace`, lines 63-81) are affected by AC-17/AC-21/AC-25/AC-26;
  `rollback.sh` by AC-28. Behaviour change here is **required** — line 58 emitting a Family-M tag for a
  Family-P event is the defect. `release.sh --plugin` must also drive the AC-18 generator, and its
  relationship to the AC-36 automation (script tags vs CI tags) must not produce two writers of the same
  tag.
- **`site/`** — **now in scope**, narrowly: AC-35 changes `build-index.mjs:105`'s
  `manifest.version || entry.version || null` fallback, which becomes the last silent-drift path once
  NC-7 makes `plugin.json` authoritative. Site *rendering*, build, tests, and dist budget stay out of
  scope (NG-1). `site/` is also the only place a `package.json` exists today, which bears on where `ajv`
  and the generator live (A-7).
- **`README.md`** — its "Release & rollback" section (lines 66-86) states only the Model-B grammar and a
  `scripts/rollback.sh v1.0.0` example naming a tag that does not exist. It must document **both** tag
  families and when each applies (AC-17), and fix the example (AC-28).
- **`plugins/*/.claude-plugin/plugin.json`** — becomes the single authoritative version source (AC-18);
  its `version` field now triggers automated tagging on merge (AC-36).
- **`.claude-plugin/marketplace.json`** — its `version` fields become **generated output** (AC-18), no
  longer hand-edited. It gains `source`-containment and duplicate-name constraints (AC-33, AC-34).
- **`architecture-review:version-check`** — this command's purpose is confirming an update landed by
  comparing installed vs pinned versions. It is the in-repo consumer of the AC-22 invariant.
- **`docs/`** — gains `PLUGIN-GUIDELINES.md` alongside the two pre-SDD design docs, which
  `specs/INDEX.md` explicitly excludes from the SPEC-NN convention. The new file is a *guideline*, not
  a spec, so no id is needed.
- **`specs/INDEX.md`** — gains the SPEC-02 row and the new `specs/repo/` module directory.

## 12. Proposed improvements

Surfaced by the completeness pass; **not** required by any AC above.

- **PI-1.** *(Withdrawn — see NG-10.)* Adding a `LICENSE` file was proposed here; the maintainer has
  excluded it from this spec and will handle it separately. Retained as a numbered entry so the id
  remains stable; **not** an improvement this spec proposes.
- **PI-2.** *(Adopted — now AC-18/AC-30.)* Making `plugin.json` the single source of version truth with
  `marketplace.json` generated was proposed here and resolved into requirements by NC-7. Retained as a
  numbered entry so the id remains stable.
- **PI-3.** *(Subsumed by PI-2/AC-18.)* The narrower "teach `release.sh --plugin` to also bump
  `marketplace.json`" is no longer a separate improvement — generation supersedes mirroring.
- **PI-4.** Add a dependency-satisfiability check (EC-3): assert every `dependencies` range resolves
  against the catalog's current versions. Cheap, and the graph already has three edges into
  `engineering-paved-path`. `ajv` will not do this.
- **PI-5.** Pin third-party Actions to commit SHAs rather than major tags (NF-3), at least for the new
  workflow — and especially for the `contents: write` tagging job (NF-1a), where a compromised action
  gets write access to refs.
- **PI-6.** Add a PR template checklist mirroring `docs/PLUGIN-GUIDELINES.md`, so a contributor
  self-checks the rules CI cannot verify (UT-1). Excluded by NG-6.
- **PI-7.** Have `site-build.yml`'s path filters and the new validation workflow share one path list —
  they will drift otherwise, as three workflows now name the same four globs.
- **PI-8.** Emit a GitHub *Release* (not just a tag) per Family-P tag, so `RELEASES.md` (AC-10) and the
  Releases tab do not diverge. Natural to fold into AC-36's job, which already holds `contents: write`.
- **PI-9.** Consider whether `validate_marketplace()` failing open (§1.2.1) deserves a `LEARNINGS.md`
  note in `scripts/` — the same silent-degradation pattern would be easy to reintroduce.
- **PI-10.** Recover the coverage `ajv` loses versus `claude plugin validate` (NG-11): skill/agent
  frontmatter validity and `hooks/hooks.json` semantics. Options: a small bespoke frontmatter linter, or
  a best-effort `claude plugin validate --strict` step marked `continue-on-error` so its verdict is
  advisory and CI never depends on the CLI's TTY/auth behaviour (D-1).
- **PI-11.** Vendor the two SchemaStore schemas into the repo and validate against the local copies,
  with a scheduled job that diffs them upstream. Removes the run-time dependency on a third-party host,
  makes schema changes a reviewable diff, and keeps CI deterministic (EC-8, UT-6).
- **PI-12.** Add `"$schema": "https://json.schemastore.org/claude-code-marketplace.json"` to
  `.claude-plugin/marketplace.json` (it has none today; Anthropic's own marketplace declares exactly
  this). Free editor validation, and it documents in-file the same schema CI enforces.
- **PI-13.** Make AC-36's tagging job idempotent and self-healing — on each push to `main`, ensure a tag
  exists for every plugin's current version rather than only reacting to the diff. Closes EC-12's
  failed-push hole and would have prevented the §1.3 backfill entirely. **Strengthened by NC-12:** since
  AC-22 now covers every version that was ever current, the reconciliation should walk `main`'s
  first-parent history per manifest (AC-22's verify enumeration) rather than inspecting only the tip —
  a tip-only heal cannot recover a version that was superseded before the heal ran (EC-12), which is
  precisely how `sdd-engineering` 1.1.0 was lost. That walk is also a ready-made CI assertion of AC-22
  itself.
- **PI-14.** Assert AC-22 in CI directly — a check that walks each manifest's first-parent history and
  fails if any released version lacks its Family-P tag. AC-36 *creates* tags; nothing *verifies* the
  invariant holds, and the whole §1.3 backfill exists because no such check did. Cheap (it is AC-22's
  verify step, scripted) and it makes the invariant enforced rather than merely stated. Natural companion
  to PI-13, and would convert EC-12's silent hole into a red check.

---

## 13. Resolved clarifications

All twelve clarifications (NC-1 … NC-12) are **resolved** and folded into the requirements above; no
open question remains. The two closed in this revision:

- **NC-11 — PVR acknowledgement window.** Resolved: **best-effort, no stated window.** `SECURITY.md`
  describes triage as best-effort by a solo maintainer and makes no numeric commitment → **AC-8a**
  (AC-8 restored). Maintainer's rationale: a solo maintainer cannot guarantee a window, and a promise
  that gets broken is worse than no promise.
- **NC-12 — `sdd-engineering` 1.1.0 backfill.** Resolved: **yes, tag it at `9bae60a`** — three backfilled
  tags total → **AC-23**. Settles the Family-P invariant in its **wider** form: every version that ever
  shipped carries a tag, not merely every current one → **AC-22**, **G4**, **AC-11** (all seven versions
  in `RELEASES.md`, 1.1.0 marked superseded), **EC-11**, **EC-13**, **PI-13**.
