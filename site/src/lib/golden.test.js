import { describe, it, expect } from "vitest";
import { DATA } from "../data.js";
import { computeResults } from "./search.js";
import { GOLDEN_QUERIES } from "./golden-queries.js";

function baseState(q) {
  return {
    q,
    mode: "smart",
    sort: "relevance",
    types: new Set(),
    plugins: new Set(),
    tags: new Set(),
  };
}

// AC-7 / AC-11 / AC-28 — the committed relevance regression suite. Boost and
// length-norm tuning (searchConfig.js) has no meaning without this target:
// every case here MUST pass. If a case fails, the fix is to tune
// searchConfig.js (or, per the plan's escape hatches, truncate `body` /
// lower `b` further / raise the keywords boost within its AC-10 bracket) —
// never to weaken or delete a golden case.
describe("golden-query regression suite (SPEC-01 §4.4, AC-7)", () => {
  it("AC-28: the set contains at least one sentence-shaped case and at least one keyword-only case", () => {
    expect(GOLDEN_QUERIES.some((c) => c.kind === "sentence")).toBe(true);
    expect(GOLDEN_QUERIES.some((c) => c.kind === "keyword-only")).toBe(true);
  });

  for (const testCase of GOLDEN_QUERIES) {
    it(`[${testCase.kind}] "${testCase.query}" → ${testCase.expect.top1 || testCase.expect.top3} (${testCase.why})`, () => {
      const results = computeResults(DATA, baseState(testCase.query));
      const names = results.map((a) => a.name);

      if (testCase.expect.top1) {
        expect(names[0]).toBe(testCase.expect.top1);
      } else if (testCase.expect.top3) {
        expect(names.slice(0, 3)).toContain(testCase.expect.top3);
      } else {
        throw new Error(`golden case "${testCase.query}" has neither top1 nor top3 in its expect block`);
      }
    });
  }
});

// AC-11 — synonym / problem-phrasing coverage specifically for drizzle-orm-patterns,
// via three different vocabulary-gap phrasings (only one of which — "sql toolkit" —
// is also a golden-set case above).
describe("AC-11 — vocabulary-gap queries for drizzle-orm-patterns", () => {
  it.each(["orm", "sql toolkit", "database migrations"])('"%s" returns drizzle-orm-patterns in the top 3', (q) => {
    const results = computeResults(DATA, baseState(q));
    const top3 = results.slice(0, 3).map((a) => a.name);
    expect(top3).toContain("drizzle-orm-patterns");
  });
});
