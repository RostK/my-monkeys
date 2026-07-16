#!/usr/bin/env node
/**
 * validate-manifests.mjs — AC-15/AC-16/AC-33/AC-34.
 *
 * Validates `.claude-plugin/marketplace.json` and every plugin's
 * `.claude-plugin/plugin.json` under `plugins/` against the repository's own
 * **committed** copies of the two Claude Code JSON Schemas (schemas/*.json —
 * see AC-39) using ajv (draft-07) + ajv-formats, plus two repo-local rules
 * ajv cannot express: source containment (AC-33) and duplicate plugin names
 * (AC-34).
 *
 * This script performs **no network access** — it validates only against the
 * files already on disk, so it (and the CI check built on it) works with
 * json.schemastore.org unreachable.
 *
 * Usage:  node scripts/validate-manifests.mjs
 * Exit:   0 on a clean catalog; 1 naming every offending file + JSON pointer.
 */
import { readFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (abs) => abs.slice(REPO_ROOT.length + 1).replace(/\\/g, "/");

const MARKETPLACE_SCHEMA_PATH = join(REPO_ROOT, "schemas", "claude-code-marketplace.json");
const PLUGIN_SCHEMA_PATH = join(REPO_ROOT, "schemas", "claude-code-plugin-manifest.json");
const MARKETPLACE_PATH = join(REPO_ROOT, ".claude-plugin", "marketplace.json");

/** Read + JSON.parse, wrapped so a syntax error becomes a named-file error, not a stack trace. */
function readJson(path, errors) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    errors.push(`${rel(path)}: could not read file — ${err.message}`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    errors.push(`${rel(path)}: malformed JSON — ${err.message}`);
    return null;
  }
}

function formatAjvErrors(fileLabel, ajvErrors) {
  return (ajvErrors || []).map((e) => {
    const pointer = e.instancePath && e.instancePath.length > 0 ? e.instancePath : "/";
    const extra =
      e.keyword === "required" && e.params && e.params.missingProperty
        ? ` (missing "${e.params.missingProperty}")`
        : "";
    return `${fileLabel} ${pointer} ${e.message}${extra}`;
  });
}

/**
 * AC-33 — path-traversal containment check. `source` is attacker-controlled
 * on a fork PR: resolve it, assert the result is inside the repo root (with
 * a trailing separator so `${REPO_ROOT}-evil` cannot pass a naive
 * startsWith check), reject absolute paths outright, re-check containment
 * after resolving symlinks, then assert `.claude-plugin/plugin.json` exists.
 * Returns the manifest path on success, or null (and pushes to `errors`) on
 * failure.
 */
function resolvePluginManifestPath(entrySource, entryLabel, errors) {
  if (typeof entrySource !== "string" || entrySource.length === 0) {
    errors.push(`${entryLabel}: "source" must be a non-empty string`);
    return null;
  }
  if (isAbsolute(entrySource)) {
    errors.push(`${entryLabel}: "source" must be a repo-relative path, got an absolute path: ${entrySource}`);
    return null;
  }

  const resolved = resolve(REPO_ROOT, entrySource);
  if (!isContained(REPO_ROOT, resolved)) {
    errors.push(`${entryLabel}: "source" resolves outside the repository root: ${entrySource} -> ${resolved}`);
    return null;
  }

  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    errors.push(`${entryLabel}: "source" does not resolve to an existing directory: ${entrySource}`);
    return null;
  }

  // Symlink defense: re-check containment against the real (resolved) paths.
  let realResolved;
  let realRoot;
  try {
    realResolved = realpathSync(resolved);
    realRoot = realpathSync(REPO_ROOT);
  } catch (err) {
    errors.push(`${entryLabel}: could not resolve "source" — ${err.message}`);
    return null;
  }
  if (!isContained(realRoot, realResolved)) {
    errors.push(
      `${entryLabel}: "source" resolves (after following symlinks) outside the repository root: ${entrySource}`,
    );
    return null;
  }

  const manifestPath = join(resolved, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    errors.push(`${entryLabel}: "source" does not contain a .claude-plugin/plugin.json: ${entrySource}`);
    return null;
  }

  // FIX-5b — the containment re-check above (:90-105) validated `resolved`
  // (the `source` directory itself), but `.claude-plugin/plugin.json` is
  // joined on afterward and read without a second check. A fork PR
  // committing `plugins/x/.claude-plugin` as a symlink to an outside
  // directory would pass the check above yet still resolve to an arbitrary
  // file here. Re-run containment on the FINAL manifest path once resolved.
  let realManifestPath;
  try {
    realManifestPath = realpathSync(manifestPath);
  } catch (err) {
    errors.push(`${entryLabel}: could not resolve ".claude-plugin/plugin.json" — ${err.message}`);
    return null;
  }
  if (!isContained(realRoot, realManifestPath)) {
    errors.push(
      `${entryLabel}: ".claude-plugin/plugin.json" resolves (after following symlinks) outside the repository root: ${entrySource}`,
    );
    return null;
  }

  return manifestPath;
}

function isContained(root, candidate) {
  if (candidate === root) return true;
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  return candidate.startsWith(rootWithSep);
}

// AC-16/FIX-5a — repo-local `name` shape rule. Neither vendored schema
// constrains `name` beyond {type: string, minLength: 1} (AC-39 forbids
// editing the vendored copies to add a `pattern`), yet a plugin's `name`
// flows straight into a git tag (`${name}--v${version}`, see
// .github/workflows/tag-on-merge.yml) with no shape validation there
// either. This mirrors scripts/_common.sh's ensure_safe_ref_component()
// exactly, so both tag-producing paths agree: git-ref-safe characters only,
// and never a leading '-' (which git could misread as an option). All four
// real plugin names (engineering-paved-path, research-tools,
// architecture-review, sdd-engineering) are kebab-case and satisfy this —
// it is a no-op on the clean tree.
const SAFE_REF_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function isSafeRefName(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("-") && SAFE_REF_NAME_PATTERN.test(value);
}

/**
 * AC-34 — pure duplicate-`name` detection over a `plugins[]` array. Returns
 * one `{ index, name }` per entry whose `name` was already declared by an
 * earlier entry. Uses a `Set`, never a plain-object lookup keyed by
 * attacker-controlled `name` values (prototype-pollution guard).
 */
function findDuplicateNames(plugins) {
  const seen = new Set();
  const duplicates = [];
  (Array.isArray(plugins) ? plugins : []).forEach((entry, index) => {
    if (typeof entry?.name !== "string") return;
    if (seen.has(entry.name)) {
      duplicates.push({ index, name: entry.name });
    } else {
      seen.add(entry.name);
    }
  });
  return duplicates;
}

async function main() {
  const errors = [];

  console.log("Validating against committed schemas:");
  console.log(`  ${rel(MARKETPLACE_SCHEMA_PATH)}`);
  console.log(`  ${rel(PLUGIN_SCHEMA_PATH)}`);

  const marketplaceSchema = readJson(MARKETPLACE_SCHEMA_PATH, errors);
  const pluginSchema = readJson(PLUGIN_SCHEMA_PATH, errors);
  if (!marketplaceSchema || !pluginSchema) {
    reportAndExit(errors);
    return;
  }

  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);

  let validateMarketplace;
  let validatePlugin;
  try {
    // compile(), never compileAsync — neither committed schema has an
    // external $ref (asserted by vendor-schemas.mjs --write).
    validateMarketplace = ajv.compile(marketplaceSchema);
    validatePlugin = ajv.compile(pluginSchema);
  } catch (err) {
    errors.push(`schema compilation failed — ${err.message}`);
    reportAndExit(errors);
    return;
  }

  const manifestPaths = [MARKETPLACE_PATH];

  const marketplace = readJson(MARKETPLACE_PATH, errors);
  if (marketplace) {
    if (!validateMarketplace(marketplace)) {
      errors.push(...formatAjvErrors(rel(MARKETPLACE_PATH), validateMarketplace.errors));
    }

    // AC-34 — duplicate `name` detection (pure; see findDuplicateNames).
    const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
    for (const dup of findDuplicateNames(plugins)) {
      errors.push(
        `${rel(MARKETPLACE_PATH)}: plugins[${dup.index}] duplicates the name "${dup.name}" declared by an earlier entry`,
      );
    }

    plugins.forEach((entry, index) => {
      const name = entry && typeof entry.name === "string" ? entry.name : `#${index}`;
      const entryLabel = `${rel(MARKETPLACE_PATH)}: plugins[${index}] (${name})`;

      const manifestPath = resolvePluginManifestPath(entry?.source, entryLabel, errors);
      if (!manifestPath) return;

      manifestPaths.push(manifestPath);
      const pluginManifest = readJson(manifestPath, errors);
      if (pluginManifest && !validatePlugin(pluginManifest)) {
        errors.push(...formatAjvErrors(rel(manifestPath), validatePlugin.errors));
      }
      // FIX-5a — repo-local rule, not a schema edit (AC-39). Only applies
      // when `name` is a string (ajv's `required`/`type` errors above
      // already cover a missing/non-string `name`).
      if (pluginManifest && typeof pluginManifest.name === "string" && !isSafeRefName(pluginManifest.name)) {
        errors.push(
          `${rel(manifestPath)} /name must be a safe git-ref component (letters, digits, ".", "_", "-" only; must not start with "-"): "${pluginManifest.name}"`,
        );
      }
    });
  }

  console.log("Manifests:");
  for (const p of manifestPaths) console.log(`  ${rel(p)}`);

  reportAndExit(errors);
}

function reportAndExit(errors) {
  if (errors.length > 0) {
    console.error(`validate:manifests FAILED — ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  console.log("validate:manifests OK");
}

// Only run the CLI when executed directly (`node scripts/validate-manifests.mjs`),
// not when imported by scripts/validate-manifests.test.mjs (R-4).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();

export { isContained, findDuplicateNames, resolvePluginManifestPath, REPO_ROOT, isSafeRefName };
