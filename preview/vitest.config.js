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
  },
});
