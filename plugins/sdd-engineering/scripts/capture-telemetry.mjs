#!/usr/bin/env node
/**
 * SDD Engineering — per-step harness telemetry capture.
 *
 * Fires on the `SubagentStop` and `Stop` hook events and appends ONE JSON line
 * per event to a durable, project-local ledger. SDD steps are often run
 * separately (spec now, planning later, implementation in another session), so
 * in-context telemetry from earlier steps is gone by the time you run `retro`.
 * This ledger keeps the record so `retro` can aggregate harness performance
 * across the whole workflow regardless of when each step ran.
 *
 * WHERE THE NUMBERS COME FROM
 * The hook payload carries NO usage block — it has session_id, agent_id,
 * agent_type, and (crucially) `agent_transcript_path` / `transcript_path`.
 * Usage lives in the TRANSCRIPT: every assistant entry has a `message.usage`
 * with input_tokens / output_tokens / cache_read_input_tokens /
 * cache_creation_input_tokens. So we aggregate the transcript, not the payload.
 *
 * INCREMENTAL BY WATERMARK
 * A transcript ACCUMULATES: the main session transcript grows across every turn,
 * and a RESUMED subagent re-appends to its existing transcript. Aggregating the
 * whole file on each event would re-count everything that came before, so we
 * remember the last entry we already billed (per transcript, in a sidecar state
 * file) and only aggregate what is new. Each ledger row is therefore the cost of
 * THAT step alone, and rows sum to the true total.
 *
 * Ledger path (first match wins):
 *   1. $SDD_TELEMETRY_LEDGER
 *   2. $CLAUDE_PROJECT_DIR/retros/ledger.jsonl
 *   3. ./retros/ledger.jsonl
 *
 * This script is intentionally dependency-free and never throws into the
 * session: any failure is swallowed and it always exits 0.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function pick(...vals) {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue; // "" is not a label
    return v;
  }
  return null;
}

/** Parse a JSONL transcript, tolerating partial/corrupt trailing lines. */
function readTranscript(path) {
  if (!path) return [];
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // A transcript can be mid-write; skip the torn line rather than bail.
    }
  }
  return entries;
}

/**
 * Roll up the usage of every assistant entry into one record.
 * `entries` is already narrowed to the slice this event is responsible for.
 */
function aggregate(entries) {
  const acc = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    toolUses: 0,
    model: null,
    stopReason: null,
    apiError: false,
  };

  let firstTs = null;
  let lastTs = null;

  for (const e of entries) {
    const ts = Date.parse(e.timestamp ?? '');
    if (!Number.isNaN(ts)) {
      if (firstTs === null || ts < firstTs) firstTs = ts;
      if (lastTs === null || ts > lastTs) lastTs = ts;
    }

    if (e.isApiErrorMessage) acc.apiError = true;

    const msg = e.message;
    if (!msg || msg.role !== 'assistant') continue;

    const u = msg.usage;
    if (u) {
      acc.inputTokens += u.input_tokens ?? 0;
      acc.outputTokens += u.output_tokens ?? 0;
      acc.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      acc.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
    }
    if (msg.model) acc.model = msg.model;
    if (msg.stop_reason) acc.stopReason = msg.stop_reason;

    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && block.type === 'tool_use') acc.toolUses += 1;
      }
    }
  }

  acc.durationMs = firstTs !== null && lastTs !== null ? lastTs - firstTs : null;
  return acc;
}

/**
 * The watermark for one transcript lives in its OWN file, named by a hash of the
 * transcript path. A single shared state file would be read-modify-written by
 * every hook process, and `run-plan` fans out implementers that finish at the
 * same moment — concurrent writers would lose each other's updates, and dropping
 * the MAIN transcript's watermark silently re-bills the whole session on the
 * next `Stop`. Separate files per transcript means no shared mutable state.
 */
function markPathFor(stateDir, transcriptPath) {
  const key = createHash('sha1').update(transcriptPath).digest('hex').slice(0, 16);
  return join(stateDir, `${key}.json`);
}

function loadMark(markPath) {
  try {
    const parsed = JSON.parse(readFileSync(markPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function saveMark(stateDir, markPath, mark) {
  try {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(markPath, JSON.stringify(mark) + '\n');
  } catch {
    // A lost watermark costs accuracy, never the session.
  }
}

/**
 * Entries after the watermark. No watermark => the whole file.
 *
 * The uuid is the primary anchor, but a transcript can be rewritten (compaction
 * drops earlier entries), which would leave the anchor uuid nowhere to be found.
 * Falling back to "bill everything" there would re-count the entire transcript —
 * the exact inflation this watermark exists to prevent — so fall back to the
 * anchor's TIMESTAMP instead and take only what came after it.
 */
function sliceNew(entries, mark) {
  if (!mark) return entries;

  if (mark.uuid) {
    const idx = entries.findIndex((e) => e.uuid === mark.uuid);
    if (idx !== -1) return entries.slice(idx + 1);
  }

  const cutoff = Date.parse(mark.ts ?? '');
  if (!Number.isNaN(cutoff)) {
    return entries.filter((e) => {
      const ts = Date.parse(e.timestamp ?? '');
      return !Number.isNaN(ts) && ts > cutoff;
    });
  }

  return entries;
}

/**
 * The newest entry we can anchor to. A transcript ends with uuid-less metadata
 * records (`last-prompt`, `ai-title`); anchoring on one of those would save no
 * uuid at all and silently re-bill the whole transcript next time. Carry the
 * timestamp too, as the compaction fallback above depends on it.
 */
function lastAnchor(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e?.uuid) return { uuid: e.uuid, ts: e.timestamp ?? null };
  }
  return null;
}

function main() {
  const raw = readStdin();
  let evt = {};
  try {
    evt = raw ? JSON.parse(raw) : {};
  } catch {
    evt = { _unparsed: raw.slice(0, 2000) };
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const ledger =
    process.env.SDD_TELEMETRY_LEDGER || join(projectDir, 'retros', 'ledger.jsonl');
  const stateDir = join(dirname(ledger), '.ledger-state');

  const event = pick(evt.hook_event_name, evt.event) ?? 'unknown';
  const isSubagent = event === 'SubagentStop';

  // A subagent bills against its OWN transcript; the main thread against the
  // session transcript.
  const transcriptPath = isSubagent
    ? pick(evt.agent_transcript_path, evt.transcript_path)
    : pick(evt.transcript_path);

  const markPath = transcriptPath ? markPathFor(stateDir, transcriptPath) : null;
  const all = readTranscript(transcriptPath);

  // Defensive: on older harness versions subagent turns were inlined into the
  // main transcript as sidechain entries. Billing them to the main-thread row
  // would double-count them against their own SubagentStop row.
  const scoped = isSubagent ? all : all.filter((e) => e.isSidechain !== true);

  const fresh = sliceNew(scoped, markPath ? loadMark(markPath) : null);
  const usage = aggregate(fresh);

  // The label must never be empty — an unattributable row is a dead row.
  // agent_type is blank for some launches, so fall back to the transcript's own
  // attribution, then to the agent id, then to an explicit sentinel.
  const attribution = fresh.find((e) => e.attributionAgent)?.attributionAgent;
  const agent = isSubagent
    ? pick(evt.agent_type, evt.subagent_type, attribution, evt.agent_id, 'unknown-agent')
    : 'main';

  const status = usage.apiError
    ? 'error'
    : usage.stopReason
      ? usage.stopReason === 'end_turn' || usage.stopReason === 'tool_use'
        ? 'completed'
        : usage.stopReason
      : 'unknown';

  const record = {
    ts: new Date().toISOString(),
    event,
    session: pick(evt.session_id, evt.sessionId),
    agent,
    agentId: pick(evt.agent_id),
    model: usage.model,
    status,
    stopReason: usage.stopReason,
    // Total billed tokens: fresh input + output + both cache classes.
    tokens:
      usage.inputTokens +
      usage.outputTokens +
      usage.cacheReadTokens +
      usage.cacheCreationTokens,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheCreationTokens: usage.cacheCreationTokens,
    toolUses: usage.toolUses,
    durationMs: usage.durationMs,
  };

  try {
    mkdirSync(dirname(ledger), { recursive: true });
    appendFileSync(ledger, JSON.stringify(record) + '\n');

    // Only advance the watermark once the row is safely on disk, so a failed
    // append is retried rather than silently skipped.
    const anchor = lastAnchor(scoped);
    if (markPath && anchor) saveMark(stateDir, markPath, anchor);
  } catch {
    // Telemetry must never break a session.
  }
}

try {
  main();
} catch {
  // swallow
}
process.exit(0);
