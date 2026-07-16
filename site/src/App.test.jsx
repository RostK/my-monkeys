// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";
import { DATA } from "./data.js";
import { parseHash, writeHash, SORTS } from "./lib/urlState.js";

// jsdom doesn't implement full navigation; keep the hash test self-contained
// by resetting it between tests so App's `useMemo(parseHash, [])` init read
// never leaks across tests.
beforeEach(() => {
  location.hash = "";
});
afterEach(() => {
  location.hash = "";
  vi.restoreAllMocks();
});

describe("lib/urlState — parseHash/writeHash round-trip (AC-18)", () => {
  it("round-trips full state through the hash, and an old shared link's mode VALUE ('exact') still opens literal mode", () => {
    // A previously-shared link using the pre-rename URL contract.
    location.hash = "#q=zod&mode=exact";
    const parsed = parseHash();
    expect(parsed.q).toBe("zod");
    expect(parsed.mode).toBe("exact"); // the URL param VALUE, never renamed to "fuzzy"

    // Round-trip: writeHash(state) then parseHash() recovers the same state.
    const state = {
      q: "drizzle orm",
      mode: "exact",
      sort: "newest",
      types: new Set(["skill"]),
      plugins: new Set(["engineering-paved-path"]),
      tags: new Set(["zod", "orm"]),
    };
    writeHash(state, "some-artifact-id");
    const roundTripped = parseHash();
    expect(roundTripped.q).toBe(state.q);
    expect(roundTripped.mode).toBe(state.mode);
    expect(roundTripped.sort).toBe(state.sort);
    expect([...roundTripped.types]).toEqual([...state.types]);
    expect([...roundTripped.plugins]).toEqual([...state.plugins]);
    expect([...roundTripped.tags].sort()).toEqual([...state.tags].sort());
    expect(roundTripped.open).toBe("some-artifact-id");
  });

  it("defaults mode to 'smart' (the unchanged URL param VALUE) and omits default values from a written hash", () => {
    location.hash = "#q=react";
    expect(parseHash().mode).toBe("smart");

    writeHash(
      { q: "", mode: "smart", sort: "relevance", types: new Set(), plugins: new Set(), tags: new Set() },
      null
    );
    // Every field is a default -> nothing gets written, hash resets to empty.
    expect(location.hash).toBe("");
    expect(SORTS).toEqual(["relevance", "newest", "az"]);
  });
});

describe("App", () => {
  it("AC-13/E-4: typing a query shows matching cards with no keyword string leaked into the DOM, tag chips/badges intact; empty query with no matches shows the empty state", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByRole("searchbox", { name: /search the marketplace/i });

    // A phrase that only exists in a keyword sidecar entry, not in any
    // artifact's displayName/description/tags — it must never render in
    // the DOM even though it powers the match.
    await user.type(input, "onboarding skill set");

    // Tag chip / type badge markup is unchanged: a "#tag" hint renders on
    // at least one card, and the type badge (skill/command/agent/plugin)
    // still renders.
    const cards = document.querySelectorAll(".card");
    expect(cards.length).toBeGreaterThan(0);
    expect(document.querySelector(".tag-hint")).toBeTruthy();
    expect(document.querySelector(".badge")).toBeTruthy();

    // The raw keyword phrase itself must never appear as visible text.
    expect(screen.queryByText(/onboarding skill set/i)).not.toBeInTheDocument();

    // A query with no matches at all renders the honest empty state (E-4).
    await user.clear(input);
    await user.type(input, "zzzzzznonexistentqueryxyzzzz");
    expect(await screen.findByText(/no matches/i)).toBeInTheDocument();
    expect(document.querySelectorAll(".card").length).toBe(0);
  });

  it("AC-24: XSS-shaped and regex-shaped queries never throw and never inject markup", async () => {
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByRole("searchbox", { name: /search the marketplace/i });

    await user.type(input, "<img src=x onerror=alert(1)>");
    // React's JSX escaping is the safety net — no <img> node was injected
    // into the document by the query itself.
    expect(document.querySelectorAll("img[onerror]").length).toBe(0);

    await user.clear(input);
    await user.type(input, "a.*(b|c)+");
    // No throw occurred (render would have unmounted/crashed if it had);
    // the app is still interactive.
    expect(screen.getByRole("searchbox", { name: /search the marketplace/i })).toBeInTheDocument();
  });

  it("AC-25: a forced getEngine() throw still renders all 29 cards and facets keep working", async () => {
    const search = await import("./lib/search.js");
    vi.spyOn(search, "getEngine").mockImplementation(() => {
      throw new Error("engine init exploded");
    });

    const user = userEvent.setup();
    render(<App />);

    // Empty-query initial render: all 29 artifacts, unfiltered.
    expect(document.querySelectorAll(".card").length).toBe(DATA.length);

    // Facets still work: toggling a type checkbox filters the grid.
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    expect(document.querySelectorAll(".card").length).toBeLessThan(DATA.length);
    expect(document.querySelectorAll(".card").length).toBeGreaterThan(0);
  });

  it("AC-26: the search input keeps its accessible name, and the mode toggle is keyboard-reachable", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByRole("searchbox", { name: /search the marketplace/i });
    expect(input).toBeInTheDocument();

    const fuzzyBtn = screen.getByRole("button", { name: /fuzzy/i });
    const exactBtn = screen.getByRole("button", { name: /exact/i });
    expect(fuzzyBtn).toBeInTheDocument();
    expect(exactBtn).toBeInTheDocument();

    // Real <button>s are natively keyboard-reachable and activate on Enter.
    exactBtn.focus();
    expect(exactBtn).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(location.hash).toMatch(/mode=exact/);
  });

  it("#q=zod&mode=exact opens literal mode on load, driven straight through the URL contract", () => {
    location.hash = "#q=zod&mode=exact";
    render(<App />);

    const exactBtn = screen.getByRole("button", { name: /exact/i });
    expect(exactBtn.className).toMatch(/on/);
    const input = screen.getByRole("searchbox", { name: /search the marketplace/i });
    expect(input).toHaveValue("zod");
  });
});
