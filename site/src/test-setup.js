import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL auto-cleanup after each test (only relevant for DOM/jsdom test files,
// but harmless to register globally for node-env tests too).
afterEach(() => {
  cleanup();
});
