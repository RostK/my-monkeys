/**
 * keywords.mjs — the single definition of the artifact content hash, plus the
 * reader/attacher for the `preview/data/keywords.json` sidecar.
 *
 * Design:
 *  - `readSidecar()` touches the filesystem and is intentionally forgiving: a
 *    missing or malformed sidecar WARNS (via console.warn) and falls back to
 *    an empty artifact map — it never throws, so a bad sidecar can never take
 *    the build down (AC-20).
 *  - `attachKeywords()` is pure and fs-free: given an artifacts array and an
 *    already-parsed sidecar, it returns new artifacts (each with a `keywords`
 *    array attached) plus a list of warning strings. Callers (build-index.mjs,
 *    tests) decide what to do with the warnings — this module never logs from
 *    inside attachKeywords, which is what keeps it unit-testable without
 *    touching the repo or stubbing console.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA_VERSION = 1;

// preview/scripts/lib/keywords.mjs -> preview/data/keywords.json
export const KEYWORDS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/keywords.json");

const EMPTY_SIDECAR = () => ({ schemaVersion: SCHEMA_VERSION, generatedAt: null, artifacts: {} });

/**
 * Reads and parses the keyword sidecar at `path` (defaults to KEYWORDS_PATH).
 * Never throws: a missing file, invalid JSON, or a payload missing the
 * `artifacts` object all warn once and return an empty sidecar so callers can
 * proceed with zero keywords rather than crashing the build.
 */
export function readSidecar(path = KEYWORDS_PATH) {
  if (!existsSync(path)) {
    console.warn(`[keywords] sidecar not found at ${path} — proceeding with an empty keyword set.`);
    return EMPTY_SIDECAR();
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.warn(`[keywords] sidecar at ${path} is not valid JSON (${err.message}) — proceeding with an empty keyword set.`);
    return EMPTY_SIDECAR();
  }

  if (!raw || typeof raw !== "object" || typeof raw.artifacts !== "object" || raw.artifacts === null) {
    console.warn(`[keywords] sidecar at ${path} is missing an "artifacts" object — proceeding with an empty keyword set.`);
    return EMPTY_SIDECAR();
  }

  return raw;
}

/**
 * The ONE content-hash definition, used both when authoring the sidecar and
 * when validating it at build time. Deliberately EXCLUDES `updatedAt` /
 * `gitDate` (those change on every commit touching the file) and `tags`
 * (tags and keywords are independent) — only the fields that define what the
 * artifact actually IS.
 */
export function contentHashOf(artifact) {
  const displayName = artifact?.displayName ?? "";
  const description = artifact?.description ?? "";
  const body = artifact?.body ?? "";
  const digest = createHash("sha256").update(`${displayName}\n${description}\n${body}`, "utf8").digest("hex");
  return `sha256:${digest}`;
}

const normalize = (s) => String(s ?? "").trim().toLowerCase();

// Tokens derived from the artifact's own display name — keywords that just
// repeat a name token add nothing (E-10).
function displayNameTokens(displayName) {
  return String(displayName ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Pure, fs-free: attaches a `keywords: string[]` array to every artifact from
 * the sidecar, and returns the warnings a caller should surface (contentHash
 * drift, or no sidecar entry at all) rather than logging them itself.
 *
 * E-10 dedupe: strips any keyword whose normalized form already equals one of
 * the artifact's own tags or a token of its display name — BM25 sums
 * per-field contributions, so a duplicated term would double-count. The strip
 * never empties an array that started non-empty (AC-9 still requires >=1
 * keyword per artifact).
 */
export function attachKeywords(artifacts, sidecar) {
  const warnings = [];
  const entries = (sidecar && typeof sidecar.artifacts === "object" && sidecar.artifacts) || {};

  const withKeywords = artifacts.map((artifact) => {
    const entry = entries[artifact.id];

    if (!entry) {
      warnings.push(`[keywords] "${artifact.id}" has no sidecar entry — it will not be reachable by keyword search.`);
      return { ...artifact, keywords: [] };
    }

    const expectedHash = contentHashOf(artifact);
    if (entry.contentHash !== expectedHash) {
      warnings.push(
        `[keywords] "${artifact.id}" content has drifted from its keyword sidecar ` +
          `(stored ${entry.contentHash ?? "<none>"}, expected ${expectedHash}) — keywords may be stale.`
      );
    }

    const rawKeywords = Array.isArray(entry.keywords) ? entry.keywords.map(String) : [];
    const tagSet = new Set((artifact.tags || []).map(normalize));
    const nameTokenSet = new Set(displayNameTokens(artifact.displayName));

    const seen = new Set();
    const deduped = [];
    for (const kw of rawKeywords) {
      const norm = normalize(kw);
      if (!norm || seen.has(norm)) continue;
      if (tagSet.has(norm) || nameTokenSet.has(norm)) continue;
      seen.add(norm);
      deduped.push(kw);
    }

    // Guard: never let the dedupe strip empty an array that had content.
    const keywords = deduped.length > 0 ? deduped : rawKeywords;

    return { ...artifact, keywords };
  });

  return { artifacts: withKeywords, warnings };
}
