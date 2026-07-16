# LEARNINGS — `scripts/`

Durable, non-obvious learnings for the repo's release/validation tooling (`_common.sh`,
`release.sh`, `rollback.sh`, `backfill-tags.sh`, and the root-owned `*.mjs` validators).
Append-only: correct a stale record with a **new dated note beneath it**, never by
rewriting. Architecture and run steps live in the project docs — only hard-won,
non-obvious things belong here.

> Ownership note: these scripts are run by the **root** `package.json` (`npm run
> validate:manifests`, `gen:marketplace`, `schemas:check`, …), which is their nearest
> manifest. This file lives here anyway because a session working on release tooling
> opens `scripts/`, not the root manifest.

## What Works

- 2026-07-16 — **To prove a symlink-containment check on Windows without elevation, create a *junction*, not a symlink.** `fs.symlinkSync(target, path, 'dir')` throws `EPERM` on a machine without Developer Mode, which pushes tests toward a mocked/degraded fallback that proves nothing; `fs.symlinkSync(target, path, 'junction')` needs no elevation, and `realpathSync` still follows it — so the AC-33 escape case gets a genuine filesystem-level proof on the dev machine, not a stand-in. Evidence: `scripts/validate-manifests.test.mjs`, `scripts/validate-manifests.mjs:90-115`.

## What Doesn't Work

- 2026-07-16 — **A bash function whose error branch only `warn`s returns the status of that `warn` — i.e. 0 — and the caller proceeds.** `validate_marketplace()` did exactly this: no `claude` binary → the `else` branch warned, fell off the end, returned 0, and `release.sh` went straight on to tag an unvalidated marketplace. This is the security skill's A10 fail-open verbatim and it is the reason SPEC-02 exists. There is no syntax error to catch — the function reads as if it handles the case. **Every branch that means "I could not verify" must `die`/`return 1` explicitly**, and the opt-out must be a single named env var (`SKIP_VALIDATE=1`), never an implicit fall-through. Evidence: `scripts/_common.sh:68-95`.
- 2026-07-16 — **Do not locate a JSON field by regex when you intend "the entry's own top-level field".** `replaceEntryVersion` matched the *first* `"version"` in an entry's text; with `dependencies` declared before `version` (valid JSON — nothing forbids the order) it rewrote a **dependency's semver range** to the new version and left the real `version` stale, silently. All four manifests happened to order keys favourably, so it worked by luck. **The wider lesson: fixing one instance of a bug class does not fix its siblings** — `findPluginsArraySpan`, six lines away in the same file, had the identical flaw (it matched the first textual `"plugins":[`, not the top-level one) and survived a whole review round plus the first fix. When you fix a "matched the wrong occurrence" bug, grep the file for every other flat regex over structured text. Both are now depth-aware scanners. Evidence: `scripts/gen-marketplace-versions.mjs:37-64,67-100`.
- 2026-07-16 — **A "fresh clone / dependencies missing" repro run from inside a nested worktree is a false negative.** Node's ESM resolver walks *up* the directory tree for `node_modules`, so a worktree under `.claude/worktrees/` happily resolves `ajv` from the parent checkout even after you hide the worktree's own copy — the failure you are trying to reproduce simply does not occur, and the test "passes" having proved nothing. A faithful repro needs full path isolation **outside** the parent tree (clone to a temp dir). This bit the fix for the very bug it was verifying. Evidence: `scripts/_common.sh:77-94`.

## Codebase Patterns

- 2026-07-16 — **`scripts/*.mjs` guard their CLI behind an `isMain` check** (`import.meta.url === pathToFileURL(process.argv[1]).href`) so the pure rule functions can be imported by `*.test.mjs` and reused across scripts without the CLI firing. This is what lets `gen-marketplace-versions.mjs` import `resolvePluginManifestPath` from `validate-manifests.mjs` rather than re-deriving containment logic — reuse the export, don't copy the rule. Evidence: `scripts/validate-manifests.mjs:220-223`, `scripts/gen-marketplace-versions.mjs:30`.

## Decisions

- 2026-07-16 — **Vendored, hash-verified artifacts get `-text` in `.gitattributes`, not `eol=lf`.** `schemas/*.json` are byte-exact upstream copies whose sha256 must match `schemas/provenance.json` (AC-39), and `vendor-schemas.mjs --check` hashes the **working-tree** file. Under the repo's `* text=auto` + `core.autocrlf=true`, git stored an LF blob but checked them out as **CRLF on Windows**, so `--check` compared CRLF bytes against LF upstream and reported drift *forever* on Windows while passing on Linux CI. Rejected `eol=lf`: it fixes today's symptom but leaves git normalizing the file, so a future upstream that ships CRLF or mixed endings would be silently rewritten on checkin — re-forking the copy from upstream one layer down. `-text` means "these bytes are opaque, never convert, in either direction", which is the actual invariant. Evidence: `.gitattributes:7-9`, `scripts/vendor-schemas.mjs`.

## Tool & Library Notes

- 2026-07-16 — **GNU sed 4.9 silently drops an unrecognized replacement escape — it does not error.** `sed 's/`/\`/g'` (intending to backslash-escape a backtick) exits **0, prints nothing to stderr, and returns the input byte-for-byte unchanged**. Verified with `od -c`: input `a ` b` → output `a ` b`. A fix built on it looks correct in the diff, passes review, and does nothing. For straight character substitution prefer `tr` (`tr '`' "'"` — unambiguous, no escaping pitfalls); if you must use a sed escape, verify the **output bytes**, not the exit code. Evidence: `.github/workflows/schema-drift.yml` (PR-body fence neutralization).
- 2026-07-16 — **`git tag -a <name> -m <msg>` with no target commit silently defaults to `HEAD`.** Verified: two commits, `git tag -a notarget -m …` → the tag points at `HEAD`, not the intended commit. This is invisible in a script that only ever tags the current commit, and becomes a correctness bug the moment the same loop iterates over several commits — it collapses every tag onto the last one. **Any code that computes *which* commit a tag should point to must pass that commit explicitly as the final argument.** Evidence: `.github/workflows/tag-on-merge.yml:226`.

## Recurring Errors & Fixes

- 2026-07-16 — **`ERR_MODULE_NOT_FOUND` from a release script means "run `npm ci`", not "the catalog is broken".** `validate_marketplace()` shells out to `npm run validate:manifests`, which needs `ajv` from the root `node_modules`; on a fresh clone the raw Node stack trace leaked and the script then reported *"Marketplace validation failed. Fix it, or set SKIP_VALIDATE=1"* — blaming a perfectly valid catalog and pointing at an escape hatch that disables the gate. Check for the dependency (`node_modules/ajv`) **before** invoking the validator and name the real cause. General rule for this directory: a precondition failure must surface as a named, actionable error — never an unhandled stack trace (the same bar `readJson` upholds for malformed manifests). Evidence: `scripts/_common.sh:77-94`, `scripts/validate-manifests.mjs:32-47`.

## Session Notes

- 2026-07-16 — Implemented SPEC-02/PLAN-02 (governance docs, marketplace CI validation, release-tag invariant; 10 task units, 3 waves, 2 review rounds, 11 commits). **The durable lesson is about what review cannot see.** Three read-only gates (plan-verifier: 0 ACs missing; architecture: 0 violations; /code-review: 8 findings) plus a self-review pass all ran — and the three worst bugs were caught only by *executing* something: the `replaceEntryVersion` corruption (proven by feeding it a legal key order nobody had written yet), the `git tag -a` HEAD default (invisible until a fix forced a multi-commit range the old code could never reach), and the CRLF drift (invisible until a fresh clone was hashed — `git status` and `git diff` both hid it, because `text=auto` normalizes *both sides* of the comparison while `fs.readFileSync` sees the raw bytes). Two of the three would have passed every static gate indefinitely. **A gate that reads code cannot find a bug whose trigger nobody has typed yet.**

## Open Questions

- 2026-07-16 — `vendor-schemas.mjs` has no `isMain` guard, unlike its siblings, so `main()` runs on import and the script can only be exercised as a subprocess. Worth aligning for testability — deliberately out of scope for the fix that surfaced it. Evidence: `scripts/vendor-schemas.mjs`, cf. `scripts/gen-marketplace-versions.mjs:216-217`.
- 2026-07-16 — The depth-aware string/escape/brace scanner now exists three times in `gen-marketplace-versions.mjs` (`findTopLevelStringField`, `splitTopLevelObjects`, `findPluginsArraySpan`) as near-identical state machines. A shared primitive would de-duplicate them; left separate to keep the fix scoped. If a fourth appears, extract it. Evidence: `scripts/gen-marketplace-versions.mjs:37-100`.
