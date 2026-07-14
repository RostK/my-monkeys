---
name: version-check
description: >-
  Report the version of every installed my-monkeys plugin and compare it against the versions
  pinned in the marketplace manifest, so you can confirm a plugin update actually landed.
allowed-tools: Read, Glob, Bash
---

# /version-check

Show which version of each **my-monkeys** plugin is installed locally, and whether it matches what
the marketplace currently publishes. Use it after `/plugin marketplace update` to confirm the update
reached this machine.

This command ships with **architecture-review v1.1.0** — if you can run it at all, the update landed.

## Steps

1. **Find the installed plugins.** Claude Code keeps marketplace checkouts under
   `~/.claude/plugins/`. Glob for `**/.claude-plugin/plugin.json` there and read the `name` and
   `version` of each manifest that belongs to the `my-monkeys` marketplace.

2. **Find the published versions.** Read `.claude-plugin/marketplace.json` from the same checkout
   and collect the `version` pinned for each entry in its `plugins` array.

3. **Compare.** For every plugin, line up the installed `plugin.json` version against the pinned
   marketplace version.

4. **Report** a short table: plugin, installed version, marketplace version, and a status of
   `up to date` when they match or `stale` when they differ.

5. **If anything is stale**, tell the user to run `/plugin marketplace update` (and, if it is still
   stale afterwards, to reinstall the plugin) — the marketplace pins versions, so a plugin only
   updates once its version is bumped.

## Notes

- Read-only: never edit a manifest, and never bump a version to force a match.
- If no installed checkout is found, say so plainly instead of guessing — it usually means the
  marketplace was added by path rather than installed.
