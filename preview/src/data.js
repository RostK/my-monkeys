/* Marketplace catalog for the UI.
 *
 * The data comes from src/catalog.json, which is GENERATED from the real
 * repository by scripts/build-index.mjs (run automatically via the predev /
 * prebuild npm scripts and in CI). Do not edit catalog.json by hand — re-run
 * `npm run index`. This module just imports it and derives a few view helpers.
 */
import catalog from "./catalog.json";

export const MARKETPLACE = catalog.marketplace;
export const OWNER = catalog.owner;
export const REPO = catalog.repo;
export const GENERATED_AT = catalog.generatedAt;

// { <pluginName>: { name, desc, tags } }
export const PLUGINS = Object.fromEntries(
  catalog.plugins.map((p) => [p.name, { name: p.displayName, desc: p.description, tags: p.tags }])
);

const DAY = 86400000;
function daysSince(iso) {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.round((Date.now() - ts) / DAY));
}

export const DATA = catalog.artifacts.map((a) => ({
  ...a,
  days: daysSince(a.updatedAt),
  haystack: (a.displayName + " " + a.name + " " + a.description + " " + a.tags.join(" ") + " " + a.plugin).toLowerCase(),
}));

export const TYPES = ["skill", "command", "agent", "plugin"];

// Install command, in either of two contexts. The `name@marketplace` argument is
// identical; only the prefix differs — `claude plugin install` from a shell vs the
// `/plugin install` slash command typed inside a Claude Code session.
export const INSTALL_MODES = ["cli", "code"];
export function installCommand(installName, mode) {
  const ref = installName + "@" + MARKETPLACE;
  return (mode === "code" ? "/plugin install " : "claude plugin install ") + ref;
}

function countBy(fn) {
  const m = {};
  DATA.forEach((a) => {
    const k = fn(a);
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}
export const TYPE_COUNTS = countBy((a) => a.type);
export const PLUGIN_COUNTS = countBy((a) => a.plugin);
export const ALL_TAGS = (() => {
  const s = {};
  DATA.forEach((a) => a.tags.forEach((t) => (s[t] = 1)));
  return Object.keys(s).sort();
})();

export function fmtAge(d) {
  if (d <= 0) return "today";
  if (d < 7) return d + "d ago";
  if (d < 30) return Math.round(d / 7) + "w ago";
  if (d < 365) return Math.round(d / 30) + "mo ago";
  return Math.round(d / 365) + "y ago";
}
