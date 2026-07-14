// Unit tests for the gzip summation, the AC-21 pass/fail boundary, and the
// AC-29 forbidden-asset guard — all against small FIXTURE directories built
// with mkdtempSync. Deliberately does NOT require a real `npm run build`;
// scripts/check-dist.mjs computing real numbers off `preview/dist` is proven
// manually per the task's Definition of Done, not by this suite.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { gzipSync } from "node:zlib";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listBudgetedAssets,
  gzippedSize,
  sumGzippedDistBytes,
  evaluateBudget,
  findForbiddenIndexAssets,
  runCheck,
} from "./check-dist.mjs";

let fixtureRoot;

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "check-dist-fixture-"));
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function makeDist(root, { assets = {}, indexHtml = "<html></html>", extra = {} } = {}) {
  const assetsDir = join(root, "assets");
  mkdirSync(assetsDir, { recursive: true });
  for (const [name, content] of Object.entries(assets)) {
    writeFileSync(join(assetsDir, name), content);
  }
  if (indexHtml !== null) writeFileSync(join(root, "index.html"), indexHtml);
  for (const [relPath, content] of Object.entries(extra)) {
    const abs = join(root, relPath);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
}

describe("listBudgetedAssets + sumGzippedDistBytes", () => {
  it("globs content-hashed assets/*.js and assets/*.css plus index.html, and EXCLUDES everything else, matching a hand-computed gzip sum", () => {
    const js = "console.log('a'.repeat(200));";
    const css = "body { color: red; }".repeat(20);
    const html = "<!doctype html><html><body>hi</body></html>";
    makeDist(fixtureRoot, {
      assets: {
        "index-aCsLv5IB.js": js, // content-hashed filename — never hard-coded
        "DetailModal-D4Cw38Gv.js": js,
        "index-DAtNVY8Q.css": css,
        "logo-x8f2.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]), // must be ignored: not .js/.css
      },
      indexHtml: html,
      extra: {
        "favicon.ico": Buffer.from([0, 1, 2]), // static public/ asset — must be ignored
        "site.webmanifest": "{}", // must be ignored (not under assets/, not index.html)
      },
    });

    const assets = listBudgetedAssets(fixtureRoot);
    expect(assets).toHaveLength(4);
    expect(assets.every((f) => f.endsWith(".js") || f.endsWith(".css") || f.endsWith("index.html"))).toBe(true);
    expect(assets.some((f) => f.includes("favicon"))).toBe(false);
    expect(assets.some((f) => f.includes("webmanifest"))).toBe(false);

    const expectedTotal =
      gzipSync(Buffer.from(js)).length * 2 + gzipSync(Buffer.from(css)).length + gzipSync(Buffer.from(html)).length;
    expect(sumGzippedDistBytes(fixtureRoot)).toBe(expectedTotal);
    // gzippedSize itself matches a plain zlib call on the same bytes.
    expect(gzippedSize(join(fixtureRoot, "index.html"))).toBe(gzipSync(Buffer.from(html)).length);
  });

  it("returns an empty total for a dist dir with no assets/ folder", () => {
    makeDist(fixtureRoot, { assets: {}, indexHtml: null });
    expect(listBudgetedAssets(fixtureRoot)).toEqual([]);
    expect(sumGzippedDistBytes(fixtureRoot)).toBe(0);
  });
});

describe("evaluateBudget (AC-21 pass/fail boundary)", () => {
  it("passes when the delta is under the ceiling, passes AT the ceiling, and fails one byte over it", () => {
    const under = evaluateBudget({ totalGzipBytes: 1000, baselineGzipBytes: 900, maxDeltaBytes: 200 });
    expect(under).toEqual({ delta: 100, pass: true });

    const atCeiling = evaluateBudget({ totalGzipBytes: 1100, baselineGzipBytes: 900, maxDeltaBytes: 200 });
    expect(atCeiling).toEqual({ delta: 200, pass: true });

    const overCeiling = evaluateBudget({ totalGzipBytes: 1101, baselineGzipBytes: 900, maxDeltaBytes: 200 });
    expect(overCeiling).toEqual({ delta: 201, pass: false });
  });

  it("a shrinking bundle (negative delta) always passes", () => {
    const shrunk = evaluateBudget({ totalGzipBytes: 500, baselineGzipBytes: 900, maxDeltaBytes: 200 });
    expect(shrunk.delta).toBe(-400);
    expect(shrunk.pass).toBe(true);
  });
});

describe("findForbiddenIndexAssets (AC-29)", () => {
  it("finds nothing in a clean dist tree of only js/css/html/binary assets", () => {
    makeDist(fixtureRoot, {
      assets: { "index-abc123.js": "x", "index-abc123.css": "x" },
      indexHtml: "<html></html>",
      extra: { "favicon.ico": Buffer.from([0]) },
    });
    expect(findForbiddenIndexAssets(fixtureRoot)).toEqual([]);
  });

  it("flags a pre-serialized MiniSearch.toJSON() dump by name, wherever it is nested", () => {
    makeDist(fixtureRoot, {
      assets: { "index-abc123.js": "x" },
      extra: { "search-index.json": "{}", "nested/minisearch.bin": "x" },
    });
    const offenders = findForbiddenIndexAssets(fixtureRoot);
    expect(offenders).toHaveLength(2);
    expect(offenders.some((f) => f.endsWith("search-index.json"))).toBe(true);
    expect(offenders.some((f) => f.endsWith("minisearch.bin"))).toBe(true);
  });

  it("flags ANY stray .json file, since the app ships its catalog bundled into JS, never as a file", () => {
    makeDist(fixtureRoot, {
      assets: { "index-abc123.js": "x" },
      extra: { "unrelated-data.json": "{}" },
    });
    expect(findForbiddenIndexAssets(fixtureRoot)).toEqual([join(fixtureRoot, "unrelated-data.json")]);
  });

  it("returns [] when the dist directory itself does not exist", () => {
    expect(findForbiddenIndexAssets(join(fixtureRoot, "does-not-exist"))).toEqual([]);
  });
});

describe("runCheck (integration of both gates against a fixture dist + budget)", () => {
  // Mirrors the real repo layout: dist-budget.json lives NEXT TO dist/, not
  // inside it — findForbiddenIndexAssets only walks distDir, so the budget
  // file itself must never be mistaken for a shipped asset.
  function writeBudget(root, budget) {
    const path = join(root, "dist-budget.json");
    writeFileSync(path, JSON.stringify(budget));
    return path;
  }

  it("PASSES and reports the byte delta when the built bundle is within budget and nothing forbidden shipped", () => {
    const distDir = join(fixtureRoot, "dist");
    const html = "<html></html>";
    makeDist(distDir, { assets: { "index-x.js": "console.log(1)" }, indexHtml: html });
    const totalGzipBytes = sumGzippedDistBytes(distDir);
    const budgetPath = writeBudget(fixtureRoot, {
      baselineGzipBytes: totalGzipBytes - 10,
      maxDeltaBytes: 1000,
    });

    const result = runCheck({ distDir, budgetPath });
    expect(result.ok).toBe(true);
    expect(result.delta).toBe(10);
    expect(result.messages.some((m) => m.includes("OK — bundle within budget"))).toBe(true);
    expect(result.messages.some((m) => m.includes("OK — no pre-serialized"))).toBe(true);
    // The delta is always printed, pass or fail (task requirement).
    expect(result.messages.join("\n")).toMatch(/delta:/);
  });

  it("FAILS when a deliberately inflated bundle exceeds the ceiling, but still prints the delta", () => {
    const distDir = join(fixtureRoot, "dist");
    makeDist(distDir, { assets: { "index-x.js": "console.log('a'.repeat(5000))" }, indexHtml: "<html></html>" });
    const totalGzipBytes = sumGzippedDistBytes(distDir);
    const budgetPath = writeBudget(fixtureRoot, {
      baselineGzipBytes: totalGzipBytes - 5,
      maxDeltaBytes: 2, // tiny ceiling — the fixture bundle blows past it
    });

    const result = runCheck({ distDir, budgetPath });
    expect(result.ok).toBe(false);
    expect(result.delta).toBe(5);
    expect(result.messages.some((m) => m.includes("FAIL — bundle grew by"))).toBe(true);
    expect(result.messages.join("\n")).toMatch(/delta:/);
  });

  it("FAILS when a forbidden pre-serialized asset ships, even if the byte budget itself passes", () => {
    const distDir = join(fixtureRoot, "dist");
    makeDist(distDir, {
      assets: { "index-x.js": "console.log(1)" },
      indexHtml: "<html></html>",
      extra: { "search-index.json": "{}" },
    });
    const totalGzipBytes = sumGzippedDistBytes(distDir);
    const budgetPath = writeBudget(fixtureRoot, { baselineGzipBytes: totalGzipBytes, maxDeltaBytes: 999999 });

    const result = runCheck({ distDir, budgetPath });
    expect(result.ok).toBe(false);
    expect(result.messages.some((m) => m.includes("FAIL") && m.includes("AC-29"))).toBe(true);
  });

  it("reports a clean failure (not a throw) when the dist directory does not exist", () => {
    const missingDist = join(fixtureRoot, "no-dist-here");
    const budgetPath = writeBudget(fixtureRoot, { baselineGzipBytes: 0, maxDeltaBytes: 100 });
    let result;
    expect(() => {
      result = runCheck({ distDir: missingDist, budgetPath });
    }).not.toThrow();
    expect(result.ok).toBe(false);
    expect(result.messages[0]).toMatch(/dist directory not found/);
  });
});

describe("dist-budget.json (the committed baseline this repo actually gates on)", () => {
  it("is present, well-formed, and carries a real measuredFrom sha", () => {
    const raw = JSON.parse(readFileSync(new URL("../dist-budget.json", import.meta.url), "utf8"));
    expect(typeof raw.baselineGzipBytes).toBe("number");
    expect(raw.baselineGzipBytes).toBeGreaterThan(0);
    expect(raw.maxDeltaBytes).toBe(12288); // AC-21: 12 KiB ceiling
    expect(raw.measuredFrom).toMatch(/^[0-9a-f]{40}$/);
  });
});
