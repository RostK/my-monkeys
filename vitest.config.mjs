import { defineConfig } from "vitest/config";

// Root vitest scope: the pure rule functions under scripts/ only (R-4).
// site/ has its own independent vitest suite (site/package.json, run via
// `cd site && npm test`) with its own devDependencies (jsdom, etc.) that are
// not installed at the repo root — it must never be picked up here.
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.mjs"],
    exclude: ["node_modules/**", "site/**", "plugins/**"],
  },
});
