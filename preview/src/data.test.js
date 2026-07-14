import { describe, it, expect } from "vitest";
import { DATA, ALL_TAGS, TYPE_COUNTS, PLUGIN_COUNTS } from "./data.js";

// AC-13 baseline. These are HAND-WRITTEN expected values (not toMatchSnapshot())
// so a future diff perturbing the tag/facet data shows up as a reviewable PR diff,
// not an opaque snapshot update. Regenerate by running `npm run index` and reading
// the real values out of the generated src/catalog.json, then updating this file by
// hand — do not blindly accept a failing run.
describe("data.js facet baseline (AC-13)", () => {
  it("loads exactly 29 artifacts from the generated catalog", () => {
    expect(DATA.length).toBe(29);
  });

  it("derives the exact ALL_TAGS facet", () => {
    expect(ALL_TAGS).toEqual([
      "architecture",
      "check",
      "citations",
      "creator",
      "design",
      "drizzle",
      "engineering",
      "expert",
      "fastify",
      "frontend",
      "implementation",
      "implementer",
      "insights",
      "investigation",
      "library",
      "next",
      "nextjs",
      "onion",
      "orm",
      "plan",
      "planner",
      "planning",
      "postgresql",
      "pr",
      "react",
      "read-only",
      "requirements",
      "research",
      "researcher",
      "retro",
      "review",
      "reviewer",
      "run",
      "sdd",
      "security",
      "self",
      "spec",
      "spec-driven-development",
      "structure",
      "table",
      "testing",
      "typescript",
      "ui",
      "verification",
      "verifier",
      "version",
      "write",
      "zod",
    ]);
  });

  it("derives the exact TYPE_COUNTS facet", () => {
    expect(TYPE_COUNTS).toEqual({
      plugin: 4,
      skill: 18,
      agent: 6,
      command: 1,
    });
  });

  it("derives the exact PLUGIN_COUNTS facet", () => {
    expect(PLUGIN_COUNTS).toEqual({
      "engineering-paved-path": 14,
      "research-tools": 2,
      "architecture-review": 3,
      "sdd-engineering": 10,
    });
  });
});
