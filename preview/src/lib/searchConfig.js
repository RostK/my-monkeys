/* searchConfig.js — the single tuning surface for the MiniSearch-based search
 * engine (see search.js for the engine adapter). Framework-free: no React,
 * no DOM, safe to unit-test in isolation (engineering-paved-path:frontend-ui-architecture).
 *
 * Every option here is verified against the MiniSearch v7.2.0 constructor /
 * search-option types in node_modules/minisearch/dist/es/index.d.ts — see
 * search.test.js / searchConfig.test.js / golden.test.js for the proof.
 */

// Fields indexed by MiniSearch. AC-9/AC-10: `keywords` is indexed alongside
// the visible fields, but only ever *searched* in Smart mode — see
// EXACT_FIELDS below and AC-15 (Exact mode excludes it via a
// searchOptions.fields override, not by removing it from the index).
export const FIELDS = ["displayName", "name", "tags", "keywords", "description", "plugin", "body"];

// AC-15: Exact mode searches every indexed field EXCEPT `keywords`. This is a
// deliberate behaviour change from today's Exact (displayName/name/tags only,
// search.js:22-24) — description/plugin/body become searchable in Exact too.
export const EXACT_FIELDS = FIELDS.filter((f) => f !== "keywords");

// AC-6 + AC-10 ordering: displayName/name > tags > keywords > description ≈
// plugin > body. `keywords` sits STRICTLY BETWEEN `tags` and `description`,
// close to `tags` — see golden.test.js's "check my code before pushing" case:
// an artifact whose own name/tags happen to contain one strong query word
// (`/version-check` matching "check") would otherwise outrank an artifact
// that matches the query's full intent only through several `keywords`
// phrases.
export const BOOSTS = {
  displayName: 8,
  name: 8,
  tags: 5,
  keywords: 4.9,
  description: 2,
  plugin: 2,
  body: 1,
};

// BM25+ params. Started from MiniSearch's own default (`k:1.2, b:0.7, d:0.5`)
// and LOWERED `b` — `b` is the field-length-normalization strength and the
// direct lever on the known MiniSearch pathology (lucaong/minisearch#129,
// documented in preview/LEARNINGS.md:29): a short displayName/description can
// otherwise dominate IDF and outrank a longer, more relevant `body`. Tuned
// against the golden-query regression suite (golden.test.js) — see that
// file's header for the tuning trail.
export const BM25 = { k: 1.2, b: 0.35, d: 0.5 };

// E-1: prefix matching is only meaningful once a term carries some signal —
// a 1-2 character prefix ("a", "to") would match almost every document.
export function prefix(term) {
  return term.length >= 3;
}

// Fuzzy only kicks in once a term is long enough that a 20% edit-distance
// budget (MiniSearch's fractional fuzzy) rounds to at least one character.
export function fuzzy(term) {
  return term.length >= 4 ? 0.2 : false;
}

// AC-5: relative weights (an exact match is weight 1) must keep an exact hit
// ranked at or above a fuzzy/prefix hit on the same term, all else equal —
// both weights below stay < 1.
export const weights = { prefix: 0.5, fuzzy: 0.4 };

// MiniSearch ships NO stop-word list (E-2) — bring your own. Small,
// English-only (project convention), tuned to the query shapes the golden
// set and edge cases exercise ("how do I", "the a of", …).
export const STOP_WORDS = new Set([
  "a", "an", "the", "of", "to", "in", "on", "for", "and", "or", "is", "are",
  "was", "were", "how", "do", "does", "did", "done", "i", "my", "me", "you",
  "your", "it", "its", "this", "that", "these", "those", "with", "from",
  "by", "at", "as", "be", "been", "being", "can", "could", "should",
  "would", "will", "shall", "what", "which", "who", "whom", "if", "then",
  "so", "not", "no", "yes", "up", "down", "out", "about", "into", "over",
  "before", "after", "just", "than", "too", "very", "have", "has", "had", "am",
]);

// Hand-rolled, ~15 lines — a stemmer package would blow the AC-21 bundle
// budget (≤12,288 B gzipped). Covers exactly the suffix classes the golden
// set and edge cases need: plural -s/-es, -ing, -ed, -ies -> -y. NOT a
// general-purpose Porter stemmer — extend only when a golden case fails.
function stem(word) {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

// Runs at BOTH index time and query time — MiniSearch's top-level
// `processTerm` (not a per-searchOptions override) is used for both by
// default, which is exactly what keeps stemming/stop-words symmetric. That
// symmetry is the feature (E-2, E-3) and the trap: an asymmetric hook here
// is the single likeliest cause of "everything mysteriously returns zero".
// Security (AC-24): this only ever transforms a single already-tokenized
// term with fixed regexes — the user's query string itself is never passed
// to `RegExp` or interpreted as one.
export function normalizeTerm(term) {
  const lower = String(term).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!lower) return false;
  if (STOP_WORDS.has(lower)) return false;
  return stem(lower);
}

// AC-14: Fuzzy (internally `mode: "smart"`) — OR semantics + prefix + fuzzy +
// `keywords` indexed, BM25-ranked.
// AC-15: Exact (internally `mode: "exact"`) — AND semantics, no fuzzy, no
// prefix, no `keywords`, still BM25-ranked.
export const MODE_OPTIONS = {
  smart: {
    fields: FIELDS,
    combineWith: "OR",
    prefix,
    fuzzy,
    weights,
    boost: BOOSTS,
    bm25: BM25,
  },
  exact: {
    fields: EXACT_FIELDS,
    combineWith: "AND",
    prefix: false,
    fuzzy: false,
    boost: BOOSTS,
    bm25: BM25,
  },
};
