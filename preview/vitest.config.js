import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Standalone vitest config — does NOT inherit vite.config.js's plugins, so
// `react()` must be declared here explicitly or JSX will not transform.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["./src/test-setup.js"],
    include: ["src/**/*.test.{js,jsx}", "scripts/**/*.test.mjs"],
    // FINDING 5 (AC-30 flake risk) fix: on this 16-core dev machine, running
    // all 11 files in parallel lets `vitest` spin up as many fork workers as
    // there are CPUs, and perf.test.js's tight createEngine() timing loop
    // then measures against a CPU that's also busy running App.test.jsx's
    // renders, the build-index integration suite, etc — the AC-30 median
    // rose from ~20ms in isolation to 34-42ms under that contention, and CI
    // runners (fewer cores, shared) are worse. We verified in this repo that
    // Vitest workspace "projects" do NOT solve this: a project-scoped
    // `fileParallelism: false` only serializes files WITHIN that project —
    // other projects' workers keep running concurrently system-wide, so
    // AC-30 still failed. Full `fileParallelism: false` (one worker, whole
    // suite fully serial) reliably fixes it but adds ~6s (~45%) to every
    // `npm test` run, which is the "serializes the whole suite unnecessarily"
    // outcome we were told to avoid. Capping concurrency instead of removing
    // it — `maxForks: 2` — is the scoped middle ground: it bounds how many
    // files can compete for CPU at once (median AC-30 ~21-26ms across
    // repeated local runs, well under the 50ms budget) while keeping the
    // suite close to its fully-parallel runtime. Paired with AC30_ITERATIONS
    // in perf.test.js for extra sample robustness.
    poolOptions: { forks: { minForks: 1, maxForks: 2 } },
  },
});
