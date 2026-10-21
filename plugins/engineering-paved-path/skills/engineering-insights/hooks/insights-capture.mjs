#!/usr/bin/env node
// Stop hook for the engineering-insights skill.
//
// The `Stop` event fires after EVERY turn, and there is no "session ended" event
// that can still make Claude act — so this nudges at most ONCE per session via two
// irreducible guards:
//   1. stop_hook_active — don't re-fire within the same stop sequence (anti-loop);
//   2. a per-session marker file — fire only the first time, not once per turn.
// On that single firing it blocks the stop and asks Claude to run /engineering-insights
// (a hook can't invoke a skill directly — it injects the instruction; Claude acts on it).
//
// It also stays quiet while there is nothing to capture: in a git repo whose tracked
// files match HEAD (`git diff HEAD` is empty) and whose HEAD has not moved since the
// session's first quiet stop, no code changed, so the stop goes through un-nudged and
// the nudge stays available for a later stop that does follow a change. Outside a git
// repo (or if git fails) it nudges as before.
//
// Registered as a Stop hook (via the plugin's hooks/hooks.json). Never breaks the
// session: every path exits 0.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The per-module learnings file the skill appends to. Configurable so the nudge names
// whatever file your project actually uses (default: LEARNINGS.md).
const INSIGHTS_FILE = process.env.INSIGHTS_FILE || "LEARNINGS.md";

/** HEAD and whether tracked files differ from it; null outside a git repo or on any git error. */
function gitState(cwd) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  try {
    return { head: git("rev-parse", "HEAD"), changed: git("diff", "HEAD", "--name-only") !== "" };
  } catch {
    return null;
  }
}

/** The marker's record: { nudged: true } or { head } (HEAD at the first quiet stop); null if none. */
function readMarker(marker) {
  try {
    const parsed = JSON.parse(readFileSync(marker, "utf8"));
    // A marker from before this format (the bare "1") means the session was nudged.
    return parsed && typeof parsed === "object" ? parsed : { nudged: true };
  } catch {
    return null;
  }
}

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  if (input.stop_hook_active === true) process.exit(0); // anti-loop

  const safe = String(input.session_id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  const marker = join(tmpdir(), `engineering-insights-${safe}.nudged`);
  const seen = readMarker(marker);
  if (seen?.nudged) process.exit(0); // already nudged this session

  const git = gitState(input.cwd || process.cwd());
  if (git && !git.changed) {
    if (!seen) {
      writeFileSync(marker, JSON.stringify({ head: git.head }));
      process.exit(0); // first quiet stop: remember where the session started
    }
    if (seen.head === git.head) process.exit(0); // nothing changed or committed since
  }
  writeFileSync(marker, JSON.stringify({ nudged: true }));

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: "Capture engineering insights before stopping.",
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext:
          `Before stopping, run the /engineering-insights skill: re-read each touched ` +
          `module's ${INSIGHTS_FILE} and append any durable, non-obvious learnings (or confirm ` +
          `nothing met the bar). If no code module was touched this session, just confirm ` +
          `there's nothing to capture, then stop.`,
      },
    }),
  );
} catch {
  // never block a stop on a hook error
}
process.exit(0);
