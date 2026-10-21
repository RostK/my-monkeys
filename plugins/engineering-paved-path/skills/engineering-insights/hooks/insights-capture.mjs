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
// It also stays quiet while the session has changed nothing, judged against the
// session's OWN START (the first timestamp in its transcript), not against HEAD or the
// state at some earlier stop. In a git repo the session changed code when a file git
// reports as modified or untracked was written after that start, or a commit on a local
// branch (or HEAD) was made since it. So work counts even once committed, or committed
// on a branch the session then left; a pull, a checkout, or work-in-progress that
// predates the session does not. A quiet stop writes no marker, so the nudge stays
// available for a later stop that does follow a change. Outside a git repo, with no
// readable start time, or if git fails, it nudges once as before. It cannot tell which
// session wrote a file or made a commit, so another session working in the same repo at
// the same time can set it off: a spare nudge, never a missed one.
//
// Registered as a Stop hook (via the plugin's hooks/hooks.json). Never breaks the
// session: every path exits 0.

import { closeSync, existsSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The per-module learnings file the skill appends to. Configurable so the nudge names
// whatever file your project actually uses (default: LEARNINGS.md).
const INSIGHTS_FILE = process.env.INSIGHTS_FILE || "LEARNINGS.md";

/** When the session started: the first timestamp near the head of its transcript; null if unknown. */
function sessionStart(transcriptPath) {
  if (!transcriptPath) return null;
  let fd;
  try {
    fd = openSync(transcriptPath, "r");
    const buf = Buffer.alloc(256 * 1024);
    const n = readSync(fd, buf, 0, buf.length, 0);
    for (const line of buf.toString("utf8", 0, n).split("\n")) {
      try {
        const ts = Date.parse(JSON.parse(line).timestamp ?? "");
        if (!Number.isNaN(ts)) return ts;
      } catch {
        // a header record without a timestamp, or the torn last line of the chunk
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** Did the session change code since `start`? true / false, or null when git cannot say. */
function changedSince(cwd, start) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      maxBuffer: 16 * 1024 * 1024,
    });
  try {
    // -z: NUL-separated and unquoted; a rename or copy is followed by its source path.
    // Porcelain paths are relative to the repository root.
    const fields = git("status", "--porcelain", "-z").split("\0");
    let root = null;
    for (let i = 0; i < fields.length; i++) {
      const entry = fields[i];
      if (entry.length < 4) continue;
      if (entry[0] === "R" || entry[0] === "C") i++;
      root ??= git("rev-parse", "--show-toplevel").trim();
      try {
        if (statSync(join(root, entry.slice(3))).mtimeMs >= start) return true;
      } catch {
        // deleted: there is no mtime to date it by
      }
    }
    // Whole seconds, as git dates are; flooring keeps a commit in the start's own second.
    const since = new Date(Math.floor(start / 1000) * 1000).toISOString().replace(".000Z", "Z");
    return git("log", "--branches", "HEAD", `--since=${since}`, "-1", "--format=%H").trim() !== "";
  } catch {
    return null;
  }
}

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  if (input.stop_hook_active === true) process.exit(0); // anti-loop

  const safe = String(input.session_id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  const marker = join(tmpdir(), `engineering-insights-${safe}.nudged`);
  if (existsSync(marker)) process.exit(0); // already nudged this session

  const start = sessionStart(input.transcript_path);
  const changed = start === null ? null : changedSince(input.cwd || process.cwd(), start);
  if (changed === false) process.exit(0); // nothing to capture yet; the nudge stays available
  writeFileSync(marker, "1");

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
