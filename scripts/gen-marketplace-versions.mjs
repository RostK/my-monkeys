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
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

/** Find the `[ ... ]` span (offsets into `text`) of the top-level `"plugins"` array. */
function findPluginsArraySpan(text) {
  const keyMatch = text.match(/"plugins"\s*:\s*\[/);
  if (!keyMatch) throw new Error('marketplace.json has no top-level "plugins" array');
  const arrayStart = keyMatch.index + keyMatch[0].length - 1; // position of '['
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = arrayStart; i < text.length; i++) {
    const ch = text[i];
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
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return { start: arrayStart + 1, end: i };
    }
  }
  throw new Error('marketplace.json "plugins" array is not terminated');
}

/**
 * Within one entry's raw object substring, replace the value of its own
 * (first, top-level-in-this-object) "version" field. Because `source`
 * precedes `version` and `dependencies` (which may contain nested `version`
 * fields) always follows it in every entry today, the first "version"
 * occurrence in the substring is always the entry's own field.
 */
function replaceEntryVersion(entryText, newVersion) {
  const m = entryText.match(/"version"\s*:\s*"([^"]*)"/);
  if (!m) return { text: entryText, changed: false };
  if (m[1] === newVersion) return { text: entryText, changed: false };
  const before = entryText.slice(0, m.index);
  const after = entryText.slice(m.index + m[0].length);
  const replaced = m[0].replace(/"([^"]*)"$/, `"${newVersion}"`);
  return { text: `${before}${replaced}${after}`, changed: true };
}

function resolveAuthoritativeVersion(entry, errors) {
  const source = entry?.source;
  if (typeof source !== "string" || source.length === 0) {
    errors.push(`plugins entry "${entry?.name ?? "?"}": no "source" — skipped`);
    return null;
  }
  const manifestPath = join(resolve(REPO_ROOT, source), ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    errors.push(`plugins entry "${entry?.name ?? "?"}": ${rel(manifestPath)} not found — skipped`);
    return null;
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    errors.push(`plugins entry "${entry?.name ?? "?"}": ${rel(manifestPath)} is not valid JSON — ${err.message}`);
    return null;
  }
  if (typeof manifest.version !== "string") {
    errors.push(`plugins entry "${entry?.name ?? "?"}": ${rel(manifestPath)} has no "version" — skipped`);
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
  const arraySpan = findPluginsArraySpan(original);
  const arrayBody = original.slice(arraySpan.start, arraySpan.end);
  const objectSpans = splitTopLevelObjects(arrayBody);

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

  objectSpans.forEach((span, i) => {
    rebuiltArrayBody += arrayBody.slice(cursor, span.start);
    const entryText = arrayBody.slice(span.start, span.end);
    const entry = plugins[i];
    const authoritative = resolveAuthoritativeVersion(entry, errors);
    if (authoritative === null) {
      rebuiltArrayBody += entryText;
    } else {
      const { text, changed } = replaceEntryVersion(entryText, authoritative);
      rebuiltArrayBody += text;
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

export { splitTopLevelObjects, findPluginsArraySpan, replaceEntryVersion };
