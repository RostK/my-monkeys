/**
 * gen-keywords.mjs — the HUMAN-INVOKED keyword generator. Calls the Anthropic
 * Messages API to (re)generate the `keywords` sidecar
 * (preview/data/keywords.json) that scripts/lib/keywords.mjs attaches to
 * every artifact for search, via `attachKeywords()` inside build-index.mjs.
 *
 * NEVER run by `npm run index` / `npm run build` / `npm run predev` /
 * `npm run prebuild` / CI. This is the ONLY place in the repo that calls an
 * LLM, and it must stay invisible to the build and to CI (AC-27) —
 * gen-keywords.test.mjs asserts that with a set of guard checks; treat that
 * test as load-bearing, not ceremony.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/gen-keywords.mjs [--dry-run] [--only <id>] [--stale]
 *
 * Flags:
 *   --dry-run   Print the diff summary; write nothing.
 *   --only <id> Regenerate a single artifact (by its catalog `id`).
 *   --stale     Only regenerate artifacts whose stored contentHash has
 *               drifted from the current catalog (or that have no entry).
 *
 * Requires `npm run index` to have already produced preview/src/catalog.json.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SCHEMA_VERSION, KEYWORDS_PATH, readSidecar, contentHashOf } from "./lib/keywords.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// preview/scripts/gen-keywords.mjs -> preview/src/catalog.json
const CATALOG_PATH = resolve(HERE, "../src/catalog.json");

// Model id, endpoint, and request/response shape taken from the claude-api
// skill (SKILL.md "Current Models" table + curl/examples.md "Basic Message
// Request"). Do NOT guess these from memory.
const MODEL = "claude-opus-4-8";
const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const MIN_KEYWORDS = 6;
const MAX_KEYWORDS = 15;

// ---------------------------------------------------------------------------
// Pure helpers — no fs, no network. Unit-tested in gen-keywords.test.mjs with
// a stubbed fetch (AC-27 guard test 4).
// ---------------------------------------------------------------------------

/**
 * Builds the prompt for one artifact. The model's output is treated as DATA,
 * not instructions (engineering-paved-path:security) — it lands in a
 * sidecar entry a human reviews (git diff) before it can ever reach a build.
 */
export function buildPrompt(artifact) {
  const { displayName, description, body, tags = [] } = artifact;
  const excerpt = String(body || "").slice(0, 4000);
  return [
    "You are generating SEARCH KEYWORDS for a Claude Code marketplace artifact.",
    "Output ONLY a JSON array of 8 to 13 short ENGLISH keyword PHRASES a user",
    "might type into a search box to find this artifact — natural language,",
    "lowercase, no punctuation beyond spaces/hyphens. Do NOT repeat the",
    "artifact's own tags or the words already in its display name — those are",
    "already indexed separately. Do NOT include any explanation, markdown",
    "fencing, or text other than the JSON array itself.",
    "",
    `Display name: ${displayName}`,
    `Existing tags: ${tags.length ? tags.join(", ") : "(none)"}`,
    `Description: ${description}`,
    "Body excerpt:",
    excerpt,
  ].join("\n");
}

/**
 * Validates and extracts a keyword array from the model's raw text response.
 * Throws a descriptive Error on ANY malformed shape. Callers must not catch
 * and continue — a malformed response must never be written to the sidecar.
 */
export function mapModelResponseToKeywords(rawText, artifactId) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error(`[gen-keywords] "${artifactId}": empty model response`);
  }

  // Tolerate a ```json fenced block or surrounding prose by extracting the
  // first top-level JSON array in the text.
  const match = rawText.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(
      `[gen-keywords] "${artifactId}": response did not contain a JSON array — got: ${rawText.slice(0, 200)}`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    throw new Error(`[gen-keywords] "${artifactId}": response array is not valid JSON (${err.message})`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`[gen-keywords] "${artifactId}": parsed response is not an array`);
  }
  if (parsed.length < MIN_KEYWORDS || parsed.length > MAX_KEYWORDS) {
    throw new Error(
      `[gen-keywords] "${artifactId}": expected ${MIN_KEYWORDS}-${MAX_KEYWORDS} keywords, got ${parsed.length}`
    );
  }

  const keywords = parsed.map((k, i) => {
    if (typeof k !== "string" || !k.trim()) {
      throw new Error(`[gen-keywords] "${artifactId}": keyword at index ${i} is not a non-empty string`);
    }
    return k.trim();
  });

  const seen = new Set();
  for (const k of keywords) {
    const norm = k.toLowerCase();
    if (seen.has(norm)) {
      throw new Error(`[gen-keywords] "${artifactId}": duplicate keyword "${k}"`);
    }
    seen.add(norm);
  }

  return keywords;
}

/**
 * Calls the Anthropic Messages API for one artifact and returns validated
 * keywords. `fetchImpl` defaults to Node 20's global fetch — tests inject a
 * stub so the suite never touches the network (AC-27).
 */
export async function generateKeywordsForArtifact(artifact, { apiKey, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: buildPrompt(artifact) }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`[gen-keywords] "${artifact.id}": API request failed (${response.status}) ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const textBlock = Array.isArray(data.content) ? data.content.find((b) => b?.type === "text") : null;
  if (!textBlock || typeof textBlock.text !== "string") {
    throw new Error(`[gen-keywords] "${artifact.id}": API response had no text content block`);
  }

  return mapModelResponseToKeywords(textBlock.text, artifact.id);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { dryRun: false, only: null, stale: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--stale") args.stale = true;
    else if (a === "--only") args.only = argv[++i];
    else {
      console.error(`[gen-keywords] unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function loadCatalog() {
  if (!existsSync(CATALOG_PATH)) {
    console.error(
      `[gen-keywords] catalog not found at ${CATALOG_PATH}.\n` +
        `Run "npm run index" first (it generates preview/src/catalog.json), then re-run this script.`
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

function printDiffSummary(diffs) {
  console.log("\n[gen-keywords] diff summary:");
  for (const { id, before, after } of diffs) {
    const added = after.filter((k) => !before.includes(k));
    const removed = before.filter((k) => !after.includes(k));
    console.log(`  ${id}`);
    if (before.length === 0) {
      console.log(`    + (new) ${after.join(", ")}`);
      continue;
    }
    if (added.length) console.log(`    + ${added.join(", ")}`);
    if (removed.length) console.log(`    - ${removed.join(", ")}`);
    if (!added.length && !removed.length) console.log("    (unchanged)");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Security (engineering-paved-path:security): the key comes from
  // process.env ONLY, is never logged, and its absence is a hard refusal —
  // no network call, no write.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "[gen-keywords] ANTHROPIC_API_KEY is not set — refusing to run.\n" +
        "This script calls the Anthropic API and must never run without an explicit key.\n" +
        "Usage: ANTHROPIC_API_KEY=sk-ant-... node scripts/gen-keywords.mjs [--dry-run] [--only <id>] [--stale]"
    );
    process.exit(1);
  }

  const catalog = loadCatalog();
  const artifacts = Array.isArray(catalog.artifacts) ? catalog.artifacts : [];
  if (artifacts.length === 0) {
    console.error(`[gen-keywords] catalog at ${CATALOG_PATH} has no artifacts — nothing to do.`);
    process.exit(1);
  }

  const sidecar = readSidecar();
  const existingEntries = { ...(sidecar.artifacts || {}) };

  let targets = artifacts;
  if (args.only) {
    targets = artifacts.filter((a) => a.id === args.only);
    if (targets.length === 0) {
      console.error(`[gen-keywords] no artifact with id "${args.only}" found in the catalog.`);
      process.exit(1);
    }
  } else if (args.stale) {
    targets = artifacts.filter((a) => {
      const entry = existingEntries[a.id];
      return !entry || entry.contentHash !== contentHashOf(a);
    });
    if (targets.length === 0) {
      console.log("[gen-keywords] no stale artifacts — sidecar is already up to date.");
      return;
    }
  }

  console.log(
    `[gen-keywords] generating keywords for ${targets.length} artifact(s)${args.dryRun ? " (dry run)" : ""}...`
  );

  const diffs = [];
  const newEntries = { ...existingEntries };
  let failed = false;

  for (const artifact of targets) {
    process.stdout.write(`  - ${artifact.id} ... `);
    let keywords;
    try {
      keywords = await generateKeywordsForArtifact(artifact, { apiKey });
    } catch (err) {
      console.log("FAILED");
      console.error(`    ${err.message}`);
      failed = true;
      continue;
    }
    console.log("ok");

    const before = existingEntries[artifact.id]?.keywords || [];
    diffs.push({ id: artifact.id, before, after: keywords });

    newEntries[artifact.id] = {
      keywords,
      contentHash: contentHashOf(artifact),
      generatedAt: new Date().toISOString(),
    };
  }

  printDiffSummary(diffs);

  if (args.dryRun) {
    console.log("\n[gen-keywords] --dry-run: writing nothing.");
    if (failed) process.exit(1);
    return;
  }

  if (failed) {
    console.error("\n[gen-keywords] one or more artifacts failed — refusing to write a partial sidecar.");
    process.exit(1);
  }

  const out = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    artifacts: newEntries,
  };
  writeFileSync(KEYWORDS_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`\n[gen-keywords] wrote ${KEYWORDS_PATH}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
