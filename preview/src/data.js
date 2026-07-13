/* my-monkeys marketplace — mock catalog for the design preview.
 * This is placeholder content; the real catalog will be generated from the
 * repository (plugins/** + marketplace.json) at build time in a later milestone.
 */

export const OWNER = "RostK";
export const REPO = "my-monkeys";
export const MARKETPLACE = "my-monkeys";
const GH_BASE = "https://github.com/" + OWNER + "/" + REPO + "/blob/main/";

export const PLUGINS = {
  "git-tools": { name: "Git Tools", desc: "Everything for a clean Git workflow: commits, merges and pull-request prep.", tags: ["git", "commits", "pr"] },
  "refactor-kit": { name: "Refactor Kit", desc: "A toolkit for safe, incremental refactors across a codebase.", tags: ["refactoring", "cleanup", "quality"] },
  "test-suite": { name: "Test Suite", desc: "Generate, run and stabilise tests with coverage insight.", tags: ["coverage", "ci", "quality"] },
  "docs-gen": { name: "Docs Gen", desc: "Turn code into readable docs — READMEs, docstrings and guides.", tags: ["docs", "api"] },
  "review-bot": { name: "Review Bot", desc: "Automated, thoughtful code review on every pull request.", tags: ["pr", "quality", "ci"] },
  "db-toolkit": { name: "DB Toolkit", desc: "Plan, apply and guard database migrations with confidence.", tags: ["database", "migrations"] },
};

// [type, name, displayName, plugin, description, tags, daysAgo]
const RAW = [
  ["plugin", "git-tools", "Git Tools", "git-tools", PLUGINS["git-tools"].desc, ["git", "commits", "pr"], 1],
  ["skill", "smart-commit", "Smart Commit", "git-tools", "Generate conventional commit messages from your staged changes.", ["git", "commits"], 2],
  ["skill", "resolve-conflicts", "Resolve Conflicts", "git-tools", "Guided three-way merge conflict resolution with safe defaults.", ["git", "merge"], 7],
  ["skill", "pr-summary", "PR Summary", "git-tools", "Summarize a branch diff into a ready-to-paste pull request description.", ["git", "pr"], 5],
  ["agent", "pr-reviewer", "PR Reviewer", "git-tools", "Reviews open pull requests and leaves inline, actionable comments.", ["git", "pr", "quality"], 1],

  ["plugin", "refactor-kit", "Refactor Kit", "refactor-kit", PLUGINS["refactor-kit"].desc, ["refactoring", "cleanup", "quality"], 3],
  ["skill", "refactor", "Refactor", "refactor-kit", "Restructure code without changing its behavior, one safe step at a time.", ["refactoring", "cleanup", "performance"], 3],
  ["skill", "extract-function", "Extract Function", "refactor-kit", "Pull a selection into a well-named function and update every call site.", ["refactoring", "cleanup"], 14],
  ["command", "rename-symbol", "/rename-symbol", "refactor-kit", "Safe project-wide rename of a symbol across files and references.", ["refactoring", "cleanup"], 21],

  ["plugin", "test-suite", "Test Suite", "test-suite", PLUGINS["test-suite"].desc, ["coverage", "ci", "quality"], 4],
  ["skill", "coverage-report", "Coverage Report", "test-suite", "Summarize test coverage and point out the riskiest untested paths.", ["coverage", "quality"], 6],
  ["command", "test-gen", "/test-gen", "test-suite", "Scaffold unit tests for the selected function or module.", ["ci", "coverage"], 9],
  ["agent", "flaky-hunter", "Flaky Test Hunter", "test-suite", "Finds and quarantines flaky tests by replaying CI history.", ["ci", "coverage", "performance"], 11],

  ["plugin", "docs-gen", "Docs Gen", "docs-gen", PLUGINS["docs-gen"].desc, ["docs", "api"], 8],
  ["skill", "docstring", "Docstring Writer", "docs-gen", "Write accurate docstrings from a function's signature and body.", ["docs", "api"], 12],
  ["command", "gen-readme", "/gen-readme", "docs-gen", "Draft a README from the repository structure and manifest.", ["docs"], 16],
  ["agent", "docs-reviewer", "Docs Reviewer", "docs-gen", "Checks docs for drift against the current public API.", ["docs", "api", "quality"], 19],

  ["plugin", "review-bot", "Review Bot", "review-bot", PLUGINS["review-bot"].desc, ["pr", "quality", "ci"], 10],
  ["command", "review", "/review", "review-bot", "Run a full review pass over the current diff and report findings.", ["pr", "quality"], 4],
  ["command", "nitpick", "/nitpick", "review-bot", "Surface style and consistency nits without blocking the merge.", ["pr", "cleanup"], 13],
  ["agent", "reviewer", "Reviewer", "review-bot", "A standing agent that reviews each pushed branch and comments.", ["pr", "quality", "ci"], 6],

  ["plugin", "db-toolkit", "DB Toolkit", "db-toolkit", PLUGINS["db-toolkit"].desc, ["database", "migrations"], 20],
  ["skill", "migration-plan", "Migration Plan", "db-toolkit", "Turn a schema change into an ordered, reversible migration plan.", ["database", "migrations"], 15],
  ["command", "migrate", "/migrate", "db-toolkit", "Apply pending migrations with a dry-run preview and a rollback point.", ["database", "migrations", "release"], 22],
  ["agent", "schema-guardian", "Schema Guardian", "db-toolkit", "Watches migrations for unsafe or destructive schema changes.", ["database", "migrations", "quality"], 17],
];

function pathFor(type, name, plugin) {
  if (type === "plugin") return "plugins/" + plugin + "/.claude-plugin/plugin.json";
  if (type === "skill") return "plugins/" + plugin + "/skills/" + name + "/SKILL.md";
  if (type === "command") return "plugins/" + plugin + "/commands/" + name.replace(/^\//, "") + ".md";
  return "plugins/" + plugin + "/agents/" + name + ".md";
}

function buildBody(a) {
  const install = "claude plugin install " + a.plugin + "@" + MARKETPLACE;
  let out = "# " + a.displayName + "\n\n" + a.description + "\n\n";
  if (a.type === "plugin") {
    out += "## Contents\n\nThis plugin bundles related skills, commands and agents. Install it once to get everything below.\n\n";
    out += "## Install\n\n```bash\n" + install + "\n```\n\n";
    out += "## Tags\n\n" + a.tags.map((t) => "`" + t + "`").join(" ") + "\n";
    return out;
  }
  out += "## When to use\n\n";
  out += "- You are working on **" + a.tags[0] + "** and want a repeatable, reviewed workflow.\n";
  out += "- You'd rather describe the outcome than remember the exact steps.\n\n";
  out += "## How it works\n\n";
  if (a.type === "command") {
    out += "Invoke it directly in Claude Code:\n\n```\n" + a.displayName + " <target>\n```\n\n";
  } else if (a.type === "agent") {
    out += "Runs as a background agent — it observes the relevant events and reports back with findings you can act on.\n\n";
  } else {
    out += "Claude loads this skill when your request matches it, then follows the steps it defines.\n\n";
  }
  out += "## Install\n\nComes with the **" + PLUGINS[a.plugin].name + "** plugin:\n\n```bash\n" + install + "\n```\n";
  return out;
}

export const DATA = RAW.map((r) => {
  const a = { type: r[0], name: r[1], displayName: r[2], plugin: r[3], description: r[4], tags: r[5], days: r[6] };
  a.id = a.plugin + "/" + a.type + "/" + a.name;
  a.path = pathFor(a.type, a.name, a.plugin);
  a.githubUrl = GH_BASE + a.path;
  a.installName = a.plugin;
  a.body = buildBody(a);
  a.haystack = (a.displayName + " " + a.name + " " + a.description + " " + a.tags.join(" ") + " " + a.plugin).toLowerCase();
  return a;
});

export const TYPES = ["skill", "command", "agent", "plugin"];

function countBy(fn) {
  const m = {};
  DATA.forEach((a) => {
    const k = fn(a);
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}
export const TYPE_COUNTS = countBy((a) => a.type);
export const PLUGIN_COUNTS = countBy((a) => a.plugin);
export const ALL_TAGS = (() => {
  const s = {};
  DATA.forEach((a) => a.tags.forEach((t) => (s[t] = 1)));
  return Object.keys(s).sort();
})();

export function fmtAge(d) {
  if (d <= 0) return "today";
  if (d < 7) return d + "d ago";
  if (d < 30) return Math.round(d / 7) + "w ago";
  return Math.round(d / 30) + "mo ago";
}
