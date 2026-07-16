/* perf.test.js — performance budgets for the search engine (SPEC-01 §4.4).
 *
 * A wall-clock assertion on a shared CI runner is a flake generator, so every
 * budget here is checked against a median over >=5 iterations, never a
 * single sample. Thresholds are set to the AC value exactly — never
 * tightened — because the honest fix for flakiness is to widen the sample,
 * not the budget. Deleting or weakening a budget is not an option.
 *
 * `golden-queries.js` and `searchConfig.js` are READ-ONLY here — this unit
 * must not edit them (it runs concurrently with other task units).
 */
import { describe, it, expect } from "vitest";
import { DATA } from "../data.js";
import { createEngine, getEngine, computeResults } from "./search.js";
import { GOLDEN_QUERIES } from "./golden-queries.js";

const ITERATIONS = 7;

// FINDING 5: AC-30 is the single most contention-sensitive budget in this
// file (it's timing a construction that itself only takes ~2-3ms, so noise
// from other test files' CPU usage dominates proportionally more than it
// does for the ~100ms-budget AC-22/E-7 checks). A larger sample count is the
// honest way to widen the margin — see this file's header — paired with the
// `poolOptions.forks.maxForks` cap in vitest.config.js that bounds how much
// contention there is in the first place.
const AC30_ITERATIONS = 15;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function baseState(q, overrides = {}) {
  return {
    q,
    mode: "smart",
    sort: "relevance",
    types: new Set(),
    plugins: new Set(),
    tags: new Set(),
    ...overrides,
  };
}

// Every successive prefix of a query string ("h", "ho", "how", ...) — this is
// what the search box actually sends on each keystroke.
function prefixesOf(query) {
  const prefixes = [];
  for (let i = 1; i <= query.length; i++) prefixes.push(query.slice(0, i));
  return prefixes;
}

// search.js keeps a SINGLE-SLOT cache of the last ranked query (keyed on
// `mode + " " + q`, see rankedScores()), so re-running the exact same query
// back-to-back would make every sample after the first a near-free cache hit
// and mask a slow first call behind a deceptively fast median. Busting the
// cache with a unique throwaway query before each timed sample guarantees
// every measurement is a genuine, fresh computation.
function bustRankedScoresCache(engine, salt) {
  computeResults(DATA, baseState(`__perf-cache-buster-${salt}__`), engine);
}

describe("AC-30: index construction over the real 29-doc corpus completes in <50ms", () => {
  it(`median (${AC30_ITERATIONS} iterations) build time over DATA is under the 50ms budget`, () => {
    const samples = [];
    for (let i = 0; i < AC30_ITERATIONS; i++) {
      const start = performance.now();
      createEngine(DATA);
      samples.push(performance.now() - start);
    }

    const m = median(samples);
    // eslint-disable-next-line no-console
    console.log(`[perf] AC-30 index construction median over ${AC30_ITERATIONS} runs: ${m.toFixed(3)}ms`, samples);
    expect(m).toBeLessThan(50);
  });
});

describe("AC-22: as-you-type result computation stays under the 100ms budget for every golden query", () => {
  // Warm the memoized singleton before timing a query — this is exactly what
  // production does: the app warms getEngine() in a useEffect after first
  // paint, so a query is never timed against a cold/never-built engine.
  const warmEngine = getEngine();
  if (!warmEngine) {
    throw new Error("getEngine() returned null — cannot warm-time queries against a null engine");
  }

  for (const testCase of GOLDEN_QUERIES) {
    it(`[${testCase.kind}] "${testCase.query}" — every as-you-type prefix stays under 100ms (median of ${ITERATIONS})`, () => {
      let worst = { prefix: "", median: -Infinity };
      for (const prefix of prefixesOf(testCase.query)) {
        const samples = [];
        for (let i = 0; i < ITERATIONS; i++) {
          bustRankedScoresCache(warmEngine, `${prefix}-${i}`);
          const start = performance.now();
          computeResults(DATA, baseState(prefix), warmEngine);
          samples.push(performance.now() - start);
        }
        const m = median(samples);
        if (m > worst.median) worst = { prefix, median: m };
        expect(m, `prefix "${prefix}" of golden query "${testCase.query}" median ${m.toFixed(3)}ms`).toBeLessThan(
          100
        );
      }
      // eslint-disable-next-line no-console
      console.log(
        `[perf] AC-22 "${testCase.query}" worst as-you-type prefix: "${worst.prefix}" median ${worst.median.toFixed(3)}ms`
      );
    });
  }
});

describe("E-7: a pasted-paragraph query stays inside the as-you-type budget", () => {
  it("median (7 iterations) computeResults time for a long pasted paragraph is under 100ms", () => {
    const warmEngine = getEngine();
    if (!warmEngine) {
      throw new Error("getEngine() returned null — cannot warm-time queries against a null engine");
    }
    // A genuine paragraph (~250 words / a few sentences pasted from an error
    // message or doc) — NOT search.test.js's E-7 400x/2000-word stress input,
    // which exists to prove no-throw/no-hang under a deliberately extreme
    // input against a generous 2000ms ceiling. This is the same 100ms
    // UX-latency budget as AC-22 above, applied to a realistic paste size.
    const longQuery = Array(50).fill("architecture folders react component design").join(" ");

    const samples = [];
    for (let i = 0; i < ITERATIONS; i++) {
      bustRankedScoresCache(warmEngine, `paste-${i}`);
      const start = performance.now();
      computeResults(DATA, baseState(longQuery), warmEngine);
      samples.push(performance.now() - start);
    }

    const m = median(samples);
    // eslint-disable-next-line no-console
    console.log(`[perf] E-7 pasted-paragraph query median over ${ITERATIONS} runs: ${m.toFixed(3)}ms`, samples);
    expect(m).toBeLessThan(100);
  });
});
