#!/usr/bin/env node
/**
 * vendor-schemas.mjs — vendor + drift-check the two Claude Code JSON Schemas.
 *
 * One script, two modes (AC-39 / AC-40's engine):
 *   --check   fetch each schema from its recorded provenance URL and diff it,
 *             byte-for-byte, against the committed copy in schemas/. Names
 *             the file on any problem. Never writes.
 *   --write   fetch each schema, assert it is still vendorable (valid JSON,
 *             no external `$ref`), overwrite the committed copy with the
 *             byte-exact fetched content, and restamp schemas/provenance.json
 *             (url, vendoredAt, sha256) — the sidecar, never the schema body
 *             itself (AC-39: provenance must not fork the copy from upstream).
 *
 * This is also AC-40's drift-detection engine: a scheduled workflow runs
 * `--check`; on drift it can re-run `--write` and open a PR with the diff.
 *
 * `--check` exit-code contract (FIX-3a — the two failure shapes below are
 * NOT interchangeable; a caller that treats them the same tells a
 * drift-shaped story for what may only be "upstream unreachable"):
 *   0 = in sync — every committed copy byte-matches its upstream URL.
 *   1 = real drift — at least one committed copy differs from a
 *       successfully-fetched upstream, or a schema has no committed copy at
 *       all. Actionable: run `--write` to refresh it. Takes priority over 2
 *       when both occur in the same run (a real, confirmed problem exists).
 *   2 = fetch/transport failure, no confirmed drift — upstream could not be
 *       reached for at least one schema (DNS, network, non-2xx, ...) and no
 *       genuine drift was found among whichever schemas DID fetch
 *       successfully. This is NOT drift: re-running `--check` once the
 *       network recovers is the right next step, not `--write`. A caller
 *       that doesn't distinguish 1 from 2 and always retries with `--write`
 *       on any non-zero exit is no worse off than before this contract
 *       existed — `--write` will itself fail on the same unreachable host.
 *
 * Usage:
 *   node scripts/vendor-schemas.mjs --check
 *   node scripts/vendor-schemas.mjs --write
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMAS_DIR = join(REPO_ROOT, "schemas");
const PROVENANCE_PATH = join(SCHEMAS_DIR, "provenance.json");

const SCHEMAS = [
  {
    file: "claude-code-marketplace.json",
    url: "https://json.schemastore.org/claude-code-marketplace.json",
  },
  {
    file: "claude-code-plugin-manifest.json",
    url: "https://json.schemastore.org/claude-code-plugin-manifest.json",
  },
];

const rel = (abs) => abs.slice(REPO_ROOT.length + 1).replace(/\\/g, "/");
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

function readJsonSafe(path, label) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`${label}: cannot read ${rel(path)} — ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label}: ${rel(path)} is not valid JSON — ${err.message}`);
  }
}

/** Every `$ref` value that contains `://` is an external reference. */
function findExternalRefs(node, path = "#") {
  const found = [];
  if (Array.isArray(node)) {
    node.forEach((item, i) => found.push(...findExternalRefs(item, `${path}/${i}`)));
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string" && value.includes("://")) {
        found.push(`${path}/$ref -> ${value}`);
      } else {
        found.push(...findExternalRefs(value, `${path}/${key}`));
      }
    }
  }
  return found;
}

async function fetchSchema(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: HTTP ${res.status}`);
  }
  return res.text();
}

async function assertVendorable(url, text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`fetched schema from ${url} is not valid JSON — ${err.message}`);
  }
  // compile()-only assertion (AC-15/AC-39): a future upstream schema that
  // gains an external $ref would silently need compileAsync/loadSchema; fail
  // loudly here instead of vendoring an incomplete document.
  const externalRefs = findExternalRefs(parsed);
  if (externalRefs.length > 0) {
    throw new Error(
      `fetched schema from ${url} contains external $ref(s), which ajv.compile() cannot resolve: ${externalRefs.join(", ")}`,
    );
  }
  return parsed;
}

function readProvenance() {
  if (!existsSync(PROVENANCE_PATH)) return {};
  return readJsonSafe(PROVENANCE_PATH, "provenance");
}

async function runCheck() {
  // Two distinct failure shapes, kept in separate buckets so the exit code
  // can tell them apart (see the exit-code contract in the header comment):
  // driftProblems = a confirmed difference between upstream and committed
  // (or a missing committed copy); fetchProblems = upstream was unreachable,
  // so drift could not even be determined for that schema.
  const driftProblems = [];
  const fetchProblems = [];
  for (const { file, url } of SCHEMAS) {
    const committedPath = join(SCHEMAS_DIR, file);
    if (!existsSync(committedPath)) {
      driftProblems.push(`${rel(committedPath)}: no committed copy found`);
      continue;
    }
    const committed = readFileSync(committedPath, "utf8");
    let upstream;
    try {
      upstream = await fetchSchema(url);
    } catch (err) {
      fetchProblems.push(`${rel(committedPath)}: could not fetch ${url} — ${err.message}`);
      continue;
    }
    if (upstream !== committed) {
      driftProblems.push(
        `${rel(committedPath)}: drift detected — committed copy (${committed.length} bytes, sha256 ${sha256(committed)}) differs from upstream ${url} (${upstream.length} bytes, sha256 ${sha256(upstream)})`,
      );
    } else {
      console.log(`OK  ${rel(committedPath)} matches upstream (${url})`);
    }
  }

  if (driftProblems.length > 0) {
    console.error("schemas:check FAILED — vendored copy is out of date (real drift):");
    for (const p of driftProblems) console.error(`  - ${p}`);
    if (fetchProblems.length > 0) {
      console.error("Also could not verify the following (treat separately — not drift):");
      for (const p of fetchProblems) console.error(`  - ${p}`);
    }
    console.error("Run `npm run schemas:update` to refresh the vendored copy.");
    process.exitCode = 1;
    return;
  }

  if (fetchProblems.length > 0) {
    console.error("schemas:check FAILED — could not reach upstream to verify drift (not drift itself):");
    for (const p of fetchProblems) console.error(`  - ${p}`);
    console.error("This is a fetch/transport failure, not confirmed drift — retry once upstream is reachable.");
    process.exitCode = 2;
    return;
  }

  console.log("schemas:check OK — both vendored copies match their upstream URL.");
}

async function runWrite() {
  const provenance = readProvenance();

  // Validate-then-write-all (FIX-4c): fetch + assertVendorable BOTH schemas
  // fully into memory first — no writes at all — so a failure partway
  // through (e.g. schema #2's fetch or assertVendorable throwing after
  // schema #1 already succeeded) can never leave one schema file rewritten
  // on disk while schemas/provenance.json — the invariant this file's own
  // header comment promises stays in lockstep with the vendored copies —
  // still describes the old state. Only once every fetch and validation has
  // succeeded do we perform any writes; a failure anywhere leaves the tree
  // completely untouched.
  const fetched = [];
  for (const { file, url } of SCHEMAS) {
    const upstreamText = await fetchSchema(url);
    await assertVendorable(url, upstreamText);
    fetched.push({ file, url, upstreamText });
  }

  for (const { file, url, upstreamText } of fetched) {
    const committedPath = join(SCHEMAS_DIR, file);
    writeFileSync(committedPath, upstreamText);
    provenance[file] = {
      url,
      vendoredAt: new Date().toISOString(),
      sha256: sha256(upstreamText),
    };
    console.log(`WROTE ${rel(committedPath)} <- ${url} (sha256 ${provenance[file].sha256})`);
  }
  writeFileSync(PROVENANCE_PATH, `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(`WROTE ${rel(PROVENANCE_PATH)}`);
}

async function main() {
  const mode = process.argv.includes("--write")
    ? "write"
    : process.argv.includes("--check")
      ? "check"
      : null;

  if (!mode) {
    console.error("Usage: node scripts/vendor-schemas.mjs --check | --write");
    process.exitCode = 2;
    return;
  }

  if (mode === "check") await runCheck();
  else await runWrite();
}

main().catch((err) => {
  console.error(`vendor-schemas ${process.argv.includes("--write") ? "--write" : "--check"} FAILED: ${err.message}`);
  process.exitCode = 1;
});
