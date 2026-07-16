import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mapModelResponseToKeywords, generateKeywordsForArtifact } from "./gen-keywords.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// site/scripts/gen-keywords.test.mjs -> site/ -> repo root
const SITE_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(SITE_ROOT, "..");

/**
 * These four assertions are the AC-27 enforcement: "the build-time LLM call
 * is not possible today" (site/LEARNINGS.md) must stay true forever.
 * Negative requirements rot silently — this is what keeps it real.
 */
describe("AC-27 guard: gen-keywords.mjs stays invisible to the build and to CI", () => {
  it("site/package.json contains no script whose value references gen-keywords", () => {
    const pkg = JSON.parse(readFileSync(join(SITE_ROOT, "package.json"), "utf8"));
    const scripts = pkg.scripts || {};
    expect(Object.keys(scripts).length).toBeGreaterThan(0);
    for (const [name, value] of Object.entries(scripts)) {
      expect(String(value), `npm script "${name}" must not reference gen-keywords`).not.toMatch(/gen-keywords/);
    }
  });

  it("no file under .github/workflows/** references gen-keywords, ANTHROPIC, or secrets.", () => {
    const workflowsDir = join(REPO_ROOT, ".github", "workflows");
    expect(existsSync(workflowsDir), "expected .github/workflows to exist").toBe(true);

    const files = readdirSync(workflowsDir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => join(workflowsDir, d.name));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not reference gen-keywords`).not.toMatch(/gen-keywords/);
      expect(content, `${file} must not reference ANTHROPIC`).not.toMatch(/ANTHROPIC/i);
      expect(content, `${file} must not reference secrets.`).not.toMatch(/secrets\./);
    }
  });

  it("build-index.mjs's source has no fetch/http/https import and does not import gen-keywords.mjs", () => {
    const source = readFileSync(join(SITE_ROOT, "scripts", "build-index.mjs"), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/from\s+["']node:https?["']/);
    expect(source).not.toMatch(/require\(\s*["']https?["']\s*\)/);
    expect(source).not.toMatch(/gen-keywords/);
  });

  it("with a STUBBED fetch (no network), a canned model response maps correctly onto the sidecar schema, AND a malformed response is REJECTED rather than written", async () => {
    const artifact = {
      id: "example-plugin/skill/demo",
      displayName: "Demo Skill",
      description: "A demo skill used only by this test.",
      body: "# Demo\n\nSome body content describing the demo skill for tests.",
      tags: ["demo"],
    };

    const cannedKeywords = [
      "example search term",
      "another phrase entirely",
      "third useful phrase",
      "fourth search phrase",
      "fifth phrase to try",
      "sixth and final phrase",
    ];

    const okFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify(cannedKeywords) }],
      }),
    });

    const keywords = await generateKeywordsForArtifact(artifact, {
      apiKey: "test-key-never-sent-anywhere-real",
      fetchImpl: okFetch,
    });

    // Maps correctly onto the sidecar schema: an array of trimmed, deduped
    // strings identical to what keywords.mjs expects at
    // sidecar.artifacts[id].keywords.
    expect(keywords).toEqual(cannedKeywords);
    expect(okFetch).toHaveBeenCalledTimes(1);
    expect(okFetch.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
    const [, requestInit] = okFetch.mock.calls[0];
    expect(requestInit.headers["x-api-key"]).toBe("test-key-never-sent-anywhere-real");
    expect(requestInit.headers["anthropic-version"]).toBe("2023-06-01");
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.model).toBe("claude-opus-4-8");

    // Malformed: no JSON array at all in the response text.
    expect(() => mapModelResponseToKeywords("Sorry, I can't help with that.", artifact.id)).toThrow();

    // Malformed: fewer than the minimum required keywords.
    expect(() => mapModelResponseToKeywords(JSON.stringify(["only", "two"]), artifact.id)).toThrow();

    // Malformed: array of non-strings.
    expect(() =>
      mapModelResponseToKeywords(JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]), artifact.id)
    ).toThrow();

    // Malformed at the fetch layer: the model returns prose, not JSON — the
    // promise must reject, so main() never reaches writeFileSync for it.
    const badFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "This is not a JSON array, sorry." }],
      }),
    });
    await expect(
      generateKeywordsForArtifact(artifact, { apiKey: "test-key-never-sent-anywhere-real", fetchImpl: badFetch })
    ).rejects.toThrow();

    // Malformed: HTTP error from the API is also rejected, not swallowed.
    const errorFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid x-api-key",
    });
    await expect(
      generateKeywordsForArtifact(artifact, { apiKey: "bad-key", fetchImpl: errorFetch })
    ).rejects.toThrow();
  });
});
