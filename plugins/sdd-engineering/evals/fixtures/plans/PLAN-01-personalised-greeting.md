# Implementation Plan — Personalised greeting (SPEC-01)

## Execution mode
multi-agent — confirmed by the user.

## Requirements review
- **Understood requirements**: greet the visitor by a normalised display name in the banner
  (AC-1); return `{ text, displayName }` from `GET /greetings/:userId` (AC-2).
- **Assumptions**: none. **Open questions**: none. **Research needed**: none.

## Acceptance criteria
- **AC-1** — When the greeting banner is rendered with a display name, it shall greet the visitor
  as "Hello, {name}"; otherwise it keeps "Hello there".
  - Verify: unit — `GreetingBanner.test.js`
- **AC-2** — When `GET /greetings/:userId` is called for a known user, the API shall return
  `{ text, displayName }`.
  - Verify: unit — `service.test.js`

## Scope
- Modules touched: `apps/web/src/components/GreetingBanner/`, `apps/web/messages/`,
  `apps/api/src/modules/greetings/`
- Modules deliberately NOT touched: `apps/web/src/components/Footer/`, `apps/api/src/modules/digest/`
- Contracts changed: none

## Task units

### [T1] Greet the visitor by name in the banner  ·  track: ui  ·  parallel-group: A
- **Files**:
  - `apps/web/src/components/GreetingBanner/GreetingBanner.js` — modify: take `{ name }`
  - `apps/web/src/components/GreetingBanner/GreetingBanner.test.js` — modify: cover both greetings
  - `apps/web/messages/en.js` — modify: add `greeting.helloName`
- **Skills to apply**: `engineering-paved-path:typescript-expert`, `engineering-paved-path:frontend-ui-architecture`
- **Known pitfalls**: "User-facing strings go through `t()`" — `README.md:8`
- **Definition of done**: `npm test` green, `npm run typecheck` clean
- **Depends on**: none

### [T2] Return the display name from the greetings API  ·  track: backend  ·  parallel-group: A
- **Files**:
  - `apps/api/src/modules/greetings/service.js` — modify: include `displayName`
  - `apps/api/src/modules/greetings/service.test.js` — modify: cover `displayName`
- **Skills to apply**: `engineering-paved-path:onion-architecture`, `engineering-paved-path:typescript-expert`
- **Known pitfalls**: "Services are pure and take their repository as an argument." — `README.md:14`
- **Definition of done**: `npm test` green, `npm run typecheck` clean
- **Depends on**: none

## Parallelization graph
T1 and T2 have disjoint files: one wave, two workers.

## Test plan
- `npm test` and `npm run typecheck` from the repo root.

## Risks & review gates
- None beyond the standard review gates.
