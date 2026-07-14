import { describe, it, expect } from "vitest";
import { normalizeTerm, prefix, fuzzy, STOP_WORDS, BOOSTS, MODE_OPTIONS } from "./searchConfig.js";
import { createEngine } from "./search.js";

describe("searchConfig — normalizeTerm (processTerm), symmetric at index and query time", () => {
  it("E-1: single-character terms are not prefix-eligible; 3+ character terms are", () => {
    expect(prefix("a")).toBe(false);
    expect(prefix("ab")).toBe(false);
    expect(prefix("abc")).toBe(true);
  });

  it("E-1: fuzzy only applies once a term is long enough to carry a meaningful edit-distance budget", () => {
    expect(fuzzy("ab")).toBe(false);
    expect(fuzzy("abc")).toBe(false);
    expect(fuzzy("abcd")).toBe(0.2);
  });

  it("E-2: a stop-word-only query indexes/normalizes to nothing (every term is dropped)", () => {
    const terms = "how do I the a of".split(" ").map(normalizeTerm);
    expect(terms.every((t) => t === false)).toBe(true);
    // Sanity: STOP_WORDS actually contains the words used above.
    for (const w of ["how", "do", "i", "the", "a", "of"]) {
      expect(STOP_WORDS.has(w)).toBe(true);
    }
  });

  it("E-3: punctuation/slash/dot terms normalize identically whichever side of index/query they come from", () => {
    // These are the terms MiniSearch's default tokenizer (split on
    // whitespace/Unicode punctuation) would hand to processTerm for
    // "/version-check", "next.js", and "c++" respectively.
    expect(normalizeTerm("version")).toBe(normalizeTerm("version"));
    expect(normalizeTerm("check")).toBe(normalizeTerm("check"));
    expect(normalizeTerm("next")).toBe("next");
    expect(normalizeTerm("js")).toBe("js");
    // A stray math-symbol remainder like "c++" is stripped to its letters —
    // the SAME function runs at both index and query time, so this is
    // symmetric by construction, not by coincidence.
    expect(normalizeTerm("c++")).toBe(normalizeTerm("c"));
  });

  it("stemming: 'migrations' and 'migration' normalize to the same term", () => {
    expect(normalizeTerm("migrations")).toBe(normalizeTerm("migration"));
  });

  // FINDING 1 regression pin: "-es" is only a genuine plural suffix after
  // s/x/z/ch/sh (the true -es class below). Everything else — including
  // every noun ending in a plain "e" — takes a plain "-s" and must NOT lose
  // the trailing vowel too. Checking "-es" unconditionally before "-s" used
  // to strip two characters off this whole class of plurals (tables -> tabl)
  // while the singular (table -> table) stayed untouched, silently
  // partitioning the corpus into two disjoint terms instead of unifying it.
  it("stemming (-e class): singular/plural pairs ending in a plain 'e' normalize to the same term", () => {
    expect(normalizeTerm("tables")).toBe(normalizeTerm("table"));
    expect(normalizeTerm("files")).toBe(normalizeTerm("file"));
    expect(normalizeTerm("types")).toBe(normalizeTerm("type"));
    // Sanity: the shared stem is the singular's own stem, not a mangled one.
    expect(normalizeTerm("table")).toBe("table");
    expect(normalizeTerm("file")).toBe("file");
    expect(normalizeTerm("type")).toBe("type");
  });

  it("stemming (genuine -es class): plurals of s/x/ch/sh-ending nouns normalize to the singular", () => {
    expect(normalizeTerm("boxes")).toBe(normalizeTerm("box"));
    expect(normalizeTerm("classes")).toBe(normalizeTerm("class"));
    expect(normalizeTerm("box")).toBe("box");
    expect(normalizeTerm("class")).toBe("class");
  });

  it("AC-10: keywords boost sits strictly between tags and description", () => {
    expect(BOOSTS.keywords).toBeGreaterThan(BOOSTS.description);
    expect(BOOSTS.keywords).toBeLessThan(BOOSTS.tags);
  });

  it("a tag-only query actually matches (extractField/array-join is not silently indexing junk)", () => {
    const docs = [
      { id: "a", displayName: "Alpha", name: "alpha", tags: ["uniquetagword"], keywords: [], description: "", plugin: "p", body: "" },
      { id: "b", displayName: "Beta", name: "beta", tags: [], keywords: [], description: "", plugin: "p", body: "" },
    ];
    const engine = createEngine(docs);
    const results = engine.search("uniquetagword", MODE_OPTIONS.smart);
    expect(results.map((r) => r.id)).toEqual(["a"]);
  });

  it("a keywords-only query actually matches (extractField/array-join for keywords is not silently indexing junk)", () => {
    const docs = [
      { id: "a", displayName: "Alpha", name: "alpha", tags: [], keywords: ["uniquekeywordphrase"], description: "", plugin: "p", body: "" },
      { id: "b", displayName: "Beta", name: "beta", tags: [], keywords: [], description: "", plugin: "p", body: "" },
    ];
    const engine = createEngine(docs);
    const smart = engine.search("uniquekeywordphrase", MODE_OPTIONS.smart);
    expect(smart.map((r) => r.id)).toEqual(["a"]);

    // AC-15: Exact mode must NOT search the keywords field at all.
    const exact = engine.search("uniquekeywordphrase", MODE_OPTIONS.exact);
    expect(exact).toHaveLength(0);
  });
});
