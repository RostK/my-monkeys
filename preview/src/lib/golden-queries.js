/* golden-queries.js — the committed relevance regression suite (SPEC-01 §4.4).
 * Plain data, deliberately NOT test code, so a maintainer can extend the set
 * (add a new case as a new failure is found) without touching golden.test.js
 * (AC-28). Framework-free.
 *
 * Each case:
 *  - `query`   the raw Smart-mode query string
 *  - `kind`    'sentence' | 'keyword-only' | 'typo' | 'lexical' | 'problem-phrasing'
 *  - `expect`  { top1: artifactName } or { top3: artifactName } — the
 *              artifact's `name` field (not its full sidecar `id`)
 *  - `why`     human-readable rationale, carried over from the spec table
 *
 * The set MUST always contain at least one `sentence` case and at least one
 * `keyword-only` case (AC-28) — see golden.test.js.
 */
export const GOLDEN_QUERIES = [
  {
    query: "how should I structure my React folders",
    kind: "sentence",
    expect: { top1: "frontend-ui-architecture" },
    why: "Sentence-shaped query — the exact thing today's hard-AND matcher returns zero results for.",
  },
  {
    query: "sql toolkit",
    kind: "keyword-only",
    expect: { top1: "drizzle-orm-patterns" },
    why: "Vocabulary-gap case — passes only via a baked keyword; the phrase occurs nowhere in the artifact's own text.",
  },
  {
    query: "fastfy",
    kind: "typo",
    expect: { top1: "fastify-best-practices" },
    why: "Typo tolerance.",
  },
  {
    query: "write requirements",
    kind: "lexical",
    expect: { top1: "requirements-engineering" },
    why: "Plain lexical match.",
  },
  {
    query: "check my code before pushing",
    kind: "problem-phrasing",
    expect: { top1: "pr-self-review" },
    why: "Problem-phrasing → artifact name mismatch.",
  },
];
