/* URL-owned state (engineering-paved-path:frontend-ui-architecture): the
 * search/filter/sort state and the open-card id live in the URL hash, not in
 * a component. Moved verbatim out of App.jsx so the round-trip is directly
 * testable (AC-18) without mounting React.
 *
 * IMPORTANT: `mode`'s two values are the literal strings "smart" and "exact"
 * — these are a public URL contract (shared links like `#q=zod&mode=exact`)
 * and must NEVER be renamed, even if the UI label for "smart" changes (e.g.
 * to "Fuzzy"). Renaming the value would silently break every previously
 * shared link.
 */
export const SORTS = ["relevance", "newest", "az"];

function toSet(csv) {
  return new Set(csv ? csv.split(",").filter(Boolean) : []);
}

export function parseHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ""));
  return {
    q: p.get("q") || "",
    mode: p.get("mode") === "exact" ? "exact" : "smart",
    sort: SORTS.includes(p.get("sort")) ? p.get("sort") : "relevance",
    types: toSet(p.get("type")),
    plugins: toSet(p.get("plugin")),
    tags: toSet(p.get("tag")),
    open: p.get("a") || null,
  };
}

export function writeHash(s, open) {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.mode !== "smart") p.set("mode", s.mode);
  if (s.sort !== "relevance") p.set("sort", s.sort);
  if (s.types.size) p.set("type", [...s.types].join(","));
  if (s.plugins.size) p.set("plugin", [...s.plugins].join(","));
  if (s.tags.size) p.set("tag", [...s.tags].join(","));
  if (open) p.set("a", open);
  const str = p.toString();
  history.replaceState(null, "", str ? "#" + str : location.pathname + location.search);
}
