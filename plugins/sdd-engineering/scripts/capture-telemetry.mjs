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
 * Ledger path (first match wins):
 *   1. $SDD_TELEMETRY_LEDGER
 *   2. $CLAUDE_PROJECT_DIR/retros/ledger.jsonl
 *   3. ./retros/ledger.jsonl
 *
 * This script is intentionally dependency-free and never throws into the
 * session: any failure is swallowed and it always exits 0.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function pick(...vals) {
  for (const v of vals) if (v !== undefined && v !== null) return v;
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

  // Field names vary across Claude Code versions — read defensively.
  const usage = evt.usage || evt.token_usage || {};
  const record = {
    ts: new Date().toISOString(),
    event: pick(evt.hook_event_name, evt.event, 'unknown'),
    session: pick(evt.session_id, evt.sessionId),
    agent: pick(evt.subagent_type, evt.agent_type, evt.agent),
    status: pick(evt.status, evt.stop_reason, evt.reason),
    tokens: pick(
      usage.total_tokens,
      usage.total,
      evt.total_tokens,
      evt.tokens
    ),
    inputTokens: pick(usage.input_tokens, usage.input),
    outputTokens: pick(usage.output_tokens, usage.output),
    toolUses: pick(evt.tool_use_count, evt.toolUses, evt.tool_calls),
    durationMs: pick(evt.duration_ms, evt.durationMs, evt.wall_time_ms),
  };

  try {
    mkdirSync(dirname(ledger), { recursive: true });
    appendFileSync(ledger, JSON.stringify(record) + '\n');
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
