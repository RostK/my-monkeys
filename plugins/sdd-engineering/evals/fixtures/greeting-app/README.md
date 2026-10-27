# greeting-app

A tiny two-track app used as an eval fixture. There is nothing to install.

## Tracks

- **`apps/web` — UI (`track: ui`).** Framework-free view functions that return HTML
  strings. User-facing strings go through `t()` (`apps/web/src/i18n/index.js`) with keys in
  `apps/web/messages/en.js`; never hardcode them. Colours and spacing come from the design
  tokens in `apps/web/src/styles/tokens.js`; never inline a literal colour. A component lives
  in its own folder under `apps/web/src/components/<Name>/` with its test beside it.
- **`apps/api` — backend (`track: backend`).** Modules follow
  `routes.js → service.js → repository.js`, registered in `apps/api/src/app.js`. Only a
  repository touches the database (`apps/api/src/db/`). Services are pure and take their
  repository as an argument.

## Commands

- `npm test` — every `*.test.js` (Node's built-in test runner).
- `npm run typecheck` — `node --check` over every `.js` file under `apps/`.
