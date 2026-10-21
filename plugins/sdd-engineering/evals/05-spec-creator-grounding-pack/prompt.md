Draft a spec for the feature below. Launch one `sdd-engineering:spec-creator` agent with the
Agent tool, in author mode, and pass it the brief verbatim. When it returns, reply with its return
summary unchanged.

---

**Feature brief — time-of-day greeting** (input type: feature request)

Replace the fixed "Hello there" with "Good morning", "Good afternoon" or "Good evening", chosen by
the visitor's local time. The greeting is rendered in two places: the banner
(`apps/web/src/components/GreetingBanner/GreetingBanner.js`) and the footer
(`apps/web/src/components/Footer/Footer.js`).
