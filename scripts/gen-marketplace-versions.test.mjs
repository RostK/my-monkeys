import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  splitTopLevelObjects,
  findPluginsArraySpan,
  replaceEntryVersion,
  verifyRegeneration,
} from "./gen-marketplace-versions.mjs";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(THIS_DIR, "..");

describe("splitTopLevelObjects (AC-18 text-surgery primitive)", () => {
  it("finds each top-level object in an array body, ignoring nested objects", () => {
    const body = `\n    { "a": 1, "nested": { "b": 2 } },\n    { "a": 3 }\n  `;
    const spans = splitTopLevelObjects(body);
    expect(spans).toHaveLength(2);
    expect(body.slice(spans[0].start, spans[0].end)).toBe('{ "a": 1, "nested": { "b": 2 } }');
    expect(body.slice(spans[1].start, spans[1].end)).toBe('{ "a": 3 }');
  });

  it("is string-aware — braces inside a string value do not confuse depth tracking", () => {
    const body = `{ "description": "has a { brace } inside" }`;
    const spans = splitTopLevelObjects(body);
    expect(spans).toHaveLength(1);
    expect(body.slice(spans[0].start, spans[0].end)).toBe(body);
  });
});

describe("findPluginsArraySpan", () => {
  it("locates the plugins array body, tolerant of other top-level keys", () => {
    const text = '{\n  "name": "x",\n  "plugins": [\n    { "a": 1 }\n  ]\n}\n';
    const span = findPluginsArraySpan(text);
    expect(text.slice(span.start, span.end)).toBe('\n    { "a": 1 }\n  ');
  });

  it("throws when there is no top-level plugins array", () => {
    expect(() => findPluginsArraySpan('{ "name": "x" }')).toThrow(/plugins/);
  });

  // Regression for the review finding: findPluginsArraySpan had the SAME
  // "first textual match" bug replaceEntryVersion was fixed for — a flat
  // /"plugins"\s*:\s*\[/ regex matches whichever "plugins" text appears
  // FIRST, not the top-level one. A schema-valid marketplace.json (no
  // additionalProperties:false at the top level or on "metadata") could
  // legitimately carry a nested "plugins" key ahead of the real one.
  it("nested \"plugins\" key: finds the REAL top-level array, ignoring an earlier same-named nested key", () => {
    const text = '{"metadata":{"plugins":["nested"]},"plugins":[{"a":1}]}';
    const span = findPluginsArraySpan(text);
    expect(text.slice(span.start, span.end)).toBe('{"a":1}');
  });

  it("today's real marketplace.json shape (nested \"owner\" object before \"plugins\"): still works unchanged", () => {
    const text =
      '{\n  "name": "my-monkeys",\n  "owner": {\n    "name": "RostK",\n    "email": "rkaniuchenko@gmail.com"\n  },\n  "description": "d",\n  "plugins": [\n    { "name": "a", "version": "1.0.0" }\n  ]\n}\n';
    const span = findPluginsArraySpan(text);
    expect(text.slice(span.start, span.end)).toBe('\n    { "name": "a", "version": "1.0.0" }\n  ');
  });
});

describe("main() CLI error handling (FIX-4b)", () => {
  // Runs the actual script as a child process against a throwaway fixture
  // repo so main()'s try/catch around findPluginsArraySpan/splitTopLevelObjects
  // is exercised end-to-end, not just the primitive's own thrown Error. The
  // real validate-manifests.mjs (which imports "ajv" from this repo's
  // node_modules) is swapped for a trivial stub — the error path under test
  // returns from main() before resolvePluginManifestPath is ever called, so
  // the stub's behavior is irrelevant, only its export shape matters, and
  // this keeps the fixture self-contained (no node_modules to wire up).
  function runInFixture(marketplaceContent) {
    const tmpRoot = mkdtempSync(join(tmpdir(), "gen-marketplace-fixture-"));
    try {
      const scriptsDir = join(tmpRoot, "scripts");
      mkdirSync(scriptsDir, { recursive: true });
      cpSync(join(REPO_ROOT, "scripts", "gen-marketplace-versions.mjs"), join(scriptsDir, "gen-marketplace-versions.mjs"));
      writeFileSync(
        join(scriptsDir, "validate-manifests.mjs"),
        "export function resolvePluginManifestPath() { throw new Error('stub not implemented — unused on this test error path'); }\n",
      );
      const marketplaceDir = join(tmpRoot, ".claude-plugin");
      mkdirSync(marketplaceDir, { recursive: true });
      const marketplacePath = join(marketplaceDir, "marketplace.json");
      writeFileSync(marketplacePath, marketplaceContent);

      const result = spawnSync(process.execPath, [join(scriptsDir, "gen-marketplace-versions.mjs")], {
        encoding: "utf8",
      });
      return { ...result, marketplacePath, marketplaceAfter: readFileSync(marketplacePath, "utf8") };
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  it("valid JSON with no top-level \"plugins\" key: clean named error, non-zero exit, no raw stack trace, nothing written", () => {
    const before = '{ "name": "x" }';
    const { status, stderr, marketplaceAfter } = runInFixture(before);
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/gen:marketplace FAILED/);
    expect(stderr).toContain("marketplace.json");
    // No raw Node stack trace ("    at ...") leaked to the user.
    expect(stderr).not.toMatch(/\n\s*at /);
    // Nothing was written — the file is exactly what it started as.
    expect(marketplaceAfter).toBe(before);
  });
});

describe("replaceEntryVersion", () => {
  it("replaces only the entry's own (first) version field, leaving everything else byte-identical", () => {
    const entry = '{\n      "name": "x",\n      "source": "./plugins/x",\n      "version": "1.0.0",\n      "description": "d",\n      "dependencies": [\n        { "name": "y", "version": "^1.0.0" }\n      ]\n    }';
    const { text, changed } = replaceEntryVersion(entry, "1.2.0");
    expect(changed).toBe(true);
    expect(text).toContain('"version": "1.2.0"');
    // The nested dependency's version must be untouched.
    expect(text).toContain('"version": "^1.0.0"');
    // Nothing else in the entry changed.
    expect(text.replace('"version": "1.2.0"', '"version": "1.0.0"')).toBe(entry);
  });

  it("is a no-op (changed: false, identical text) when the version already matches", () => {
    const entry = '{ "name": "x", "version": "1.0.0" }';
    const { text, changed } = replaceEntryVersion(entry, "1.0.0");
    expect(changed).toBe(false);
    expect(text).toBe(entry);
  });

  it("returns the text unchanged when the entry has no version field", () => {
    const entry = '{ "name": "x" }';
    const { text, changed } = replaceEntryVersion(entry, "1.0.0");
    expect(changed).toBe(false);
    expect(text).toBe(entry);
  });

  // Regression for the "first `"version"` occurrence" bug: the old
  // implementation matched via a flat /"version"\s*:\s*"([^"]*)"/ regex, so
  // whichever "version" text appeared FIRST in the entry — the entry's own
  // field, or a nested dependency's — got overwritten. Nothing in valid JSON
  // enforces `source` before `dependencies` before `version`; this case (own
  // "version" declared AFTER "dependencies") FAILS on that old regex (it
  // corrupts the dependency range and leaves the entry's own version stale)
  // and PASSES with the depth-aware findTopLevelStringField scanner.
  it("dependencies BEFORE version: updates only the entry's own version, leaves the dependency range untouched", () => {
    const entry =
      '{\n      "name": "x",\n      "source": "./plugins/x",\n      "dependencies": [\n        { "name": "engineering-paved-path", "version": "^1.0.0" }\n      ],\n      "version": "1.0.0",\n      "description": "d"\n    }';
    const { text, changed } = replaceEntryVersion(entry, "2.0.0");
    expect(changed).toBe(true);
    // The entry's OWN version was updated.
    expect(text).toContain('"version": "2.0.0"');
    // The nested dependency's semver RANGE must be untouched — this is the
    // exact corruption PROVEN by execution in the review finding.
    expect(text).toContain('"version": "^1.0.0"');
    // Nothing else in the entry changed.
    expect(text.replace('"version": "2.0.0"', '"version": "1.0.0"')).toBe(entry);
  });

  it("dependencies AFTER version (today's real marketplace.json shape): unchanged behavior", () => {
    const entry =
      '{\n      "name": "sdd-engineering",\n      "source": "./plugins/sdd-engineering",\n      "version": "1.1.1",\n      "description": "d",\n      "dependencies": [\n        { "name": "engineering-paved-path", "version": "^1.0.0" },\n        { "name": "research-tools", "version": "^1.0.0" }\n      ]\n    }';
    const { text, changed } = replaceEntryVersion(entry, "1.2.0");
    expect(changed).toBe(true);
    expect(text).toContain('"version": "1.2.0"');
    expect(text).toContain('{ "name": "engineering-paved-path", "version": "^1.0.0" }');
    expect(text).toContain('{ "name": "research-tools", "version": "^1.0.0" }');
    expect(text.replace('"version": "1.2.0"', '"version": "1.1.1"')).toBe(entry);
  });
});

describe("verifyRegeneration (round-trip guard, defense-in-depth for the text surgery)", () => {
  const original = {
    name: "my-monkeys",
    plugins: [
      { name: "a", source: "./plugins/a", version: "1.0.0" },
      { name: "b", source: "./plugins/b", version: "1.0.0", dependencies: [{ name: "a", version: "^1.0.0" }] },
    ],
  };

  it("passes (returns null) when only the intended plugins[].version fields changed", () => {
    const regenerated = {
      name: "my-monkeys",
      plugins: [
        { name: "a", source: "./plugins/a", version: "2.0.0" },
        { name: "b", source: "./plugins/b", version: "1.0.0", dependencies: [{ name: "a", version: "^1.0.0" }] },
      ],
    };
    const result = verifyRegeneration(original, regenerated, ["2.0.0", "1.0.0"]);
    expect(result).toBeNull();
  });

  // The guard: a structurally-wrong result (here, simulating the old bug —
  // a dependency's nested version got corrupted instead of the entry's own)
  // must fail closed (a non-null reason), not silently pass.
  it("fails closed with a reason when a surgery corrupts something other than the intended version", () => {
    const corrupted = {
      name: "my-monkeys",
      plugins: [
        { name: "a", source: "./plugins/a", version: "2.0.0" },
        // "b"'s own version was NOT updated (still 1.0.0, correct target),
        // but its nested dependency range got mangled — exactly the bug
        // PROVEN by execution in the review finding.
        { name: "b", source: "./plugins/b", version: "1.0.0", dependencies: [{ name: "a", version: "2.0.0" }] },
      ],
    };
    const result = verifyRegeneration(original, corrupted, ["2.0.0", "1.0.0"]);
    expect(result).not.toBeNull();
    expect(result).toMatch(/plugins\[1\]/);
  });

  it("fails closed when an entry's version does not match the resolved authoritative value", () => {
    const wrongVersion = {
      name: "my-monkeys",
      plugins: [
        { name: "a", source: "./plugins/a", version: "9.9.9" },
        { name: "b", source: "./plugins/b", version: "1.0.0", dependencies: [{ name: "a", version: "^1.0.0" }] },
      ],
    };
    const result = verifyRegeneration(original, wrongVersion, ["2.0.0", "1.0.0"]);
    expect(result).not.toBeNull();
    expect(result).toMatch(/plugins\[0\]/);
  });
});
