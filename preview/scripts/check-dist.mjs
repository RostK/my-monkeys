/**
 * check-dist.mjs — the post-build CI gate for the shipped `preview/dist`
 * output. One script, one concern: "is the shipped dist within contract".
 *
 * Two independent checks, both driven by `runCheck()`:
 *  (a) AC-21 bundle budget — sums the GZIPPED bytes of every budgeted dist
 *      asset (assets/*.js, assets/*.css, index.html) and fails if it grew by
 *      more than `maxDeltaBytes` versus the committed baseline
 *      (dist-budget.json). Vite emits content-hashed filenames, so assets are
 *      always GLOBBED — never hard-coded.
 *  (b) AC-29 no-serialized-index — the MiniSearch index is built in the
 *      browser from the bundled catalog (see src/lib/search.js); nothing
 *      pre-serialized (e.g. `MiniSearch.toJSON()`) may ship. Fails if a file
 *      under dist LOOKS like a serialized search index — by name
 *      (`search-index.*`, `*minisearch*`) or by CONTENT (a `.json` file
 *      whose shape matches `MiniSearch.toJSON()` output, regardless of its
 *      filename). Deliberately does NOT flag every `.json` file — Vite
 *      copies `public/` verbatim into dist, so a legitimate static asset
 *      (`manifest.json`, `.well-known/*.json`) must ship without tripping
 *      this gate.
 *
 * Every exported function below is pure/fs-only and fixture-testable without
 * a real build — see check-dist.test.mjs.
 *
 * Usage: node scripts/check-dist.mjs   (run via `npm run check:dist`)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
// preview/scripts/check-dist.mjs -> preview/
const PREVIEW_ROOT = resolve(HERE, "..");
const DEFAULT_DIST_DIR = resolve(PREVIEW_ROOT, "dist");
const DEFAULT_BUDGET_PATH = resolve(PREVIEW_ROOT, "dist-budget.json");

/**
 * The exact set of dist assets counted toward the bundle budget (AC-21):
 * every JS/CSS chunk under `assets/` plus the HTML entry. Globbed by
 * extension, never by a hard-coded hashed filename. Deliberately EXCLUDES the
 * static binary assets Vite copies verbatim from `public/` (favicons,
 * manifest, `.nojekyll`) — those don't reflect the app bundle this budget
 * tracks.
 */
export function listBudgetedAssets(distDir) {
  const assetsDir = join(distDir, "assets");
  const assetFiles = existsSync(assetsDir)
    ? readdirSync(assetsDir, { withFileTypes: true })
        .filter((d) => d.isFile() && (d.name.endsWith(".js") || d.name.endsWith(".css")))
        .map((d) => join(assetsDir, d.name))
    : [];
  const indexHtml = join(distDir, "index.html");
  const htmlFiles = existsSync(indexHtml) ? [indexHtml] : [];
  return [...assetFiles, ...htmlFiles].sort();
}

/** Pure: the gzipped byte length of a single file's contents. */
export function gzippedSize(absPath) {
  return gzipSync(readFileSync(absPath)).length;
}

/** Sums the gzipped size of every budgeted asset in `distDir` (AC-21). */
export function sumGzippedDistBytes(distDir) {
  return listBudgetedAssets(distDir).reduce((total, file) => total + gzippedSize(file), 0);
}

/**
 * Pure pass/fail boundary (AC-21). Fails only when the delta STRICTLY
 * exceeds `maxDeltaBytes` — a delta sitting exactly at the ceiling passes,
 * matching the spec's "grow by no more than N bytes" wording.
 */
export function evaluateBudget({ totalGzipBytes, baselineGzipBytes, maxDeltaBytes }) {
  const delta = totalGzipBytes - baselineGzipBytes;
  return { delta, pass: delta <= maxDeltaBytes };
}

/**
 * Content-shape check: does this string parse as JSON that looks like
 * `MiniSearch.toJSON()` output? Real MiniSearch (v7.2.0, pinned in
 * package.json) dumps a distinctive, stable shape — `documentCount`,
 * `serializationVersion`, an `index` array of `[term, postings]` pairs, and a
 * `fieldIds` map. A legitimate static asset (e.g. `manifest.json`) will not
 * accidentally carry all four. Never throws — malformed/non-JSON content
 * simply doesn't match.
 */
function looksLikeSerializedMiniSearchIndex(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  return (
    typeof parsed.documentCount === "number" &&
    typeof parsed.serializationVersion === "number" &&
    Array.isArray(parsed.index) &&
    parsed.fieldIds !== null &&
    typeof parsed.fieldIds === "object"
  );
}

/**
 * AC-29 guard: flags a file anywhere under `distDir` that LOOKS like a
 * pre-serialized search index — either by NAME (`search-index.*`,
 * `*minisearch*`, catching an obviously-named dump even before opening it)
 * or by CONTENT (a `.json` file whose shape matches `MiniSearch.toJSON()`
 * output, catching a renamed/disguised dump the name check would miss).
 * Deliberately narrower than "every `.json` file under dist" — Vite copies
 * `public/` verbatim into dist, and a legitimate static JSON asset must not
 * fail this gate (see check-dist.test.mjs).
 */
export function findForbiddenIndexAssets(distDir) {
  if (!existsSync(distDir)) return [];
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        const looksLikeIndexByName = /search.?index/i.test(entry.name) || /minisearch/i.test(entry.name);
        const isJson = extname(entry.name).toLowerCase() === ".json";
        const looksLikeIndexByContent = isJson && looksLikeSerializedMiniSearchIndex(readFileSync(abs, "utf8"));
        if (looksLikeIndexByName || looksLikeIndexByContent) offenders.push(abs);
      }
    }
  };
  walk(distDir);
  return offenders;
}

function formatBytes(n) {
  return `${Math.abs(n).toLocaleString("en-US")} B`;
}

function formatSignedBytes(n) {
  const sign = n < 0 ? "-" : "+";
  return `${sign}${formatBytes(n)}`;
}

/**
 * Runs both checks against a real (or fixture) dist directory and returns a
 * structured result — never throws for an ordinary pass/fail, never touches
 * `process`. `main()` is the only thing that turns this into an exit code.
 */
export function runCheck({ distDir = DEFAULT_DIST_DIR, budgetPath = DEFAULT_BUDGET_PATH } = {}) {
  if (!existsSync(distDir)) {
    return {
      ok: false,
      messages: [`[check-dist] dist directory not found at ${distDir} — run "npm run build" first.`],
    };
  }

  if (!existsSync(budgetPath)) {
    return {
      ok: false,
      messages: [
        `[check-dist] budget file not found at ${budgetPath} — dist-budget.json is a committed artifact; ` +
          `restore it (e.g. "git checkout -- dist-budget.json") before running this check.`,
      ],
    };
  }

  let budget;
  try {
    budget = JSON.parse(readFileSync(budgetPath, "utf8"));
  } catch (err) {
    return {
      ok: false,
      messages: [
        `[check-dist] budget file at ${budgetPath} is not valid JSON (${err.message}) — dist-budget.json is a ` +
          `committed artifact; fix or restore it (e.g. "git checkout -- dist-budget.json") before running this check.`,
      ],
    };
  }

  const { baselineGzipBytes, maxDeltaBytes } = budget;
  const totalGzipBytes = sumGzippedDistBytes(distDir);
  const { delta, pass: budgetPass } = evaluateBudget({ totalGzipBytes, baselineGzipBytes, maxDeltaBytes });

  const messages = [];
  messages.push(
    `[check-dist] total gzipped: ${formatBytes(totalGzipBytes)} | baseline: ${formatBytes(baselineGzipBytes)} | ` +
      `delta: ${formatSignedBytes(delta)} (ceiling: +${formatBytes(maxDeltaBytes)})`
  );

  let ok = budgetPass;
  if (budgetPass) {
    messages.push("[check-dist] OK — bundle within budget (AC-21).");
  } else {
    messages.push(
      `[check-dist] FAIL — bundle grew by ${formatSignedBytes(delta)}, exceeding the ${formatBytes(maxDeltaBytes)} ceiling (AC-21).`
    );
  }

  const offenders = findForbiddenIndexAssets(distDir);
  if (offenders.length === 0) {
    messages.push("[check-dist] OK — no pre-serialized search-index asset in dist (AC-29).");
  } else {
    ok = false;
    messages.push(
      `[check-dist] FAIL — forbidden pre-serialized asset(s) found in dist (AC-29): ` +
        offenders.map((f) => relative(PREVIEW_ROOT, f)).join(", ")
    );
  }

  return { ok, messages, totalGzipBytes, baselineGzipBytes, delta };
}

function main() {
  const { ok, messages } = runCheck();
  for (const m of messages) console.log(m);
  process.exit(ok ? 0 : 1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}
