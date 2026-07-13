import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project Page on GitHub Pages is served from https://<owner>.github.io/my-monkeys/,
// so production assets need the "/my-monkeys/" base. Dev stays at "/".
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/my-monkeys/" : "/",
  plugins: [react()],
}));
