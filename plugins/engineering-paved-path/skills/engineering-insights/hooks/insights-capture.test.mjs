// Drives insights-capture.mjs the way the Stop hook does: a child process, the
// hook's JSON on stdin, a git repo of the test's own as the working folder, and
// the temp folder (where the per-session marker lives) pointed into the test.
//
//   npm run test:insights-hook   (node --test plugins/engineering-paved-path/skills/engineering-insights/hooks/insights-capture.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./insights-capture.mjs', import.meta.url));

/** A repo with one commit, plus a temp folder for the marker; both removed when the test ends. */
function setup(t, { repo = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'insights-capture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = join(root, 'work');
  const temp = join(root, 'temp');
  mkdirSync(work);
  mkdirSync(temp);
  writeFileSync(join(work, 'app.js'), 'export const a = 1;\n');
  if (repo) {
    const git = (...args) => execFileSync('git', args, { cwd: work, stdio: 'ignore' });
    git('init', '-q');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'start');
  }
  return {
    work,
    commit: () => {
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-am', 'more'], {
        cwd: work,
        stdio: 'ignore',
      });
    },
    /** One stop; true when the hook blocked it with the nudge. */
    stop: (extra = {}) => {
      const run = spawnSync(process.execPath, [SCRIPT], {
        input: JSON.stringify({ session_id: 'session-1', cwd: work, ...extra }),
        env: { ...process.env, TMP: temp, TEMP: temp, TMPDIR: temp },
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

test('an untracked file alone is not a code change', (t) => {
  const s = setup(t);
  writeFileSync(join(s.work, 'notes.txt'), 'scratch\n');
  assert.equal(s.stop(), false);
});

test('a tracked file changed: the first stop is nudged, and only the first', (t) => {
  const s = setup(t);
  writeFileSync(join(s.work, 'app.js'), 'export const a = 2;\n');
  assert.equal(s.stop(), true);
  assert.equal(s.stop(), false);
});

test('quiet first, then a change: the nudge waits for the stop after the change', (t) => {
  const s = setup(t);
  assert.equal(s.stop(), false);
  writeFileSync(join(s.work, 'app.js'), 'export const a = 2;\n');
  assert.equal(s.stop(), true);
  assert.equal(s.stop(), false);
});

test('a change committed after the first quiet stop is still nudged, though the tree is clean', (t) => {
  const s = setup(t);
  assert.equal(s.stop(), false);
  writeFileSync(join(s.work, 'app.js'), 'export const a = 2;\n');
  s.commit();
  assert.equal(s.stop(), true);
});

test('outside a git repo it nudges once, as before', (t) => {
  const s = setup(t, { repo: false });
  assert.equal(s.stop(), true);
  assert.equal(s.stop(), false);
});

test('within a stop sequence it never fires', (t) => {
  const s = setup(t);
  writeFileSync(join(s.work, 'app.js'), 'export const a = 2;\n');
  assert.equal(s.stop({ stop_hook_active: true }), false);
});
