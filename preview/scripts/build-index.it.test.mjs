// Integration test: spawns `node scripts/build-index.mjs` for real (no mocking
// of fs/child_process) and asserts on the actual preview/src/catalog.json it
// writes. Slower than a unit test on purpose — this is the only place we
// prove the wiring in build-index.mjs (readSidecar + attachKeywords + the
// AC-20 "never exit non-zero" guarantee) actually works end to end.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PREVIEW_ROOT = resolve(HERE, ".."); // preview/
const BUILD_SCRIPT = resolve(PREVIEW_ROOT, "scripts", "build-index.mjs");
const CATALOG_PATH = resolve(PREVIEW_ROOT, "src", "catalog.json");
const KEYWORDS_PATH = resolve(PREVIEW_ROOT, "data", "keywords.json");
const KEYWORDS_BACKUP_PATH = resolve(PREVIEW_ROOT, "data", "keywords.json.it-backup");

function runBuildIndex() {
  return spawnSync(process.execPath, [BUILD_SCRIPT], {
    cwd: PREVIEW_ROOT,
    encoding: "utf8",
  });
}

describe("build-index.mjs (integration)", () => {
  it("exits 0, writes catalog.json, and attaches keywords to all 29 artifacts", () => {
    const result = runBuildIndex();
    expect(result.status).toBe(0);

    const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
    expect(catalog.artifacts.length).toBe(29);
    for (const artifact of catalog.artifacts) {
      expect(Array.isArray(artifact.keywords)).toBe(true);
      expect(artifact.keywords.length).toBeGreaterThan(0);
    }
  });

  it("produces tags byte-identical to the pre-change AC-13 baseline", () => {
    const result = runBuildIndex();
    expect(result.status).toBe(0);

    const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
    const stats = { plugins: 0, skills: 0, agents: 0, commands: 0 };
    const plural = { plugin: "plugins", skill: "skills", agent: "agents", command: "commands" };
    for (const a of catalog.artifacts) stats[plural[a.type]]++;
    expect(stats).toEqual({ plugins: 4, skills: 18, agents: 6, commands: 1 });

    const allTags = [...new Set(catalog.artifacts.flatMap((a) => a.tags))].sort();
    expect(allTags).toEqual([
      "architecture",
      "check",
      "citations",
      "creator",
      "design",
      "drizzle",
      "engineering",
      "expert",
      "fastify",
      "frontend",
      "implementation",
      "implementer",
      "insights",
      "investigation",
      "library",
      "next",
      "nextjs",
      "onion",
      "orm",
      "plan",
      "planner",
      "planning",
      "postgresql",
      "pr",
      "react",
      "read-only",
      "requirements",
      "research",
      "researcher",
      "retro",
      "review",
      "reviewer",
      "run",
      "sdd",
      "security",
      "self",
      "spec",
      "spec-driven-development",
      "structure",
      "table",
      "testing",
      "typescript",
      "ui",
      "verification",
      "verifier",
      "version",
      "write",
      "zod",
    ]);
  });

  it("is deterministic across two consecutive runs, excluding generatedAt/updatedAt timestamps", () => {
    const first = runBuildIndex();
    expect(first.status).toBe(0);
    const catalog1 = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));

    const second = runBuildIndex();
    expect(second.status).toBe(0);
    const catalog2 = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));

    // `catalog.generatedAt` is `new Date().toISOString()` at build time — it
    // legitimately differs between runs, as can `updatedAt` (a git commit
    // date) if git state moves under us. Strip both before comparing.
    const strip = (catalog) => ({
      ...catalog,
      generatedAt: null,
      artifacts: catalog.artifacts.map((a) => ({ ...a, updatedAt: null })),
    });

    expect(strip(catalog1)).toEqual(strip(catalog2));
  });

  it("still exits 0 and NAMES the artifact when a sidecar entry has a deliberately drifted hash", () => {
    mkdirSync(dirname(KEYWORDS_BACKUP_PATH), { recursive: true });
    copyFileSync(KEYWORDS_PATH, KEYWORDS_BACKUP_PATH);
    try {
      const sidecar = JSON.parse(readFileSync(KEYWORDS_PATH, "utf8"));
      const [firstId] = Object.keys(sidecar.artifacts);
      sidecar.artifacts[firstId].contentHash = "sha256:deliberately-drifted-for-test";
      writeFileSync(KEYWORDS_PATH, JSON.stringify(sidecar, null, 2) + "\n");

      const result = runBuildIndex();
      expect(result.status).toBe(0);
      expect(result.stderr).toContain(firstId);
    } finally {
      copyFileSync(KEYWORDS_BACKUP_PATH, KEYWORDS_PATH);
      rmSync(KEYWORDS_BACKUP_PATH, { force: true });
      // Restore catalog.json to the clean (non-drifted) state for subsequent tests/dev.
      runBuildIndex();
    }
  });
});
