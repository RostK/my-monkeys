Plan the implementation of the approved spec
`specs/greetings/SPEC-01-2026-10-20-personalised-greeting.md`.

Launch one `sdd-engineering:implementation-planner` agent with the Agent tool. In its prompt,
give it the spec path, ask it to reuse the spec's AC ids verbatim, and tell it the execution mode
is already decided: multi-agent, so it need not ask.

The planner is read-only, so when it returns, save its plan verbatim to
`plans/PLAN-01-personalised-greeting.md`. Then reply with one line per task unit: its id, title,
track, and skills to apply.
