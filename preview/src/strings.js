/* Single source of all UI copy.
 *
 * Keep every user-facing string here — do NOT hardcode text in components.
 * English-only by convention (see MEMORY / SPEC §1). Centralising it here makes
 * the copy easy to review in one place and lets this become a full i18n catalog
 * later without touching any component.
 *
 * Note: artifact content (names, descriptions, bodies) is DATA, not UI copy —
 * that lives in data.js (and will come from the repo index at build time).
 */
export const t = {
  brand: {
    name: "my-monkeys",
    tag: "marketplace",
  },
  header: {
    artifacts: "artifacts",
    plugins: "plugins",
    github: "GitHub",
    switchToLight: "Switch to light theme",
    switchToDark: "Switch to dark theme",
  },
  search: {
    placeholder: "Search skills, commands, agents…",
    ariaLabel: "Search the marketplace",
    modeHint: "Smart = semantic ranking · Exact = keyword only",
    label: "search",
    smart: "Smart",
    exact: "Exact",
  },
  filters: {
    type: "Type",
    plugin: "Plugin",
    tags: "Tags",
    reset: "Reset filters",
  },
  card: {
    updatedPrefix: "updated",
    install: "Install",
    details: "Details",
  },
  results: {
    one: "result",
    many: "results",
    emptyTitle: "No matches",
    emptyHint: "Try a different search, or reset the filters.",
    sort: "Sort",
    sortRelevance: "Relevance",
    sortNewest: "Newest",
    sortAz: "A–Z",
  },
  whatsNew: {
    title: "What's new",
    subtitle: "Recently added & updated",
    badge: "New",
  },
  modal: {
    copy: "Copy",
    github: "GitHub",
    close: "Close",
    copyLink: "Copy link",
  },
  install: {
    label: "install",
    cli: "CLI",
    code: "Claude Code",
    hint: "CLI = run in a terminal · Claude Code = slash command inside a session",
  },
  toast: {
    copiedPrefix: "Copied:",
    copied: "Copied",
    linkCopied: "Link copied",
  },
};
