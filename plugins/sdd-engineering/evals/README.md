# sdd-engineering evals

Behavioural evals for the instruction changes in sdd-engineering 1.2.0: one case per behaviour,
each with a concrete pass check. Cases use the `claude plugin eval` format (`case.yaml` +
`prompt.md` + `scaffold.sh`). Each case's scaffold builds a tiny git repository from
`fixtures/` in the run's empty workspace.

| Case | What a pass proves |
|---|---|
| `01-implementer-named-skills` | Given a UI unit that names `typescript-expert` and `frontend-ui-architecture`, `implementer` loads those two with the Skill tool and no other skill (`pr-self-review`, which `implementer.md` names as an example, is allowed). No onion/fastify/drizzle/postgres skill. The unit comes back `done` with tests green. The scaffold fails if `agents/implementer.md` preloads skills in its frontmatter. |
| `02-implementer-track-defaults` | The same unit with no skills named: `implementer` loads the seven UI defaults from "Know your track" and nothing from the backend set. |
| `03-planner-skills-and-sizing` | Given a spec mixing a UI change, a backend change and two rules in one service file, `implementation-planner` gives each unit a "Skills to apply" list that fits its track and what it touches. It splits the two rules into two sequenced units. |
| `04-run-plan-telemetry-check` | In a project with no `retros/` folder, `run-plan`'s intake (Phase 0 step 5) says telemetry is off and offers to create `retros/`. It does not create it and stops before BUILD. |
| `05-spec-creator-grounding-pack` | `spec-creator` in author mode returns a "Grounding pack" of `path:line → fact` entries and a "Brief deltas" line. The brief lists two places the greeting is rendered; the fixture has four, and the deltas line must name a missed one. |
| `06-retro-mixed-ledger` | Given a ledger mixing rows without `modelCalls` (written before 1.2.0, tokens about 2–3× too high) with 1.2.0 rows, `retro` never adds the two kinds together and flags the old rows as inflated. It reports peak context per agent and flags the implementer at 452k. |

## Running

Run from the repository root of a checkout. sdd-engineering only loads with its three
dependencies beside it, and a case can load only plugins inside the eval target. So the target is
`plugins/`, and each case lists the four plugins it needs.

**Cases 03–06** (tag `harness`) run under the eval harness:

```bash
claude plugin eval plugins --eval-dir sdd-engineering/evals --tag harness \
  --ablation none --scaffold --allow-tools Bash Write Edit \
  --runs 3 -j 4 --judge-model sonnet --max-cost-usd 30 --no-publish
```

- `--scaffold` runs each case's `scaffold.sh`; without it the cases have no repository.
- `--allow-tools Bash Write Edit` grants the gated tools the cases list. A Bash grant needs the OS
  sandbox: on Linux, `bubblewrap` and `socat`.
- `--ablation none`: the agents and skills under test exist only in the plugin, so a no-plugin
  baseline measures nothing.
- `--judge-model sonnet`: the default judge (haiku) is less reliable on the longer artifacts,
  such as the saved plan.
- While debugging a grader, use `--runs 1 --case <name> --keep-temp`. Results go to
  `evals/results/`, which is git-ignored.

**Cases 01–02** (tag `worktree`) cannot run under the harness. `implementer` declares
`isolation: worktree`, and the harness refuses to create agent worktrees in its runs ("worktree
isolation is unavailable in this session (plugin evaluation harness)", Claude Code 2.1.306).
`run-outside-harness.mjs` runs them from the same case files. It runs `scaffold.sh` in a temporary
directory, sends `prompt.md` to `claude -p` with the case's plugins and tools, and grades the
case's `tool_used` and `llm` graders the way the harness does:

```bash
node plugins/sdd-engineering/evals/run-outside-harness.mjs --runs 3 --judge-model sonnet \
  plugins/sdd-engineering/evals/01-implementer-named-skills \
  plugins/sdd-engineering/evals/02-implementer-track-defaults
```

It does not sandbox the run (Bash runs as you, in the temporary directory). It skips your user
settings and MCP servers, but not your user-level `CLAUDE.md`.

**Cost.** Both paths run on your normal Claude Code login and count against your plan's usage.
Neither uses `--bare`, which would switch to API-key billing. The dollar figures they print are
list-price estimates. `--max-cost-usd` and the runner's `--max-budget-usd` (default 5 per run) cap
those estimates.

## How the graders work

- A Skill call made inside a subagent appears in the trace with its `parent_tool_use_id`, and
  `tool_used` counts it. The skill checks use `min: 1` for "loaded" and `max: 0` for "not loaded",
  so a duplicated trace entry cannot flip them.
- "Only these skills" is a `max: 0` check on any Skill call whose `skill` is outside the allowed
  set (a negative lookahead in `input_match`).
- engineering-paved-path's insights Stop hook adds one turn when git sees files changed during
  the session, and that turn's reply would replace the answer the `last_message` graders read.
  Each scaffold lists the paths its run writes to in `.git/info/exclude` (git ignores them, but
  the agent sees no `.gitignore` rule), and backdates the fixture commit, so the hook stays quiet.

## Fixtures

- `fixtures/greeting-app/` is a two-track app (`apps/web` UI, `apps/api` backend) with no
  dependencies; `npm test` runs `node --test`.
- `fixtures/specs/` holds an approved SPEC-01 and `fixtures/plans/` a two-unit PLAN-01.
- `fixtures/retros/ledger.jsonl` is the mixed ledger: old rows sum to 4,600,000 tokens and new rows
  to 13,000,000.
- `fixtures/lib.sh` holds the helpers the scaffolds share.
