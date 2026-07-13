/* my-monkeys marketplace — design preview
 * Self-contained, no dependencies. All data below is mock content
 * for the UI preview; the real catalog is generated from the repo at build time.
 */
(function () {
  "use strict";

  var OWNER = "RostK";
  var REPO = "my-monkeys";
  var MARKETPLACE = "my-monkeys";
  var GH_BASE = "https://github.com/" + OWNER + "/" + REPO + "/blob/main/";

  /* ---------- Type icons (inline SVG) ---------- */
  var ICONS = {
    skill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z"/></svg>',
    command: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M13 15h4"/></svg>',
    agent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M8 4h8"/><circle cx="9" cy="14" r="1.2"/><circle cx="15" cy="14" r="1.2"/></svg>',
    plugin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4a2 2 0 1 1 4 0v2h3a1 1 0 0 1 1 1v3h2a2 2 0 1 1 0 4h-2v3a1 1 0 0 1-1 1h-3v-2a2 2 0 1 0-4 0v2H7a1 1 0 0 1-1-1v-3H4a2 2 0 1 1 0-4h2V7a1 1 0 0 1 1-1h3V4z"/></svg>'
  };
  var COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  var ARROW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var GH_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.48v-1.7c-2.78.62-3.37-1.2-3.37-1.2-.45-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.05 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.9-1.33 2.74-1.05 2.74-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.92-2.34 4.79-4.57 5.04.36.32.68.94.68 1.9v2.82c0 .27.18.59.69.48A10.02 10.02 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"/></svg>';

  /* ---------- Plugins ---------- */
  var PLUGINS = {
    "git-tools":   { name: "Git Tools",   desc: "Everything for a clean Git workflow: commits, merges and pull-request prep.", tags: ["git", "commits", "pr"] },
    "refactor-kit":{ name: "Refactor Kit",desc: "A toolkit for safe, incremental refactors across a codebase.",             tags: ["refactoring", "cleanup", "quality"] },
    "test-suite":  { name: "Test Suite",  desc: "Generate, run and stabilise tests with coverage insight.",                  tags: ["coverage", "ci", "quality"] },
    "docs-gen":    { name: "Docs Gen",    desc: "Turn code into readable docs — READMEs, docstrings and guides.",           tags: ["docs", "api"] },
    "review-bot":  { name: "Review Bot",  desc: "Automated, thoughtful code review on every pull request.",                 tags: ["pr", "quality", "ci"] },
    "db-toolkit":  { name: "DB Toolkit",  desc: "Plan, apply and guard database migrations with confidence.",              tags: ["database", "migrations"] }
  };

  /* ---------- Artifacts (25 mock entries) ---------- */
  var RAW = [
    // git-tools
    ["plugin",  "git-tools",     "Git Tools",         "git-tools",   PLUGINS["git-tools"].desc,   ["git","commits","pr"],             1],
    ["skill",   "smart-commit",  "Smart Commit",      "git-tools",   "Generate conventional commit messages from your staged changes.", ["git","commits"], 2],
    ["skill",   "resolve-conflicts","Resolve Conflicts","git-tools", "Guided three-way merge conflict resolution with safe defaults.",  ["git","merge"], 7],
    ["skill",   "pr-summary",    "PR Summary",        "git-tools",   "Summarize a branch diff into a ready-to-paste pull request description.", ["git","pr"], 5],
    ["agent",   "pr-reviewer",   "PR Reviewer",       "git-tools",   "Reviews open pull requests and leaves inline, actionable comments.", ["git","pr","quality"], 1],
    // refactor-kit
    ["plugin",  "refactor-kit",  "Refactor Kit",      "refactor-kit",PLUGINS["refactor-kit"].desc,["refactoring","cleanup","quality"], 3],
    ["skill",   "refactor",      "Refactor",          "refactor-kit","Restructure code without changing its behavior, one safe step at a time.", ["refactoring","cleanup","performance"], 3],
    ["skill",   "extract-function","Extract Function","refactor-kit","Pull a selection into a well-named function and update every call site.", ["refactoring","cleanup"], 14],
    ["command", "rename-symbol", "/rename-symbol",    "refactor-kit","Safe project-wide rename of a symbol across files and references.", ["refactoring","cleanup"], 21],
    // test-suite
    ["plugin",  "test-suite",    "Test Suite",        "test-suite",  PLUGINS["test-suite"].desc,  ["coverage","ci","quality"], 4],
    ["skill",   "coverage-report","Coverage Report",  "test-suite",  "Summarize test coverage and point out the riskiest untested paths.", ["coverage","quality"], 6],
    ["command", "test-gen",      "/test-gen",         "test-suite",  "Scaffold unit tests for the selected function or module.", ["ci","coverage"], 9],
    ["agent",   "flaky-hunter",  "Flaky Test Hunter", "test-suite",  "Finds and quarantines flaky tests by replaying CI history.", ["ci","coverage","performance"], 11],
    // docs-gen
    ["plugin",  "docs-gen",      "Docs Gen",          "docs-gen",    PLUGINS["docs-gen"].desc,    ["docs","api"], 8],
    ["skill",   "docstring",     "Docstring Writer",  "docs-gen",    "Write accurate docstrings from a function's signature and body.", ["docs","api"], 12],
    ["command", "gen-readme",    "/gen-readme",       "docs-gen",    "Draft a README from the repository structure and manifest.", ["docs"], 16],
    ["agent",   "docs-reviewer", "Docs Reviewer",     "docs-gen",    "Checks docs for drift against the current public API.", ["docs","api","quality"], 19],
    // review-bot
    ["plugin",  "review-bot",    "Review Bot",        "review-bot",  PLUGINS["review-bot"].desc,  ["pr","quality","ci"], 10],
    ["command", "review",        "/review",           "review-bot",  "Run a full review pass over the current diff and report findings.", ["pr","quality"], 4],
    ["command", "nitpick",       "/nitpick",          "review-bot",  "Surface style and consistency nits without blocking the merge.", ["pr","cleanup"], 13],
    ["agent",   "reviewer",      "Reviewer",          "review-bot",  "A standing agent that reviews each pushed branch and comments.", ["pr","quality","ci"], 6],
    // db-toolkit
    ["plugin",  "db-toolkit",    "DB Toolkit",        "db-toolkit",  PLUGINS["db-toolkit"].desc,  ["database","migrations"], 20],
    ["skill",   "migration-plan","Migration Plan",    "db-toolkit",  "Turn a schema change into an ordered, reversible migration plan.", ["database","migrations"], 15],
    ["command", "migrate",       "/migrate",          "db-toolkit",  "Apply pending migrations with a dry-run preview and a rollback point.", ["database","migrations","release"], 22],
    ["agent",   "schema-guardian","Schema Guardian",  "db-toolkit",  "Watches migrations for unsafe or destructive schema changes.", ["database","migrations","quality"], 17]
  ];

  function pathFor(type, name, plugin) {
    if (type === "plugin") return "plugins/" + plugin + "/.claude-plugin/plugin.json";
    if (type === "skill")  return "plugins/" + plugin + "/skills/" + name + "/SKILL.md";
    if (type === "command")return "plugins/" + plugin + "/commands/" + name.replace(/^\//, "") + ".md";
    return "plugins/" + plugin + "/agents/" + name + ".md";
  }

  function buildBody(a) {
    var title = a.displayName;
    var lead = a.description;
    var install = "claude plugin install " + a.plugin + "@" + MARKETPLACE;
    var out = "# " + title + "\n\n" + lead + "\n\n";
    if (a.type === "plugin") {
      out += "## Contents\n\nThis plugin bundles related skills, commands and agents. Install it once to get everything below.\n\n";
      out += "## Install\n\n```bash\n" + install + "\n```\n\n";
      out += "## Tags\n\n" + a.tags.map(function (t) { return "`" + t + "`"; }).join(" ") + "\n";
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

  var DATA = RAW.map(function (r) {
    var a = {
      type: r[0], name: r[1], displayName: r[2], plugin: r[3],
      description: r[4], tags: r[5], days: r[6]
    };
    a.id = a.plugin + "/" + a.type + "/" + a.name;
    a.path = pathFor(a.type, a.name, a.plugin);
    a.githubUrl = GH_BASE + a.path;
    a.installName = a.plugin;
    a.body = buildBody(a);
    a.haystack = (a.displayName + " " + a.name + " " + a.description + " " + a.tags.join(" ") + " " + a.plugin).toLowerCase();
    return a;
  });

  var TYPES = ["skill", "command", "agent", "plugin"];
  var TYPE_LABEL = { skill: "skill", command: "command", agent: "agent", plugin: "plugin" };

  /* ---------- Helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtAge(d) {
    if (d <= 0) return "today";
    if (d < 7) return d + "d ago";
    if (d < 30) return Math.round(d / 7) + "w ago";
    return Math.round(d / 30) + "mo ago";
  }
  function countBy(fn) {
    var m = {};
    DATA.forEach(function (a) { var k = fn(a); m[k] = (m[k] || 0) + 1; });
    return m;
  }
  var TYPE_COUNTS = countBy(function (a) { return a.type; });
  var PLUGIN_COUNTS = countBy(function (a) { return a.plugin; });
  var ALL_TAGS = (function () {
    var s = {};
    DATA.forEach(function (a) { a.tags.forEach(function (t) { s[t] = 1; }); });
    return Object.keys(s).sort();
  })();

  /* ---------- Minimal markdown renderer ---------- */
  function renderMd(md) {
    var lines = md.split("\n");
    var html = "";
    var i = 0, inList = false;
    function closeList() { if (inList) { html += "</ul>"; inList = false; } }
    function inline(t) {
      t = esc(t);
      t = t.replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; });
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      return t;
    }
    while (i < lines.length) {
      var line = lines[i];
      var fence = line.match(/^```(\w*)/);
      if (fence) {
        closeList();
        var buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // closing fence
        html += "<pre><code>" + esc(buf.join("\n")) + "</code></pre>";
        continue;
      }
      var h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) { closeList(); html += "<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"; i++; continue; }
      if (/^\s*-\s+/.test(line)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + inline(line.replace(/^\s*-\s+/, "")) + "</li>";
        i++; continue;
      }
      if (line.trim() === "") { closeList(); i++; continue; }
      closeList();
      html += "<p>" + inline(line) + "</p>";
      i++;
    }
    closeList();
    return html;
  }

  /* ---------- State ---------- */
  var state = {
    q: "", mode: "smart", sort: "relevance",
    types: {}, plugins: {}, tags: {}
  };

  function readHash() {
    var p = new URLSearchParams(location.hash.replace(/^#/, ""));
    state.q = p.get("q") || "";
    state.mode = p.get("mode") === "exact" ? "exact" : "smart";
    state.sort = ["relevance", "newest", "az"].indexOf(p.get("sort")) >= 0 ? p.get("sort") : "relevance";
    state.types = toSet(p.get("type"));
    state.plugins = toSet(p.get("plugin"));
    state.tags = toSet(p.get("tag"));
  }
  function toSet(csv) {
    var o = {};
    if (csv) csv.split(",").forEach(function (x) { if (x) o[x] = 1; });
    return o;
  }
  function keys(o) { return Object.keys(o).filter(function (k) { return o[k]; }); }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.mode !== "smart") p.set("mode", state.mode);
    if (state.sort !== "relevance") p.set("sort", state.sort);
    if (keys(state.types).length) p.set("type", keys(state.types).join(","));
    if (keys(state.plugins).length) p.set("plugin", keys(state.plugins).join(","));
    if (keys(state.tags).length) p.set("tag", keys(state.tags).join(","));
    var s = p.toString();
    history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
  }

  /* ---------- Search + filter ---------- */
  function score(a, tokens) {
    if (!tokens.length) return 0;
    var s = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (a.displayName.toLowerCase().indexOf(t) >= 0) s += 6;
      if (a.tags.join(" ").indexOf(t) >= 0) s += 4;
      if (a.description.toLowerCase().indexOf(t) >= 0) s += 3;
      if (state.mode === "smart" && a.body.toLowerCase().indexOf(t) >= 0) s += 1;
      if (a.plugin.indexOf(t) >= 0) s += 2;
    }
    return s;
  }
  function matchesQuery(a, tokens) {
    if (!tokens.length) return true;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var hit;
      if (state.mode === "exact") {
        hit = a.displayName.toLowerCase().indexOf(t) >= 0 ||
              a.name.toLowerCase().indexOf(t) >= 0 ||
              a.tags.join(" ").indexOf(t) >= 0;
      } else {
        hit = a.haystack.indexOf(t) >= 0 || a.body.toLowerCase().indexOf(t) >= 0;
      }
      if (!hit) return false; // all tokens must match (AND)
    }
    return true;
  }

  function compute() {
    var tokens = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    var selTypes = keys(state.types), selPlugins = keys(state.plugins), selTags = keys(state.tags);
    var list = DATA.filter(function (a) {
      if (selTypes.length && selTypes.indexOf(a.type) < 0) return false;
      if (selPlugins.length && selPlugins.indexOf(a.plugin) < 0) return false;
      if (selTags.length && !a.tags.some(function (t) { return selTags.indexOf(t) >= 0; })) return false;
      return matchesQuery(a, tokens);
    });
    list.forEach(function (a) { a._score = score(a, tokens); });
    var sort = state.sort;
    if (sort === "relevance" && !tokens.length) sort = "newest";
    list.sort(function (x, y) {
      if (sort === "az") return x.displayName.localeCompare(y.displayName);
      if (sort === "newest") return x.days - y.days;
      if (y._score !== x._score) return y._score - x._score;
      return x.days - y.days;
    });
    return list;
  }

  /* ---------- Rendering ---------- */
  var el = {
    grid: document.getElementById("grid"),
    count: document.getElementById("count"),
    stats: document.getElementById("stats"),
    typeFacet: document.getElementById("typeFacet"),
    pluginFacet: document.getElementById("pluginFacet"),
    tagFacet: document.getElementById("tagFacet"),
    q: document.getElementById("q"),
    sort: document.getElementById("sort"),
    modeSeg: document.getElementById("modeSeg"),
    reset: document.getElementById("reset"),
    modalBack: document.getElementById("modalBack"),
    modal: document.getElementById("modal"),
    toast: document.getElementById("toast"),
    toastMsg: document.getElementById("toastMsg")
  };

  function renderStats() {
    el.stats.innerHTML =
      "<span><b>" + DATA.length + "</b> artifacts</span>" +
      "<span class='dot'>·</span>" +
      "<span><b>" + Object.keys(PLUGINS).length + "</b> plugins</span>";
  }

  function renderFacets() {
    el.typeFacet.innerHTML = TYPES.map(function (t) {
      var on = state.types[t] ? " on" : "";
      return "<div class='check" + on + "' data-type='" + t + "' role='checkbox' tabindex='0' aria-checked='" + !!state.types[t] + "'>" +
        "<span class='box'>" + checkMark() + "</span>" +
        "<span class='lbl'><span class='type-ico'>" + ICONS[t] + "</span>" + TYPE_LABEL[t] + "</span>" +
        "<span class='cnt'>" + (TYPE_COUNTS[t] || 0) + "</span></div>";
    }).join("");

    el.pluginFacet.innerHTML = Object.keys(PLUGINS).map(function (p) {
      var on = state.plugins[p] ? " on" : "";
      return "<div class='check radio" + on + "' data-plugin='" + p + "' role='checkbox' tabindex='0' aria-checked='" + !!state.plugins[p] + "'>" +
        "<span class='box'>" + dot() + "</span>" +
        "<span class='lbl'>" + esc(p) + "</span>" +
        "<span class='cnt'>" + (PLUGIN_COUNTS[p] || 0) + "</span></div>";
    }).join("");

    el.tagFacet.innerHTML = ALL_TAGS.map(function (t) {
      var on = state.tags[t] ? " on" : "";
      return "<button class='chip" + on + "' data-tag='" + esc(t) + "'>" + esc(t) + "</button>";
    }).join("");
  }
  function checkMark() { return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'; }
  function dot() { return '<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>'; }

  function card(a) {
    var isCmd = a.type === "command";
    return "<article class='card' data-id='" + esc(a.id) + "'>" +
      "<div class='card-top'>" +
        "<span class='badge'>" + ICONS[a.type] + TYPE_LABEL[a.type] + "</span>" +
        "<span class='tag-hint'>#" + esc(a.tags[0]) + "</span>" +
      "</div>" +
      "<h3" + (isCmd ? " class='cmd-name'" : "") + ">" + esc(a.displayName) + "</h3>" +
      "<p>" + esc(a.description) + "</p>" +
      "<div class='card-meta'>" +
        "<span class='mplug'>" + ICONS.plugin + esc(a.plugin) + "</span>" +
        "<span>·</span><span>updated " + fmtAge(a.days) + "</span>" +
      "</div>" +
      "<div class='card-actions'>" +
        "<button class='btn btn-primary' data-install='" + esc(a.installName) + "'>" + COPY_ICON + "Install</button>" +
        "<button class='btn btn-ghost' data-details='" + esc(a.id) + "'>Details" + ARROW_ICON + "</button>" +
      "</div>" +
    "</article>";
  }

  function render() {
    var list = compute();
    el.count.innerHTML = "<b>" + list.length + "</b> " + (list.length === 1 ? "result" : "results");
    if (!list.length) {
      el.grid.innerHTML = "<div class='empty'><h3>No matches</h3><p>Try a different search, or reset the filters.</p></div>";
    } else {
      el.grid.innerHTML = list.map(card).join("");
    }
    // reflect controls
    el.q.value = state.q;
    el.sort.value = state.sort;
    [].forEach.call(el.modeSeg.querySelectorAll("button"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-mode") === state.mode);
    });
    writeHash();
  }

  /* ---------- Modal ---------- */
  var lastFocus = null;
  function openModal(id) {
    var a = DATA.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    lastFocus = document.activeElement;
    var install = "claude plugin install " + a.installName + "@" + MARKETPLACE;
    el.modal.innerHTML =
      "<div class='modal-head'>" +
        "<div class='grow'>" +
          "<span class='badge'>" + ICONS[a.type] + TYPE_LABEL[a.type] + "</span> " +
          "<span class='tag-hint' style='margin-left:8px'>" + ICONS.plugin + " " + esc(a.plugin) + "</span>" +
          "<h2 id='mTitle'" + (a.type === "command" ? " class='mono'" : "") + ">" + esc(a.displayName) + "</h2>" +
          "<div class='modal-tags'>" + a.tags.map(function (t) { return "<span class='chip'>" + esc(t) + "</span>"; }).join("") + "</div>" +
        "</div>" +
        "<button class='icon-btn' id='mClose' aria-label='Close'>" +
          "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round'><path d='M6 6l12 12M18 6L6 18'/></svg>" +
        "</button>" +
      "</div>" +
      "<div class='modal-actions'>" +
        "<div class='install-box'><span style='color:var(--text-mut)'>$</span> <code>" + esc(install) + "</code></div>" +
        "<button class='btn btn-primary' style='flex:none;padding:9px 14px' data-install='" + esc(a.installName) + "'>" + COPY_ICON + "Copy</button>" +
        "<a class='btn btn-ghost' style='flex:none;padding:9px 14px' href='" + esc(a.githubUrl) + "' target='_blank' rel='noopener'>" + GH_ICON + "GitHub</a>" +
      "</div>" +
      "<div class='modal-body'>" + renderMd(a.body) + "</div>";
    el.modalBack.classList.add("open");
    document.body.style.overflow = "hidden";
    var closeBtn = document.getElementById("mClose");
    if (closeBtn) closeBtn.focus();
  }
  function closeModal() {
    el.modalBack.classList.remove("open");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- Clipboard + toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    el.toastMsg.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove("show"); }, 1900);
  }
  function copyInstall(plugin) {
    var cmd = "claude plugin install " + plugin + "@" + MARKETPLACE;
    var done = function () { toast("Copied: " + cmd); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(done, function () { legacyCopy(cmd); done(); });
    } else { legacyCopy(cmd); done(); }
  }
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---------- Events ---------- */
  var qTimer = null;
  el.q.addEventListener("input", function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { state.q = el.q.value; render(); }, 120);
  });
  el.sort.addEventListener("change", function () { state.sort = el.sort.value; render(); });
  el.modeSeg.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-mode]");
    if (!b) return;
    state.mode = b.getAttribute("data-mode"); render();
  });
  el.reset.addEventListener("click", function () {
    state.q = ""; state.types = {}; state.plugins = {}; state.tags = {};
    state.sort = "relevance"; render();
  });

  el.typeFacet.addEventListener("click", function (e) { toggleFacet(e, "type", "types"); });
  el.pluginFacet.addEventListener("click", function (e) { toggleFacet(e, "plugin", "plugins"); });
  function toggleFacet(e, attr, bucket) {
    var row = e.target.closest("[data-" + attr + "]");
    if (!row) return;
    var k = row.getAttribute("data-" + attr);
    if (state[bucket][k]) delete state[bucket][k]; else state[bucket][k] = 1;
    renderFacets(); render();
  }
  el.tagFacet.addEventListener("click", function (e) {
    var b = e.target.closest("[data-tag]");
    if (!b) return;
    var k = b.getAttribute("data-tag");
    if (state.tags[k]) delete state.tags[k]; else state.tags[k] = 1;
    renderFacets(); render();
  });
  // keyboard toggle on facet rows
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && el.modalBack.classList.contains("open")) { closeModal(); return; }
    if ((e.key === " " || e.key === "Enter") && document.activeElement) {
      var row = document.activeElement.closest && document.activeElement.closest("[data-type],[data-plugin]");
      if (row && (el.typeFacet.contains(row) || el.pluginFacet.contains(row))) {
        e.preventDefault(); row.click();
      }
    }
  });

  el.grid.addEventListener("click", function (e) {
    var inst = e.target.closest("[data-install]");
    if (inst) { e.stopPropagation(); copyInstall(inst.getAttribute("data-install")); return; }
    var det = e.target.closest("[data-details]");
    if (det) { openModal(det.getAttribute("data-details")); return; }
    var c = e.target.closest(".card");
    if (c) openModal(c.getAttribute("data-id"));
  });
  el.modalBack.addEventListener("click", function (e) {
    if (e.target === el.modalBack) { closeModal(); return; }
    var inst = e.target.closest("[data-install]");
    if (inst) { copyInstall(inst.getAttribute("data-install")); return; }
    if (e.target.closest("#mClose")) closeModal();
  });

  window.addEventListener("hashchange", function () {
    readHash(); renderFacets(); render();
  });

  /* ---------- Init ---------- */
  readHash();
  renderStats();
  renderFacets();
  render();
})();
