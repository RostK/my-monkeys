/* Pure search / filter / sort logic — no framework, easy to unit-test. */

function score(a, tokens, mode) {
  if (!tokens.length) return 0;
  let s = 0;
  for (const t of tokens) {
    if (a.displayName.toLowerCase().indexOf(t) >= 0) s += 6;
    if (a.tags.join(" ").indexOf(t) >= 0) s += 4;
    if (a.description.toLowerCase().indexOf(t) >= 0) s += 3;
    if (mode === "smart" && a.body.toLowerCase().indexOf(t) >= 0) s += 1;
    if (a.plugin.indexOf(t) >= 0) s += 2;
  }
  return s;
}

function matchesQuery(a, tokens, mode) {
  if (!tokens.length) return true;
  for (const t of tokens) {
    let hit;
    if (mode === "exact") {
      hit =
        a.displayName.toLowerCase().indexOf(t) >= 0 ||
        a.name.toLowerCase().indexOf(t) >= 0 ||
        a.tags.join(" ").indexOf(t) >= 0;
    } else {
      hit = a.haystack.indexOf(t) >= 0 || a.body.toLowerCase().indexOf(t) >= 0;
    }
    if (!hit) return false; // all tokens must match (AND)
  }
  return true;
}

/**
 * @param {Array} data       full artifact list
 * @param {object} state     { q, mode, sort, types:Set, plugins:Set, tags:Set }
 * @returns {Array} filtered + sorted artifacts
 */
export function computeResults(data, state) {
  const tokens = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const { types, plugins, tags, mode } = state;

  const list = data
    .filter((a) => {
      if (types.size && !types.has(a.type)) return false;
      if (plugins.size && !plugins.has(a.plugin)) return false;
      if (tags.size && !a.tags.some((t) => tags.has(t))) return false;
      return matchesQuery(a, tokens, mode);
    })
    .map((a) => ({ a, _score: score(a, tokens, mode) }));

  let sort = state.sort;
  if (sort === "relevance" && !tokens.length) sort = "newest";

  list.sort((x, y) => {
    if (sort === "az") return x.a.displayName.localeCompare(y.a.displayName);
    if (sort === "newest") return x.a.days - y.a.days;
    if (y._score !== x._score) return y._score - x._score;
    return x.a.days - y.a.days;
  });

  return list.map((x) => x.a);
}
