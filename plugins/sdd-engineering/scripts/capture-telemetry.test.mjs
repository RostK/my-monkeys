// Drives capture-telemetry.mjs the way the hook does: a child process, the
// hook's JSON on stdin, a transcript file on disk, SDD_TELEMETRY_LEDGER pointing
// at a ledger of the test's own. Every expected figure below is worked out by
// hand from the fixture beside it; nothing here calls the script's functions.
//
//   npm run test:telemetry   (node --test plugins/sdd-engineering/scripts/capture-telemetry.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./capture-telemetry.mjs', import.meta.url));

/** A folder under the system temp folder, removed when the test ends. */
function workdir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'capture-telemetry-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const jsonl = (entries) => entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

/** Run the script once, as the hook would, with these environment variables set. */
function run(dir, payload, vars) {
  const env = { ...process.env };
  delete env.SDD_TELEMETRY_LEDGER;
  delete env.CLAUDE_PROJECT_DIR;
  Object.assign(env, vars);
  const result = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(payload),
    env,
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `the script must exit 0, stderr: ${result.stderr}`);
}

/** Every row of a ledger so far; none when it was never written. */
function rowsOf(ledger) {
  if (!existsSync(ledger)) return [];
  return readFileSync(ledger, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Fire with SDD_TELEMETRY_LEDGER pointing into the test's folder; return every row so far. */
function fire(dir, payload) {
  const ledger = join(dir, 'ledger.jsonl');
  run(dir, payload, { SDD_TELEMETRY_LEDGER: ledger });
  return rowsOf(ledger);
}

let nextUuid = 0;
const user = (timestamp, extra = {}) => ({
  uuid: `u-${++nextUuid}`,
  timestamp,
  message: { role: 'user', content: 'go on' },
  ...extra,
});
/** One transcript entry of an assistant message. usage = [input, output, cacheRead, cacheCreation]. */
const assistant = (timestamp, id, usage, content, stopReason = null, extra = {}) => ({
  uuid: `u-${++nextUuid}`,
  timestamp,
  message: {
    role: 'assistant',
    ...(id ? { id } : {}),
    model: 'model-a',
    stop_reason: stopReason,
    usage: {
      input_tokens: usage[0],
      output_tokens: usage[1],
      cache_read_input_tokens: usage[2],
      cache_creation_input_tokens: usage[3],
    },
    content,
  },
  ...extra,
});
const text = { type: 'text', text: 'said' };
const toolUse = { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} };

// Three calls, each reading more than the one before.
//   call   input  output  cache-read  cache-creation   context (in + read + creation)
//   msg_1     10     100        1000             500   1510
//   msg_2     20     200        2000             300   2320
//   msg_3      5      50        4000             100   4105
//   sums      35     350        7000             900   tokens 8285
const threeCalls = () => [
  user('2026-10-12T10:00:00.000Z'),
  assistant('2026-10-12T10:00:05.000Z', 'msg_1', [10, 100, 1000, 500], [toolUse], 'tool_use'),
  user('2026-10-12T10:00:06.000Z'),
  assistant('2026-10-12T10:00:20.000Z', 'msg_2', [20, 200, 2000, 300], [text, toolUse], 'tool_use'),
  user('2026-10-12T10:00:21.000Z'),
  assistant('2026-10-12T10:01:30.000Z', 'msg_3', [5, 50, 4000, 100], [text], 'end_turn'),
];

const subagentStop = (transcript) => ({
  hook_event_name: 'SubagentStop',
  session_id: 'session-1',
  agent_id: 'agent-1',
  agent_type: 'implementer',
  agent_transcript_path: transcript,
});
const stop = (transcript) => ({
  hook_event_name: 'Stop',
  session_id: 'session-1',
  transcript_path: transcript,
});

test('three calls with growing context: three calls, the peak is the largest, every earlier key as before', (t) => {
  const dir = workdir(t);
  const transcript = join(dir, 'agent.jsonl');
  writeFileSync(transcript, jsonl(threeCalls()));

  const rows = fire(dir, subagentStop(transcript));
  assert.equal(rows.length, 1);
  const { ts, ...row } = rows[0];
  assert.ok(!Number.isNaN(Date.parse(ts)), 'ts is a time');

  // The whole row, keys and values together: a key added, dropped or changed fails here.
  assert.deepEqual(row, {
    event: 'SubagentStop',
    session: 'session-1',
    agent: 'implementer',
    agentId: 'agent-1',
    model: 'model-a',
    status: 'completed',
    stopReason: 'end_turn',
    coldStart: true,
    tokens: 8285,
    inputTokens: 35,
    outputTokens: 350,
    cacheReadTokens: 7000,
    cacheCreationTokens: 900,
    toolUses: 2,
    durationMs: 90000, // 10:00:00 to 10:01:30
    modelCalls: 3,
    peakContextTokens: 4105,
  });
});

test('a message id written twice is one call, on a main-thread row, and the peak need not be the last call', (t) => {
  const dir = workdir(t);
  const transcript = join(dir, 'session.jsonl');
  // msg_A is written as two entries (one per content block), each repeating the
  // message's usage, as the harness writes them. Its context, 3 + 2000 + 997 =
  // 3000, is larger than msg_B's, 2 + 1100 + 98 = 1200, which comes after it.
  // The sidechain entry is another agent's call and is no part of a Stop row.
  writeFileSync(
    transcript,
    jsonl([
      user('2026-10-12T11:00:00.000Z'),
      assistant('2026-10-12T11:00:02.000Z', 'msg_A', [3, 40, 2000, 997], [text]),
      assistant('2026-10-12T11:00:03.000Z', 'msg_A', [3, 40, 2000, 997], [toolUse], 'tool_use'),
      assistant('2026-10-12T11:00:04.000Z', 'msg_S', [1, 1, 90000, 0], [text], 'end_turn', { isSidechain: true }),
      user('2026-10-12T11:00:05.000Z'),
      assistant('2026-10-12T11:00:10.000Z', 'msg_B', [2, 30, 1100, 98], [text], 'end_turn'),
    ]),
  );

  const rows = fire(dir, stop(transcript));
  assert.equal(rows.length, 1);
  const { ts, ...row } = rows[0];

  // The token sums count msg_A ONCE, though it is written twice (TK-450): input
  // 3 + 2, output 40 + 30, cache-read 2000 + 1100, cache-creation 997 + 98.
  // Summed entry by entry, as before 1.2.0, they were 8 / 110 / 5100 / 2092 = 7310.
  assert.deepEqual(row, {
    event: 'Stop',
    session: 'session-1',
    agent: 'main',
    agentId: null,
    model: 'model-a',
    status: 'completed',
    stopReason: 'end_turn',
    coldStart: true,
    tokens: 4270,
    inputTokens: 5,
    outputTokens: 70,
    cacheReadTokens: 3100,
    cacheCreationTokens: 1095,
    toolUses: 1,
    durationMs: 10000,
    modelCalls: 2,
    peakContextTokens: 3000,
  });
});

test('an assistant entry with no message id is counted as a call of its own', (t) => {
  const dir = workdir(t);
  const transcript = join(dir, 'agent.jsonl');
  writeFileSync(
    transcript,
    jsonl([
      assistant('2026-10-12T12:00:00.000Z', null, [1, 1, 100, 0], [text]),
      assistant('2026-10-12T12:00:01.000Z', null, [1, 1, 200, 0], [text], 'end_turn'),
    ]),
  );

  const [row] = fire(dir, subagentStop(transcript));
  assert.equal(row.modelCalls, 2);
  assert.equal(row.peakContextTokens, 201);
});

test('a second event on the same transcript counts only the calls written since the first', (t) => {
  const dir = workdir(t);
  const transcript = join(dir, 'agent.jsonl');
  writeFileSync(transcript, jsonl(threeCalls()));
  fire(dir, subagentStop(transcript));

  // A resumed agent appends to its transcript: one more call, reading less (7 + 800 + 93 = 900).
  appendFileSync(
    transcript,
    jsonl([
      user('2026-10-12T10:05:00.000Z'),
      assistant('2026-10-12T10:05:04.000Z', 'msg_4', [7, 60, 800, 93], [text], 'end_turn'),
    ]),
  );
  const rows = fire(dir, subagentStop(transcript));

  assert.equal(rows.length, 2);
  assert.equal(rows[1].coldStart, false);
  assert.equal(rows[1].modelCalls, 1);
  assert.equal(rows[1].peakContextTokens, 900);
  assert.equal(rows[1].tokens, 960);
});

for (const [kind, payload, agent, agentId] of [
  ['an agent', subagentStop, 'implementer', 'agent-1'],
  ['the main thread', stop, 'main', null],
]) {
  test(`a transcript that cannot be read, for ${kind}: the row is still written, both new keys null`, (t) => {
    const dir = workdir(t);
    const rows = fire(dir, payload(join(dir, 'never-written.jsonl')));
    assert.equal(rows.length, 1);
    const { ts, ...row } = rows[0];
    assert.deepEqual(row, {
      event: payload === stop ? 'Stop' : 'SubagentStop',
      session: 'session-1',
      agent,
      agentId,
      model: null,
      status: 'unknown',
      stopReason: null,
      coldStart: true,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      toolUses: 0,
      durationMs: null,
      modelCalls: null,
      peakContextTokens: null,
    });
  });
}

test('a transcript that is read and holds no model call: both new keys null, not zero', (t) => {
  const dir = workdir(t);
  const transcript = join(dir, 'agent.jsonl');
  writeFileSync(transcript, jsonl([user('2026-10-12T13:00:00.000Z')]));

  const [row] = fire(dir, subagentStop(transcript));
  assert.equal(row.modelCalls, null);
  assert.equal(row.peakContextTokens, null);
  assert.equal(row.tokens, 0);
});

test('copies of one answer, an unfinished one and a repeated tool call among them, are one call', (t) => {
  const dir = workdir(t);
  const transcript = join(dir, 'agent.jsonl');
  // msg_X is written three times: once before its usage was known (all zero),
  // then its tool call twice over. One call: 4 + 300 + 5000 + 0 = 5304 tokens,
  // context 4 + 5000 + 0 = 5004, one tool call.
  const call = { type: 'tool_use', id: 'tool-9', name: 'Read', input: {} };
  writeFileSync(
    transcript,
    jsonl([
      assistant('2026-10-21T09:00:00.000Z', 'msg_X', [0, 0, 0, 0], [text]),
      assistant('2026-10-21T09:00:01.000Z', 'msg_X', [4, 300, 5000, 0], [call], 'tool_use'),
      assistant('2026-10-21T09:00:01.000Z', 'msg_X', [4, 300, 5000, 0], [call], 'tool_use'),
    ]),
  );

  const [row] = fire(dir, subagentStop(transcript));
  assert.equal(row.tokens, 5304);
  assert.equal(row.outputTokens, 300);
  assert.equal(row.toolUses, 1);
  assert.equal(row.modelCalls, 1);
  assert.equal(row.peakContextTokens, 5004);
});

test('with no ledger variable, a project without a retros folder gets no ledger and no folder', (t) => {
  const project = workdir(t);
  const transcript = join(project, 'agent.jsonl');
  writeFileSync(transcript, jsonl(threeCalls()));

  run(project, subagentStop(transcript), { CLAUDE_PROJECT_DIR: project });

  assert.equal(existsSync(join(project, 'retros')), false);
});

for (const [where, vars] of [
  ['the project folder', (dir) => ({ CLAUDE_PROJECT_DIR: dir })],
  ['the working folder, when no project folder is set', () => ({})],
]) {
  test(`with no ledger variable, a retros folder in ${where} is the opt-in: the row lands there`, (t) => {
    const project = workdir(t);
    mkdirSync(join(project, 'retros'));
    const transcript = join(project, 'agent.jsonl');
    writeFileSync(transcript, jsonl(threeCalls()));

    run(project, subagentStop(transcript), vars(project));

    const rows = rowsOf(join(project, 'retros', 'ledger.jsonl'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].modelCalls, 3);
  });
}
