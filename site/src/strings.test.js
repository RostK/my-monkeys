import { describe, it, expect } from "vitest";
import { t } from "./strings.js";

// AC-17: the UI copy had drifted ahead of what the code does — `t.search`
// used to claim "semantic ranking", which MiniSearch's BM25 engine never
// provided. This is the enforcement that keeps that claim honest going
// forward: no occurrence of "semantic" may survive under `t.search`, no
// empty strings, and everything stays plain ASCII English (per MEMORY:
// English-only marketplace/UI copy).
function flatten(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") return flatten(value, path);
    return [[path, value]];
  });
}

describe("strings.js — t.search copy (AC-17)", () => {
  it("never claims 'semantic' ranking anywhere under t.search", () => {
    for (const [path, value] of flatten(t.search)) {
      expect(value, `${path} must not mention "semantic"`).not.toMatch(/semantic/i);
    }
  });

  it("has no empty strings under t.search", () => {
    for (const [path, value] of flatten(t.search)) {
      expect(typeof value).toBe("string");
      expect(value.trim(), `${path} must not be empty`).not.toBe("");
    }
  });

  it("is plain ASCII-English under t.search", () => {
    // Allow the ASCII printable range plus the ellipsis/middle-dot/en-dash
    // characters already used elsewhere in the app's copy — everything else
    // (non-Latin scripts, smart quotes beyond these) would signal drift from
    // the English-only convention.
    // eslint-disable-next-line no-control-regex
    const asciiEnglish = /^[\x20-\x7E…·–]*$/;
    for (const [path, value] of flatten(t.search)) {
      expect(asciiEnglish.test(value), `${path} must be ASCII-English: "${value}"`).toBe(true);
    }
  });

  it("keeps the mode toggle's URL-facing internal value distinct from its display label", () => {
    // AC-18 guard: the label users see must not be confused with the "smart"
    // URL param value it maps to.
    expect(t.search.smart).toBe("Fuzzy");
    expect(t.search.smart).not.toBe("smart");
  });
});
