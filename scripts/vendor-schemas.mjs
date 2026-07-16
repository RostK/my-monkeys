#!/usr/bin/env node
/**
 * vendor-schemas.mjs — vendor + drift-check the two Claude Code JSON Schemas.
 *
 * One script, two modes (AC-39 / AC-40's engine):
 *   --check   fetch each schema from its recorded provenance URL and diff it,
 *             byte-for-byte, against the committed copy in schemas/. Exits
 *             non-zero and names the file on any drift. Never writes.
 *   --write   fetch each schema, assert it is still vendorable (valid JSON,
 *             no external `$ref`), overwrite the committed copy with the
 *             byte-exact fetched content, and restamp schemas/provenance.json
 *             (url, vendoredAt, sha256) — the sidecar, never the schema body
 *             itself (AC-39: provenance must not fork the copy from upstream).
 *
 * This is also AC-40's drift-detection engine: a scheduled workflow runs
 * `--check`; on drift it can re-run `--write` and open a PR with the diff.
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
  const problems = [];
  for (const { file, url } of SCHEMAS) {
    const committedPath = join(SCHEMAS_DIR, file);
    if (!existsSync(committedPath)) {
      problems.push(`${rel(committedPath)}: no committed copy found`);
      continue;
    }
    const committed = readFileSync(committedPath, "utf8");
    let upstream;
    try {
      upstream = await fetchSchema(url);
    } catch (err) {
      problems.push(`${rel(committedPath)}: could not fetch ${url} — ${err.message}`);
      continue;
    }
    if (upstream !== committed) {
      problems.push(
        `${rel(committedPath)}: drift detected — committed copy (${committed.length} bytes, sha256 ${sha256(committed)}) differs from upstream ${url} (${upstream.length} bytes, sha256 ${sha256(upstream)})`,
      );
    } else {
      console.log(`OK  ${rel(committedPath)} matches upstream (${url})`);
    }
  }

  if (problems.length > 0) {
    console.error("schemas:check FAILED — vendored copy is out of date:");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("Run `npm run schemas:update` to refresh the vendored copy.");
    process.exitCode = 1;
    return;
  }
  console.log("schemas:check OK — both vendored copies match their upstream URL.");
}

async function runWrite() {
  const provenance = readProvenance();
  for (const { file, url } of SCHEMAS) {
    const committedPath = join(SCHEMAS_DIR, file);
    const upstreamText = await fetchSchema(url);
    await assertVendorable(url, upstreamText);
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
