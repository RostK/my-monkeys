# Changelog

All notable changes to **engineering-paved-path** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this plugin adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-10-21

### Fixed
- **The `engineering-insights` Stop hook no longer blocks a session that changed no code.** It used to
  block the first stop of every session — a question answered, a file read — to ask for insights
  there could not be. It now judges "changed" against the session's own start (the first timestamp
  in its transcript): in a git repo, a modified or untracked file written after that start, or a
  commit on a local branch made since it. So work committed, or committed on a branch the session
  then left, still counts; a pull, a checkout, or work-in-progress older than the session does not.
  The one nudge waits for the first stop that follows a change. Outside a git repo, with no readable
  start time, or if git fails, it nudges once as before. Known limit: it cannot tell sessions apart,
  so another session committing in the same repo meanwhile can still cause a (spare) nudge.
- `README.md` — `sdd-engineering`'s `implementer` now *loads* its skills by name (it preloaded them
  until `sdd-engineering` 1.2.0).

### Added
- Tests for the hook: `skills/engineering-insights/hooks/insights-capture.test.mjs`, run with
  `npm run test:insights-hook` from the repo root.

## [1.0.0] - 2026-07-13

### Added
- Initial release: 13 reusable engineering skills.
  - Architecture: `onion-architecture`, `frontend-ui-architecture`
  - Frameworks: `react-best-practices`, `next-best-practices`, `fastify-best-practices`
  - Language & validation: `typescript-expert`, `zod`
  - Data: `drizzle-orm-patterns`, `postgresql-table-design`
  - Testing: `react-testing-library`
  - Quality & security: `security`, `pr-self-review`
  - Feedback: `engineering-insights` (hook-based capture)
- Migrated and generalized from an internal engineering toolkit; all project-specific paths, packages,
  and names removed so the skills are reusable across any project.
