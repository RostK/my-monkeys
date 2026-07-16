import { describe, it, expect } from "vitest";
import { join, sep } from "node:path";
import { isContained, findDuplicateNames, resolvePluginManifestPath, REPO_ROOT } from "./validate-manifests.mjs";

// Build paths with path.join/path.sep (never a hardcoded "C:\\..." or "/...")
// so these assertions hold on both Windows and POSIX CI runners — isContained
// is defined in terms of the platform's own path.sep.
const root = join(sep, "repo");

describe("isContained (AC-33 containment primitive)", () => {
  it("accepts the root itself and paths strictly inside it", () => {
    expect(isContained(root, root)).toBe(true);
    expect(isContained(root, join(root, "plugins", "foo"))).toBe(true);
  });

  it("rejects a sibling directory whose name merely starts with the root's name", () => {
    // The classic naive-startsWith bug: "<root>-evil" must not pass a check
    // against "<root>" without a trailing separator.
    const evilSibling = root + "-evil";
    expect(isContained(root, evilSibling)).toBe(false);
    expect(isContained(root, join(evilSibling, "plugins"))).toBe(false);
  });

  it("rejects a path that has traversed above the root", () => {
    expect(isContained(join(root, "sub"), join(root, "outside"))).toBe(false);
    expect(isContained(root, join(sep, "elsewhere"))).toBe(false);
  });
});

describe("findDuplicateNames (AC-34)", () => {
  it("returns nothing when every plugin name is unique", () => {
    const plugins = [{ name: "a" }, { name: "b" }, { name: "c" }];
    expect(findDuplicateNames(plugins)).toEqual([]);
  });

  it("reports every entry whose name was already declared by an earlier entry", () => {
    const plugins = [{ name: "a" }, { name: "b" }, { name: "a" }, { name: "b" }];
    expect(findDuplicateNames(plugins)).toEqual([
      { index: 2, name: "a" },
      { index: 3, name: "b" },
    ]);
  });

  it("does not throw or misbehave on a dangerous prototype-pollution-style name", () => {
    const plugins = [{ name: "__proto__" }, { name: "__proto__" }, { name: "constructor" }];
    expect(findDuplicateNames(plugins)).toEqual([{ index: 1, name: "__proto__" }]);
    // Confirms no plain-object lookup was polluted by the "__proto__" key.
    expect({}.polluted).toBeUndefined();
  });

  it("ignores entries with a missing or non-string name", () => {
    const plugins = [{ name: "a" }, {}, { name: 123 }, { name: "a" }];
    expect(findDuplicateNames(plugins)).toEqual([{ index: 3, name: "a" }]);
  });
});

describe("resolvePluginManifestPath (AC-33, against the real repo tree)", () => {
  it("resolves a legitimate in-repo source to its plugin.json", () => {
    const errors = [];
    const result = resolvePluginManifestPath("./plugins/engineering-paved-path", "test-entry", errors);
    expect(errors).toEqual([]);
    expect(result).toBe(join(REPO_ROOT, "plugins", "engineering-paved-path", ".claude-plugin", "plugin.json"));
  });

  it("rejects a traversal source that resolves outside the repo root", () => {
    const errors = [];
    const result = resolvePluginManifestPath("../outside", "test-entry", errors);
    expect(result).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("test-entry");
    expect(errors[0]).toContain("outside the repository root");
  });

  it("rejects an absolute path outright", () => {
    const errors = [];
    // A platform-correct absolute path (path.isAbsolute("C:\\x") is false on
    // POSIX, so build one that is genuinely absolute on whichever OS runs this).
    const absolutePath = join(sep, "etc", "evil");
    const result = resolvePluginManifestPath(absolutePath, "test-entry", errors);
    expect(result).toBeNull();
    expect(errors[0]).toContain("absolute path");
  });

  it("rejects a source that does not resolve to an existing directory", () => {
    const errors = [];
    const result = resolvePluginManifestPath("./plugins/does-not-exist", "test-entry", errors);
    expect(result).toBeNull();
    expect(errors[0]).toContain("does not resolve to an existing directory");
  });

  it("rejects a source directory that has no .claude-plugin/plugin.json", () => {
    const errors = [];
    // "schemas/" exists in the repo root but is not a plugin directory.
    const result = resolvePluginManifestPath("./schemas", "test-entry", errors);
    expect(result).toBeNull();
    expect(errors[0]).toContain("does not contain a .claude-plugin/plugin.json");
  });
});
