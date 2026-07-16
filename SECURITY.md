# Security Policy

## Trust model — installing a plugin runs code

This repository is a Claude Code **plugin marketplace**. `.claude-plugin/marketplace.json` catalogs
four plugins under `plugins/`: `engineering-paved-path`, `research-tools`, `architecture-review`, and
`sdd-engineering`.

Installing any of these plugins is **not** installing inert documentation. A plugin's skills, agents,
commands, and hooks execute inside the installing user's Claude Code session, with that user's
permissions — reading and writing files, running shell commands, and calling out to whatever the
skill/agent/hook code does. Treat every plugin here as executable software, and review it before
installing it, the same way you would review any other third-party code that runs on your machine.

This is not hypothetical. As one concrete example, `sdd-engineering` ships a real `SubagentStop`/`Stop`
hook (`plugins/sdd-engineering/hooks/hooks.json`, running
`plugins/sdd-engineering/scripts/capture-telemetry.mjs`). That hook fires automatically on those two
Claude Code events, and its script reads the session's transcript files and writes telemetry records to
a ledger file on disk under the project's `retros/` directory — all without any per-invocation
confirmation prompt. That is the kind of ambient, automatic execution every plugin in this marketplace
is capable of: this is one instance of it, not a special case.

## Supported versions

Plugins in this marketplace are versioned independently, each via its own `plugin.json`. Only the
**latest published version of each plugin** receives security fixes — there are no backported fixes to
earlier versions of any plugin. If a vulnerability is found, upgrade to the latest version of the
affected plugin to get the fix; older versions will not be patched.

(As context only: `engineering-paved-path` is a declared dependency of both `architecture-review` and
`sdd-engineering`. That dependency relationship does not change the policy above — each plugin,
including `engineering-paved-path` itself, is still only supported at its own latest version.)

## Reporting a vulnerability

Report suspected vulnerabilities using **GitHub Private Vulnerability Reporting** on this repository's
"Security" tab ("Report a vulnerability"). This is the **sole** intake channel for security reports —
please do not open a public issue or discussion for a suspected vulnerability, and please do not report
it by any other channel.

When reporting, please include:

- Which plugin (and version) is affected.
- The skill, agent, command, or hook involved.
- Steps to reproduce, or the code path you believe is exploitable.
- The potential impact as you see it.

### Triage expectations

This marketplace is maintained by a solo maintainer. Reports are triaged **best-effort** — we aim to
respond and investigate as promptly as we reasonably can, but we do not make any acknowledgement,
response-time, or resolution-time commitment, numeric or otherwise. There is no service-level
agreement attached to this process.
