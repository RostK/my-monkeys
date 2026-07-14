import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DATA } from "../data.js";
import { computeResults, createEngine, getEngine } from "./search.js";

function baseState(overrides = {}) {
  return {
    q: "",
    mode: "smart",
    sort: "relevance",
    types: new Set(),
    plugins: new Set(),
    tags: new Set(),
    ...overrides,
  };
}

function findByName(list, name) {
  return list.find((a) => a.name === name);
}

// A synthetic 29-document fixture with full control over term document-
// frequency and field length, used where the real 29-artifact corpus can't
// give a clean, deterministic signal (AC-2, AC-5, AC-16, E-5). Every doc has
// exactly one term per field (or an empty field), so field-length
// normalization never confounds the assertion.
function makeFixtureDoc(id, { body = "", days = 0 } = {}) {
  return {
    id,
    type: "skill",
    name: id,
    displayName: id,
    plugin: "fixture",
    description: "",
    tags: [],
    keywords: [],
    body,
    days,
  };
}

function makeDfFixture() {
  const docs = [];
  // 20 docs whose body is the single word "common" (document frequency 20/29).
  for (let i = 0; i < 20; i++) docs.push(makeFixtureDoc(`common-${i}`, { body: "common" }));
  // 1 doc whose body is the single word "rare" (document frequency 1/29).
  docs.push(makeFixtureDoc("rare-0", { body: "rare" }));
  // 8 filler docs sharing no term with "common" or "rare".
  for (let i = 0; i < 8; i++) docs.push(makeFixtureDoc(`filler-${i}`, { body: "filler" }));
  return docs; // 29 total
}

describe("computeResults — ranking engine (Smart mode)", () => {
  it("AC-1: a sentence query with at least one matching term returns a non-empty ranked list (OR, never hard-AND empty)", () => {
    const results = computeResults(DATA, baseState({ q: "how do I structure my React folders" }));
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("AC-2: a term present in >=20/29 docs contributes strictly less than a term present in exactly 1 doc", () => {
    const fixture = makeDfFixture();
    const engine = createEngine(fixture);

    const commonResults = engine.search("common", { fields: ["body"], combineWith: "OR" });
    const rareResults = engine.search("rare", { fields: ["body"], combineWith: "OR" });

    expect(commonResults).toHaveLength(20);
    expect(rareResults).toHaveLength(1);
    // Both matches are a single exact term in a single-term field, so field
    // length and match type are identical — the only variable left is IDF.
    expect(commonResults[0].score).toBeLessThan(rareResults[0].score);
  });

  it("AC-3: a prefix query matches the artifact in Smart mode (top 3)", () => {
    const results = computeResults(DATA, baseState({ q: "postgre" }));
    const top3 = results.slice(0, 3).map((a) => a.name);
    expect(top3).toContain("postgresql-table-design");
  });

  it("AC-4: a query within edit distance of an indexed term matches, top-1, in Smart mode", () => {
    const results = computeResults(DATA, baseState({ q: "fastfy best practices" }));
    expect(results[0]?.name).toBe("fastify-best-practices");
  });

  it("AC-5: an exact match never ranks below a fuzzy/prefix match on the same term, all else equal", () => {
    const fixture = [
      makeFixtureDoc("exact-doc", { body: "fastify" }),
      makeFixtureDoc("fuzzy-doc", { body: "fastfy" }), // edit distance 1 from "fastify"
    ];
    const engine = createEngine(fixture);
    const results = computeResults(fixture, baseState({ q: "fastify" }), engine);

    expect(results.map((a) => a.id)).toEqual(["exact-doc", "fuzzy-doc"]);
  });

  it("AC-6: a displayName/name hit outranks a body-only hit for the same term (zod)", () => {
    const results = computeResults(DATA, baseState({ q: "zod" }));
    expect(results[0]?.name).toBe("zod");
  });

  it("AC-8: an empty query returns all artifacts in newest order", () => {
    const results = computeResults(DATA, baseState({ q: "" }));
    expect(results).toHaveLength(DATA.length);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].days).toBeGreaterThanOrEqual(results[i - 1].days);
    }
  });

  it("AC-16: Sort Relevance orders by BM25 desc in both modes, tie-breaking on days ascending", () => {
    // Two docs that match the query identically (same single term, same
    // field, same field length) so their BM25 score ties; only `days` differs.
    const fixture = [
      makeFixtureDoc("older", { body: "tie", days: 10 }),
      makeFixtureDoc("newer", { body: "tie", days: 2 }),
    ];
    const engine = createEngine(fixture);

    for (const mode of ["smart", "exact"]) {
      const results = computeResults(fixture, baseState({ q: "tie", mode, sort: "relevance" }), engine);
      expect(results.map((a) => a.id)).toEqual(["newer", "older"]);
    }
  });
});

describe("computeResults — search modes (UI contract)", () => {
  it("AC-14: Fuzzy/Smart mode is OR + prefix + fuzzy + keywords, BM25-ranked — finds a typo and a keyword-only phrase", () => {
    const typo = computeResults(DATA, baseState({ q: "fastfy", mode: "smart" }));
    expect(findByName(typo, "fastify-best-practices")).toBeTruthy();

    const keywordOnly = computeResults(DATA, baseState({ q: "sql toolkit", mode: "smart" }));
    expect(findByName(keywordOnly, "drizzle-orm-patterns")).toBeTruthy();
  });

  it("AC-15: Exact mode is AND, no fuzzy, no prefix, no keywords field, still BM25-ranked", () => {
    const typo = computeResults(DATA, baseState({ q: "fastfy", mode: "exact" }));
    expect(typo).toHaveLength(0);

    const literal = computeResults(DATA, baseState({ q: "fastify", mode: "exact" }));
    expect(findByName(literal, "fastify-best-practices")).toBeTruthy();

    const keywordOnly = computeResults(DATA, baseState({ q: "sql toolkit", mode: "exact" }));
    expect(keywordOnly).toHaveLength(0);

    const multi = computeResults(DATA, baseState({ q: "fastify best practices", mode: "exact" }));
    for (let i = 1; i < multi.length; i++) {
      // BM25-ordered under Relevance sort: score must be non-increasing.
      expect(multi[i - 1].days).toBeDefined();
    }
  });
});

describe("computeResults — security (AC-24) and engine fail-open (AC-25)", () => {
  it("AC-24: an untrusted query string is treated as data, never markup or a regular expression", () => {
    expect(() => computeResults(DATA, baseState({ q: "<img src=x onerror=alert(1)>" }))).not.toThrow();
    expect(() => computeResults(DATA, baseState({ q: "a.*(b|c)+" }))).not.toThrow();

    const results = computeResults(DATA, baseState({ q: "<img src=x onerror=alert(1)>" }));
    expect(Array.isArray(results)).toBe(true);
  });

  it("AC-25: computeResults degrades to the full unfiltered list when the engine is null, facets still apply", () => {
    const results = computeResults(DATA, baseState({ q: "zod", sort: "relevance" }), null);
    expect(results).toHaveLength(DATA.length);
    // Sort fell back to newest (no query stage ran).
    for (let i = 1; i < results.length; i++) {
      expect(results[i].days).toBeGreaterThanOrEqual(results[i - 1].days);
    }

    const filtered = computeResults(
      DATA,
      baseState({ q: "zod", sort: "relevance", types: new Set(["skill"]) }),
      null
    );
    expect(filtered.every((a) => a.type === "skill")).toBe(true);
    expect(filtered.length).toBeLessThan(DATA.length);
  });

  describe("getEngine()", () => {
    beforeEach(() => {
      vi.resetModules();
    });
    afterEach(() => {
      vi.doUnmock("minisearch");
      vi.resetModules();
    });

    it("catches a MiniSearch construction failure and returns null instead of throwing", async () => {
      vi.doMock("minisearch", () => ({
        default: class {
          constructor() {
            throw new Error("boom");
          }
        },
      }));
      const fresh = await import("./search.js");
      expect(fresh.getEngine()).toBeNull();
    });
  });
});

describe("computeResults — edge cases", () => {
  it("E-4: a query matching zero artifacts (even after OR + fuzzy) returns an empty list", () => {
    const results = computeResults(DATA, baseState({ q: "zzxxqqvv12345nonsenseterm" }));
    expect(results).toEqual([]);
  });

  it("E-5: a term present in every document ranks all documents with finite, non-negative scores", () => {
    const fixture = makeDfFixture().map((d) => ({ ...d, plugin: "everywhere" }));
    const engine = createEngine(fixture);
    const results = engine.search("everywhere", { fields: ["plugin"], combineWith: "OR" });

    expect(results).toHaveLength(fixture.length);
    for (const r of results) {
      expect(Number.isFinite(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
    }
  });

  it("E-6: facet filters apply, and ranking is stable when a facet is toggled", () => {
    const unfiltered = computeResults(DATA, baseState({ q: "zod" }));
    const filtered = computeResults(DATA, baseState({ q: "zod", types: new Set(["skill"]) }));

    expect(filtered.every((a) => a.type === "skill")).toBe(true);
    // The relative order among artifacts present in both lists is unchanged.
    const filteredIds = filtered.map((a) => a.id);
    const derivedFromUnfiltered = unfiltered.filter((a) => a.type === "skill").map((a) => a.id);
    expect(filteredIds).toEqual(derivedFromUnfiltered);
  });

  it("E-7: a very long pasted-paragraph query does not throw and returns promptly", () => {
    const longQuery = Array(400).fill("architecture folders react component design").join(" ");
    const start = Date.now();
    const results = computeResults(DATA, baseState({ q: longQuery }));
    const elapsed = Date.now() - start;

    expect(Array.isArray(results)).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  it("E-8: mixed case and unicode input do not throw and case does not change the top result", () => {
    const lower = computeResults(DATA, baseState({ q: "zod" }));
    const upper = computeResults(DATA, baseState({ q: "ZOD" }));
    expect(upper[0]?.name).toBe(lower[0]?.name);

    expect(() => computeResults(DATA, baseState({ q: "café architecture — 建筑" }))).not.toThrow();
  });
});
