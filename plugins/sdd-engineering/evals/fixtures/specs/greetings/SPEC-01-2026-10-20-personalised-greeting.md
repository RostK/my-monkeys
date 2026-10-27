# SPEC-01 — Personalised greeting

- **Status:** approved
- **Module:** greetings (`apps/web` banner, `apps/api` greetings module)
- **Date:** 2026-10-20

## Problem

Every page greets every visitor with the same "Hello there". Users have a display name
(`users.displayName`, `apps/api/src/db/schema.js`), but it is stored as typed — sometimes padded
or with doubled spaces, sometimes very long — and the UI never shows it.

## Goals / Non-goals

- **Goal:** greet a visitor by their display name in the greeting banner, with the name tidied up.
- **Non-goal:** the footer and the weekly digest e-mail keep their current greeting.
- **Non-goal:** no schema change; `display_name` already exists.
- **Non-goal:** how the page obtains the name is out of scope; the banner receives it.

## Acceptance criteria

- **AC-1** — When the greeting banner is rendered with a display name, it shall greet the visitor
  as "Hello, {name}"; when the name is missing or blank, it shall keep "Hello there".
  Verify: unit — `GreetingBanner.test.js`.
- **AC-2** — When `GET /greetings/:userId` is called for a known user, the API shall return
  `{ text, displayName }`, where `displayName` is the normalised display name, or `null` when
  the user has none. Verify: unit — `service.test.js`.
- **AC-3** — The greetings service shall normalise a display name by trimming it and collapsing
  every run of internal whitespace to a single space. Verify: unit — `service.test.js`.
- **AC-4** — If a normalised display name is longer than 40 characters, the greetings service
  shall truncate it to its first 39 characters followed by "…". Verify: unit — `service.test.js`.

## Non-functional

- **i18n:** the new banner text uses `t()` with a new key `greeting.helloName`; no hardcoded strings.
- **Privacy:** display names are never logged.
- **Tenancy:** n/a (single-tenant app).
