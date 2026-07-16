#!/usr/bin/env node
/**
 * gen-marketplace-versions.mjs — AC-18.
 *
 * Regenerates the `version` field of every entry in
 * `.claude-plugin/marketplace.json` from its plugin's own
 * `.claude-plugin/plugin.json`, which is the single authoritative source.
 * No workflow, script, or human should ever hand-edit a marketplace `version`
 * — this generator is the only writer of those fields.
 *
 * Only the `version` value of each entry is touched; every other byte of the
 * file (key order, indentation, spacing inside nested objects such as
 * `dependencies`, line endings, trailing newline) is preserved exactly, so a
 * clean-tree run is a byte no-op (`git diff --exit-code`) whenever versions
 * already agree with each plugin.json.
 *
 * Usage:
 *   node scripts/gen-marketplace-versions.mjs          # write in place
 *   node scripts/gen-marketplace-versions.mjs --check   # verify only (AC-30);
 *                                                        # non-zero + names the
 *                                                        # diff if out of sync
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// AC-33 containment — reuse validate-manifests.mjs's tested, symlink-aware
// `resolvePluginManifestPath` rather than re-deriving the path with a bare
// `join(resolve(...))` that has no containment check. Importing is safe:
// that module guards its CLI entry point behind an `isMain` check.
import { resolvePluginManifestPath } from "./validate-manifests.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MARKETPLACE_PATH = join(REPO_ROOT, ".claude-plugin", "marketplace.json");
const rel = (abs) => abs.slice(REPO_ROOT.length + 1).replace(/\\/g, "/");

/**
 * Split the raw text of a JSON array (the substring strictly between its `[`
 * and `]`) into the raw substrings of its top-level object elements, string-
 * aware so braces inside string values are never mistaken for structure.
 * Returns [{ start, end }] offsets relative to `arrayBody`.
 */
function splitTopLevelObjects(arrayBody) {
  const spans = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < arrayBody.length; i++) {
    const ch = arrayBody[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) spans.push({ start, end: i + 1 });
    }
  }
  return spans;
}

/**
 * Find the `[ ... ]` span (offsets into `text`) of the top-level `"plugins"`
 * array — i.e. a `"plugins"` key that is a direct child of the root object
 * (depth 1), not a same-named key nested inside some other top-level field
 * (e.g. a hypothetical `metadata.plugins`). Depth-aware and string-aware,
 * using the same scanning technique as findTopLevelStringField /
 * splitTopLevelObjects below, so a textually-earlier nested `"plugins"` key
 * can never be mistaken for the real, top-level one.
 */
function findPluginsArraySpan(text) {
  const keyPattern = '"plugins"';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      if (depth === 1 && text.startsWith(keyPattern, i)) {
        let j = i + keyPattern.length;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (text[j] === ":") {
          let k = j + 1;
          while (k < text.length && /\s/.test(text[k])) k++;
          if (text[k] !== "[") {
            throw new Error('marketplace.json top-level "plugins" field is not an array');
          }
          let arrDepth = 0;
          let arrInString = false;
          let arrEscape = false;
          for (let m = k; m < text.length; m++) {
            const mch = text[m];
            if (arrInString) {
              if (arrEscape) arrEscape = false;
              else if (mch === "\\") arrEscape = true;
              else if (mch === '"') arrInString = false;
              continue;
            }
            if (mch === '"') {
              arrInString = true;
              continue;
            }
            if (mch === "[") arrDepth++;
            else if (mch === "]") {
              arrDepth--;
              if (arrDepth === 0) return { start: k + 1, end: m };
            }
          }
          throw new Error('marketplace.json "plugins" array is not terminated');
        }
      }
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
  }
  throw new Error('marketplace.json has no top-level "plugins" array');
}

/**
 * Locate the raw text span of a top-level (depth-1) string-valued key inside
 * an object's raw text (which must start at its own `{`), string-aware and
 * depth-tracking exactly like splitTopLevelObjects/findPluginsArraySpan, so a
 * same-named key nested inside a nested object/array (e.g. a `dependencies`
 * entry's own "version") is never mistaken for this object's own field —
 * regardless of whether that nested structure appears before or after the
 * real field in the text.
 *
 * In valid JSON, a quoted string immediately followed (after whitespace) by
 * `:` is always a *key*, never a value — a value can only be followed by `,`
 * `}` or `]` — so this needs no separate "expecting a key" state machine.
 *
 * Returns `{ valueStart, valueEnd }` (offsets of the value's own quotes,
 * inclusive) or `null` if `keyName` has no top-level string-valued match.
 */
function findTopLevelStringField(objectText, keyName) {
  const keyPattern = `"${keyName}"`;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < objectText.length; i++) {
    const ch = objectText[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      if (depth === 1 && objectText.startsWith(keyPattern, i)) {
        let j = i + keyPattern.length;
        while (j < objectText.length && /\s/.test(objectText[j])) j++;
        if (objectText[j] === ":") {
          let k = j + 1;
          while (k < objectText.length && /\s/.test(objectText[k])) k++;
          if (objectText[k] === '"') {
            let vi = k + 1;
            let vEscape = false;
            while (vi < objectText.length) {
              const vch = objectText[vi];
              if (vEscape) vEscape = false;
              else if (vch === "\\") vEscape = true;
              else if (vch === '"') break;
              vi++;
            }
            return { valueStart: k, valueEnd: vi + 1 };
          }
          // A top-level "version" whose value isn't a JSON string — not a
          // shape this generator understands; treat as "not found" so the
          // caller's existing not-found handling (untouched, unmatched) applies.
          return null;
        }
      }
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
  }
  return null;
}

/**
 * Within one entry's raw object substring, replace the value of its own
 * top-level "version" field — found via findTopLevelStringField, so a nested
 * `dependencies[].version` is never touched regardless of field order.
 */
function replaceEntryVersion(entryText, newVersion) {
  const field = findTopLevelStringField(entryText, "version");
  if (!field) return { text: entryText, changed: false };
  const currentValue = entryText.slice(field.valueStart + 1, field.valueEnd - 1);
  if (currentValue === newVersion) return { text: entryText, changed: false };
  const before = entryText.slice(0, field.valueStart);
  const after = entryText.slice(field.valueEnd);
  return { text: `${before}"${newVersion}"${after}`, changed: true };
}

/**
 * Round-trip guard (defense-in-depth for the text surgery above): compares
 * the re-parsed regenerated structure against the original parsed structure,
 * asserting every `plugins[]` entry's `version` now equals its authoritative
 * value and that nothing else — in that entry or anywhere else in the file
 * — changed. `JSON.stringify` comparison is intentionally order-sensitive:
 * a key-order change would violate AC-18's byte-stability contract too, so
 * it must trip the guard, not just a deep-equal.
 *
 * Returns `null` when the regeneration is verified correct, or a
 * human-readable reason string when it is not.
 */
function verifyRegeneration(originalParsed, regeneratedParsed, authoritativeVersions) {
  const origPlugins = Array.isArray(originalParsed?.plugins) ? originalParsed.plugins : [];
  const newPlugins = Array.isArray(regeneratedParsed?.plugins) ? regeneratedParsed.plugins : [];
  if (origPlugins.length !== newPlugins.length) {
    return `plugins array length changed (${origPlugins.length} -> ${newPlugins.length})`;
  }
  for (let i = 0; i < origPlugins.length; i++) {
    const name = origPlugins[i]?.name ?? `#${i}`;
    const expected = authoritativeVersions[i];
    if (newPlugins[i]?.version !== expected) {
      return `plugins[${i}] ("${name}") version is ${JSON.stringify(newPlugins[i]?.version)}, expected ${JSON.stringify(expected)}`;
    }
    const { version: _origV, ...origRest } = origPlugins[i] ?? {};
    const { version: _newV, ...newRest } = newPlugins[i] ?? {};
    if (JSON.stringify(origRest) !== JSON.stringify(newRest)) {
      return `plugins[${i}] ("${name}") changed a field other than "version"`;
    }
  }
  const { plugins: _op, ...origTop } = originalParsed ?? {};
  const { plugins: _np, ...newTop } = regeneratedParsed ?? {};
  if (JSON.stringify(origTop) !== JSON.stringify(newTop)) {
    return `top-level fields outside "plugins" changed`;
  }
  return null;
}

function resolveAuthoritativeVersion(entry, errors) {
  const entryLabel = `plugins entry "${entry?.name ?? "?"}"`;
  // AC-33: containment-checked resolution (rejects absolute/traversing
  // `source`, re-checks after following symlinks) — see the import comment.
  const manifestPath = resolvePluginManifestPath(entry?.source, entryLabel, errors);
  if (!manifestPath) return null;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    errors.push(`${entryLabel}: ${rel(manifestPath)} is not valid JSON — ${err.message}`);
    return null;
  }
  if (typeof manifest.version !== "string") {
    errors.push(`${entryLabel}: ${rel(manifestPath)} has no "version" — skipped`);
    return null;
  }
  return manifest.version;
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const errors = [];

  const original = readFileSync(MARKETPLACE_PATH, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(original);
  } catch (err) {
    console.error(`gen:marketplace FAILED — ${rel(MARKETPLACE_PATH)} is not valid JSON — ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];
  let arraySpan;
  let arrayBody;
  let objectSpans;
  try {
    arraySpan = findPluginsArraySpan(original);
    arrayBody = original.slice(arraySpan.start, arraySpan.end);
    objectSpans = splitTopLevelObjects(arrayBody);
  } catch (err) {
    console.error(`gen:marketplace FAILED — ${rel(MARKETPLACE_PATH)}: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (objectSpans.length !== plugins.length) {
    console.error(
      `gen:marketplace FAILED — parsed ${plugins.length} plugin entries but found ${objectSpans.length} top-level objects in the "plugins" array text; refusing to regenerate.`,
    );
    process.exitCode = 1;
    return;
  }

  let rebuiltArrayBody = "";
  let cursor = 0;
  let changedCount = 0;
  const changedNames = [];
  const authoritativeVersions = [];

  objectSpans.forEach((span, i) => {
    rebuiltArrayBody += arrayBody.slice(cursor, span.start);
    const entryText = arrayBody.slice(span.start, span.end);
    const entry = plugins[i];
    const authoritative = resolveAuthoritativeVersion(entry, errors);
    if (authoritative === null) {
      rebuiltArrayBody += entryText;
      // A skipped entry still needs a slot so authoritativeVersions[i] lines
      // up with plugins[i]; errors.length > 0 always short-circuits before
      // this array is used, so the placeholder value is never read.
      authoritativeVersions.push(entry?.version);
    } else {
      const { text, changed } = replaceEntryVersion(entryText, authoritative);
      rebuiltArrayBody += text;
      authoritativeVersions.push(authoritative);
      if (changed) {
        changedCount++;
        changedNames.push(entry.name);
      }
    }
    cursor = span.end;
  });
  rebuiltArrayBody += arrayBody.slice(cursor);

  const regenerated = original.slice(0, arraySpan.start) + rebuiltArrayBody + original.slice(arraySpan.end);

  if (errors.length > 0) {
    console.error("gen:marketplace: could not resolve every entry's authoritative version:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  if (regenerated === original) {
    console.log(`gen:marketplace: ${rel(MARKETPLACE_PATH)} is already in sync with every plugin.json.`);
    return;
  }

  // Round-trip guard — re-parse the regenerated text and verify the surgery
  // did exactly what was intended and nothing else, before this function is
  // ever allowed to write it out (fails closed; writes nothing on mismatch).
  let reparsed;
  try {
    reparsed = JSON.parse(regenerated);
  } catch (err) {
    console.error(
      `gen:marketplace FAILED — internal error: the regenerated ${rel(MARKETPLACE_PATH)} text is not valid JSON — ${err.message}. Nothing was written.`,
    );
    process.exitCode = 1;
    return;
  }
  const guardError = verifyRegeneration(parsed, reparsed, authoritativeVersions);
  if (guardError) {
    console.error(
      `gen:marketplace FAILED — regeneration guard tripped on ${rel(MARKETPLACE_PATH)}: ${guardError}. Nothing was written.`,
    );
    process.exitCode = 1;
    return;
  }

  if (checkOnly) {
    console.error(`check:marketplace FAILED — ${rel(MARKETPLACE_PATH)} is out of sync with plugin.json versions:`);
    for (const name of changedNames) console.error(`  - "${name}" version needs regenerating`);
    console.error("Run `npm run gen:marketplace` and commit the result.");
    process.exitCode = 1;
    return;
  }

  writeFileSync(MARKETPLACE_PATH, regenerated);
  console.log(`gen:marketplace: updated ${changedCount} entr${changedCount === 1 ? "y" : "ies"} in ${rel(MARKETPLACE_PATH)}: ${changedNames.join(", ")}`);
}

// Only run the CLI when executed directly (`node scripts/gen-marketplace-versions.mjs`),
// not when imported by scripts/gen-marketplace-versions.test.mjs.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();

export { splitTopLevelObjects, findPluginsArraySpan, replaceEntryVersion, verifyRegeneration };
