#!/usr/bin/env node
// Runs eval cases whose agent declares `isolation: worktree` (the implementer) outside
// `claude plugin eval`. The harness confines every eval child (CLAUDE_CODE_EVAL_CONFINED),
// and a confined session refuses to create an agent worktree, so the implementer cannot be
// launched there. This runner keeps the case's own files as the source of truth: it runs
// the case's scaffold.sh in a fresh temporary workspace, sends prompt.md to `claude -p`
// with the case's plugins and tools, and grades the case's `tool_used` and `llm` graders
// the way the harness does (an llm grader passes on at least 2 of 3 judge votes).
//
// Unlike the harness, it does not sandbox the run: Bash runs as you, in the temporary
// workspace. It runs on your normal Claude Code login, never --bare (which needs an API key).
//
// Usage: node plugins/sdd-engineering/evals/run-outside-harness.mjs [--runs N]
//          [--max-budget-usd USD] [--judge-model MODEL] [--keep] <case-dir>...
// --keep leaves the workspace and its stream-json trace in the temp directory.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args.splice(i, 2)[1];
};
const runs = Number(opt('--runs', '1'));
const budget = opt('--max-budget-usd', '5');
const judgeModel = opt('--judge-model', 'haiku');
const keep = args.includes('--keep') ? (args.splice(args.indexOf('--keep'), 1), true) : false;
if (args.length === 0) {
  console.error('usage: run-outside-harness.mjs [--runs N] [--max-budget-usd USD] [--judge-model M] [--keep] <case-dir>...');
  process.exit(2);
}

// On Windows `claude` is an npm `.cmd` shim, which Node starts only through a shell; quote
// each argument for cmd.exe so empty and comma-separated values survive.
const claude = (claudeArgs, options) => process.platform === 'win32'
  ? spawnSync(['claude', ...claudeArgs.map((a) => `"${a.replace(/"/g, '""')}"`)].join(' '), { ...options, shell: true })
  : spawnSync('claude', claudeArgs, options);
// A Windows checkout with core.autocrlf gives the case files CRLF line endings.
const readText = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

// The subset of case.yaml these cases use: `plugins` and `allowed_tools` as one-line flow
// lists, `max_turns`, and a `graders` list of flat keys plus `criteria: |` block scalars.
function parseCase(text) {
  const flowList = (key) => {
    const m = text.match(new RegExp(`^\\s*${key}:\\s*\\[(.*)\\]\\s*$`, 'm'));
    return m ? m[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
  };
  const scalar = (raw) => {
    const v = raw.trim();
    if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
    if (v.startsWith('"')) return JSON.parse(v);
    return /^\d+$/.test(v) ? Number(v) : v;
  };
  const graders = [];
  const lines = text.slice(text.search(/^graders:/m)).split('\n').slice(1);
  for (let i = 0; i < lines.length; i++) {
    const item = lines[i].match(/^(\s*)- name:\s*(.+)$/);
    const field = lines[i].match(/^\s+(\w+):\s*(.*)$/);
    if (item) graders.push({ name: scalar(item[2]) });
    else if (field && graders.length > 0 && field[2] === '|') {
      const block = [];
      const indent = lines[i + 1]?.match(/^\s*/)[0].length ?? 0;
      while (i + 1 < lines.length && (lines[i + 1].trim() === '' || lines[i + 1].match(/^\s*/)[0].length >= indent)) {
        block.push(lines[++i].slice(indent));
      }
      graders.at(-1)[field[1]] = block.join('\n').trimEnd();
    } else if (field && graders.length > 0) graders.at(-1)[field[1]] = scalar(field[2]);
  }
  const maxTurns = Number(text.match(/^\s*max_turns:\s*(\d+)/m)?.[1] ?? 10);
  return { plugins: flowList('plugins'), tools: flowList('allowed_tools'), maxTurns, graders };
}

function judge(criteria, answer) {
  const prompt =
    'You are grading an AI agent\'s final reply against a rubric. Reply with exactly PASS or FAIL ' +
    'on the first line, then one sentence of reason.\n\n<rubric>\n' + criteria +
    '\n</rubric>\n\n<reply>\n' + answer + '\n</reply>';
  const votes = [];
  const reasons = [];
  for (let v = 0; v < 3; v++) {
    const out = claude(['-p', '--model', judgeModel, '--tools', '', '--max-turns', '1',
      '--setting-sources', 'project', '--strict-mcp-config', '--no-session-persistence'],
      { input: prompt, encoding: 'utf8', timeout: 120_000 });
    const pass = /^\s*PASS\b/.test(out.stdout ?? '');
    votes.push(pass ? 'PASS' : 'FAIL');
    if (!pass) reasons.push((out.stdout ?? '').trim().replace(/^FAIL\s*/, '').replace(/\s+/g, ' ').slice(0, 300));
  }
  return { votes, reasons };
}

let failed = 0;
for (const caseArg of args) {
  const caseDir = resolve(caseArg);
  const spec = parseCase(readText(join(caseDir, 'case.yaml')));
  const prompt = readText(join(caseDir, 'prompt.md')).replace(/^---\n[\s\S]*?\n---\n/, '');
  for (const g of spec.graders) {
    if (g.type !== 'tool_used' && g.type !== 'llm') throw new Error(`${caseArg}: grader type ${g.type} is not supported here`);
  }
  for (let run = 1; run <= runs; run++) {
    const workspace = mkdtempSync(join(tmpdir(), 'sdd-eval-'));
    execFileSync('bash', [join(caseDir, 'scaffold.sh')], { cwd: workspace, stdio: 'inherit' });
    // The session keeps its transcript (no --no-session-persistence): engineering-paved-path's
    // insights Stop hook dates the session's start from it, and without one it always nudges,
    // and the reply to that nudge replaces the answer the llm graders read.
    const claudeArgs = ['-p', '--output-format', 'stream-json', '--verbose', '--forward-subagent-text',
      '--permission-mode', 'dontAsk', '--tools', spec.tools.join(','), '--allowedTools', spec.tools.join(','),
      '--max-turns', String(spec.maxTurns), '--max-budget-usd', budget,
      // Your own user settings (and the plugins they enable) stay out; the case names its plugins.
      '--setting-sources', 'project,local', '--strict-mcp-config',
      ...spec.plugins.flatMap((p) => ['--plugin-dir', resolve(caseDir, p)])];
    const child = claude(claudeArgs, { cwd: workspace, input: prompt, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const calls = new Map();
    let answer = '';
    let cost = null;
    let overage = 'unknown';
    for (const line of (child.stdout ?? '').split('\n')) {
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === 'assistant') {
        for (const block of msg.message?.content ?? []) {
          if (block.type === 'tool_use') calls.set(block.id, { name: block.name, inputText: JSON.stringify(block.input) });
          if (block.type === 'text' && msg.parent_tool_use_id == null) answer = block.text;
        }
      } else if (msg.type === 'result') cost = msg.total_cost_usd;
      else if (msg.type === 'rate_limit_event') overage = String(msg.rate_limit_info?.isUsingOverage);
    }
    console.log(`\n== ${caseArg} run ${run}/${runs}  cost(list price) $${cost?.toFixed(2) ?? '?'}  using overage: ${overage}`);
    let passed = 0;
    for (const g of spec.graders) {
      let ok;
      let why;
      if (g.type === 'tool_used') {
        const re = g.input_match ? new RegExp(g.input_match) : null;
        const n = [...calls.values()].filter((c) => c.name === g.tool && (!re || re.test(c.inputText))).length;
        const min = g.min ?? 1;
        const max = g.max ?? Infinity;
        ok = n >= min && n <= max;
        why = `${g.tool} called ${n}x (expected ${min}..${max === Infinity ? '∞' : max})`;
      } else {
        const { votes, reasons } = judge(g.criteria, answer);
        ok = votes.filter((v) => v === 'PASS').length >= 2;
        why = `judge votes: ${votes.join(' ')}${reasons.map((r) => `\n      FAIL: ${r}`).join('')}`;
      }
      passed += ok ? 1 : 0;
      console.log(`  ${ok ? 'PASS' : 'FAIL'} ${g.name}: ${why}`);
    }
    const skills = [...calls.values()].filter((c) => c.name === 'Skill').map((c) => JSON.parse(c.inputText).skill);
    console.log(`  Skill calls: ${skills.join(', ') || 'none'}`);
    console.log(`  score ${passed}/${spec.graders.length}${child.status ? `  (claude exited ${child.status})` : ''}`);
    if (passed < spec.graders.length) failed++;
    if (keep) {
      writeFileSync(`${workspace}.trace.jsonl`, child.stdout ?? '');
      console.log(`  workspace kept: ${workspace} (trace: ${workspace}.trace.jsonl)`);
    } else {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
}
process.exit(failed > 0 ? 1 : 0);
