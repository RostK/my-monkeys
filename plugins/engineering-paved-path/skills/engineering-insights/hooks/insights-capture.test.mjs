// Drives insights-capture.mjs the way the Stop hook does: a child process, the
// hook's JSON on stdin, a git repo of the test's own as the working folder, a
// transcript whose first timestamp is the session's start, and the temp folder
// (where the per-session marker lives) pointed into the test. Git runs with no
// global or system config, and cannot climb out of the test's folder.
//
//   npm run test:insights-hook   (node --test plugins/engineering-paved-path/skills/engineering-insights/hooks/insights-capture.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./insights-capture.mjs', import.meta.url));

// The session started a minute ago; everything that predates it is an hour older.
const START = Date.now() - 60_000;
const BEFORE = new Date(START - 3_600_000);
const gitDate = (d) => `${Math.floor(d.getTime() / 1000)} +0000`;

/**
 * A repo whose history predates the session: `app.js` committed on the default branch,
 * and a branch `old` that changes it. Plus a temp folder for the marker and a transcript.
 * Everything is removed when the test ends.
 */
function setup(t, { repo = true, transcript = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'insights-capture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = join(root, 'work');
  const temp = join(root, 'temp');
  mkdirSync(work);
  mkdirSync(temp);
  const emptyConfig = join(root, 'gitconfig');
  writeFileSync(emptyConfig, '');
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: root,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
    TMP: temp,
    TEMP: temp,
    TMPDIR: temp,
  };
  const git = (args, extraEnv = {}) =>
    execFileSync('git', args, { cwd: work, env: { ...env, ...extraEnv }, stdio: 'ignore' });
  const old = { GIT_AUTHOR_DATE: gitDate(BEFORE), GIT_COMMITTER_DATE: gitDate(BEFORE) };

  /** Write a file, dated before the session unless `now`. */
  const write = (name, body, { now = false } = {}) => {
    const file = join(work, name);
    writeFileSync(file, body);
    if (!now) utimesSync(file, BEFORE, BEFORE);
  };

  write('app.js', 'export const a = 1;\n');
  if (repo) {
    git(['init', '-q']);
    git(['add', '.']);
    git(['commit', '-q', '-m', 'start'], old);
    git(['switch', '-q', '-c', 'old']);
    // A different size: same size plus a backdated mtime and git trusts its stat cache.
    write('app.js', 'export const a = 10;\n');
    git(['commit', '-q', '-am', 'an older branch'], old);
    git(['switch', '-q', '-']);
    utimesSync(join(work, 'app.js'), BEFORE, BEFORE);
  }

  const transcriptPath = join(root, 'session.jsonl');
  if (transcript) {
    writeFileSync(
      transcriptPath,
      JSON.stringify({ type: 'summary', summary: 'no timestamp here' }) +
        '\n' +
        JSON.stringify({ type: 'user', timestamp: new Date(START).toISOString() }) +
        '\n',
    );
  }

  return {
    git,
    write,
    /** One stop; true when the hook blocked it with the nudge. */
    stop: (extra = {}) => {
      const run = spawnSync(process.execPath, [SCRIPT], {
        input: JSON.stringify({ session_id: 'session-1', cwd: work, transcript_path: transcriptPath, ...extra }),
        env,
        encoding: 'utf8',
      });
      assert.equal(run.status, 0, `the hook must exit 0, stderr: ${run.stderr}`);
      return run.stdout.includes('"decision":"block"');
    },
  };
}

test('no code changed: every stop goes through', (t) => {
  const s = setup(t);
  assert.equal(s.stop(), false);
  assert.equal(s.stop(), false);
});

test('work in progress that predates the session is not a change', (t) => {
  const s = setup(t);
  s.write('app.js', 'export const a = 2; // WIP\n');
  s.write('scratch.txt', 'notes\n');
  assert.equal(s.stop(), false);
});

test('a tracked file changed in the session: the first stop is nudged, and only the first', (t) => {
  const s = setup(t);
  s.write('app.js', 'export const a = 2;\n', { now: true });
  assert.equal(s.stop(), true);
  assert.equal(s.stop(), false);
});

test('a new file is a change, though git does not track it yet', (t) => {
  const s = setup(t);
  s.write('feature.js', 'export const b = 1;\n', { now: true });
  assert.equal(s.stop(), true);
});

test('quiet first, then a change: the nudge waits for the stop after the change', (t) => {
  const s = setup(t);
  assert.equal(s.stop(), false);
  s.write('app.js', 'export const a = 2;\n', { now: true });
  assert.equal(s.stop(), true);
});

test('work committed on another branch, then left, is still a change', (t) => {
  const s = setup(t);
  s.git(['switch', '-q', '-c', 'release']);
  s.write('app.js', 'export const a = 3;\n', { now: true });
  s.git(['commit', '-q', '-am', 'the session\'s work']);
  s.git(['switch', '-q', '-']);
  assert.equal(s.stop(), true);
});

test('checking out an older branch is not a change, though it rewrites files', (t) => {
  const s = setup(t);
  s.git(['switch', '-q', 'old']);
  assert.equal(s.stop(), false);
});

test('outside a git repo it nudges once, as before', (t) => {
  const s = setup(t, { repo: false });
  assert.equal(s.stop(), true);
  assert.equal(s.stop(), false);
});

test('with no readable session start it nudges once, as before', (t) => {
  const s = setup(t, { transcript: false });
  assert.equal(s.stop(), true);
  assert.equal(s.stop(), false);
});

test('within a stop sequence it never fires', (t) => {
  const s = setup(t);
  s.write('app.js', 'export const a = 2;\n', { now: true });
  assert.equal(s.stop({ stop_hook_active: true }), false);
});
