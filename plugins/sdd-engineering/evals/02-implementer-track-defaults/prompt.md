You are running the BUILD step of `sdd-engineering:run-plan` for a one-unit plan in this
repository. Launch exactly one `sdd-engineering:implementer` agent with the Agent tool and pass
it the unit brief below, verbatim, as its prompt. Do not edit files, run commands or load skills
yourself: the implementer does the work. When it returns, reply with its return summary
unchanged.

---

## [T1] Greet the visitor by name in the banner  ·  track: ui

- **Files**:
  - `apps/web/src/components/GreetingBanner/GreetingBanner.js` — modify: take `{ name }` and
    greet the visitor by name; keep the current greeting when the name is missing or blank.
  - `apps/web/src/components/GreetingBanner/GreetingBanner.test.js` — modify: cover the named
    greeting and the fallback.
  - `apps/web/messages/en.js` — modify: add `greeting.helloName` ("Hello, {name}").
- **Known pitfalls**: "User-facing strings go through `t()` … never hardcode them." — `README.md:8`
- **Definition of done**: `npm test` green (the new tests fail before the change);
  `npm run typecheck` clean.
- **Depends on**: none
- **Acceptance criteria**: AC-1 — When a visitor with a display name views a page, the greeting
  banner shall greet them by that name. Verify: unit — `GreetingBanner.test.js`.
- **Learnings excerpt**: none recorded for these files.
- **Collisions**: none; no sibling units.
