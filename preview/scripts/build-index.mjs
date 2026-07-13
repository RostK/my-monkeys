#!/usr/bin/env node
/**
 * build-index.mjs — generate the marketplace catalog from the real repository.
 *
 * Walks .claude-plugin/marketplace.json + plugins/** , parses plugin.json and
 * the YAML frontmatter of SKILL.md / commands/*.md / agents/*.md, reads each
 * file's last git-commit date, and writes preview/src/catalog.json — which the
 * UI imports at build time. Re-run it whenever plugins change (it runs
 * automatically via the predev/prebuild npm scripts and in CI).
 *
 * Usage:  node scripts/build-index.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import matter from "gray-matter";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(REPO_ROOT, "preview", "src", "catalog.json");
const OWNER = "RostK";
const REPO = "my-monkeys";
const BRANCH = "main";

const rel = (abs) => abs.slice(REPO_ROOT.length + 1).replace(/\\/g, "/");
const read = (p) => readFileSync(p, "utf8");
const readJson = (p) => JSON.parse(read(p));
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Proper casing for known acronyms / product names when deriving a display name
// from a kebab-case slug (frontmatter displayName, when present, always wins).
const CASING = {
  orm: "ORM", ui: "UI", ux: "UX", pr: "PR", api: "API", cli: "CLI", db: "DB",
  sdd: "SDD", css: "CSS", html: "HTML", sql: "SQL", jwt: "JWT", cors: "CORS",
  id: "ID", url: "URL", postgresql: "PostgreSQL", typescript: "TypeScript",
  javascript: "JavaScript", nextjs: "Next.js", graphql: "GraphQL", zod: "Zod",
};
const titleCase = (s) =>
  String(s)
    .replace(/^\//, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => CASING[w.toLowerCase()] || w[0].toUpperCase() + w.slice(1))
    .join(" ");

function gitDate(absPath) {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${rel(absPath)}"`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (iso) return iso;
  } catch {
    /* fall through */
  }
  return new Date(statSync(absPath).mtime).toISOString();
}

function dirs(p) {
  if (!existsSync(p)) return [];
  return readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}
function mdFiles(p) {
  if (!existsSync(p)) return [];
  return readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => d.name);
}

const STOPWORDS = new Set(["best", "practices", "practice", "pattern", "patterns", "the", "and", "for", "with", "a", "an", "of", "to", "in", "on"]);

/**
 * Tags for a skill/agent/command: its own frontmatter tags if present,
 * otherwise meaningful tokens derived from its name (more specific than the
 * plugin's shared keywords), falling back to the plugin keywords.
 */
function tagsFor(fm, name, pluginKeywords) {
  const own = fm.tags || fm.keywords;
  if (Array.isArray(own) && own.length) return own.map(String);
  if (typeof own === "string" && own.trim()) return own.split(/[,\s]+/).filter(Boolean);
  const fromName = String(name)
    .replace(/^\//, "")
    .split(/[-_\s]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  const tags = [...new Set(fromName)].slice(0, 4);
  return tags.length ? tags : pluginKeywords.slice(0, 4);
}

const artifacts = [];
const pluginsOut = [];

const marketplace = readJson(join(REPO_ROOT, ".claude-plugin", "marketplace.json"));

for (const entry of marketplace.plugins || []) {
  const pluginDir = resolve(REPO_ROOT, entry.source);
  const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : {};
  const pluginName = manifest.name || entry.name;
  const keywords = Array.isArray(manifest.keywords) ? manifest.keywords.map(String) : [];
  const pluginDisplay = manifest.displayName || titleCase(pluginName);
  const pluginDesc = oneLine(manifest.description || entry.description);

  pluginsOut.push({ name: pluginName, displayName: pluginDisplay, description: pluginDesc, tags: keywords });

  // The plugin itself as a browsable artifact. Body = its README when present.
  const readmePath = join(pluginDir, "README.md");
  const pluginBody = existsSync(readmePath) ? matter(read(readmePath)).content.trim() : pluginDesc;
  artifacts.push({
    id: `${pluginName}/plugin/${pluginName}`,
    type: "plugin",
    name: pluginName,
    displayName: pluginDisplay,
    plugin: pluginName,
    description: pluginDesc,
    tags: keywords,
    path: rel(existsSync(manifestPath) ? manifestPath : pluginDir),
    githubUrl: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/${rel(existsSync(manifestPath) ? manifestPath : pluginDir)}`,
    installName: pluginName,
    updatedAt: gitDate(existsSync(manifestPath) ? manifestPath : pluginDir),
    body: pluginBody,
  });

  // Skills: plugins/<p>/skills/<name>/SKILL.md
  for (const skill of dirs(join(pluginDir, "skills"))) {
    const file = join(pluginDir, "skills", skill, "SKILL.md");
    if (!existsSync(file)) continue;
    const { data: fm, content } = matter(read(file));
    const name = fm.name || skill;
    artifacts.push({
      id: `${pluginName}/skill/${name}`,
      type: "skill",
      name,
      displayName: fm.displayName || titleCase(name),
      plugin: pluginName,
      description: oneLine(fm.description),
      tags: tagsFor(fm, name, keywords),
      path: rel(file),
      githubUrl: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/${rel(file)}`,
      installName: pluginName,
      updatedAt: gitDate(file),
      body: content.trim(),
    });
  }

  // Agents: plugins/<p>/agents/<name>.md
  for (const f of mdFiles(join(pluginDir, "agents"))) {
    const file = join(pluginDir, "agents", f);
    const { data: fm, content } = matter(read(file));
    const name = fm.name || basename(f, ".md");
    artifacts.push({
      id: `${pluginName}/agent/${name}`,
      type: "agent",
      name,
      displayName: fm.displayName || titleCase(name),
      plugin: pluginName,
      description: oneLine(fm.description),
      tags: tagsFor(fm, name, keywords),
      path: rel(file),
      githubUrl: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/${rel(file)}`,
      installName: pluginName,
      updatedAt: gitDate(file),
      body: content.trim(),
    });
  }

  // Commands: plugins/<p>/commands/<name>.md
  for (const f of mdFiles(join(pluginDir, "commands"))) {
    const file = join(pluginDir, "commands", f);
    const { data: fm, content } = matter(read(file));
    const name = fm.name || basename(f, ".md");
    artifacts.push({
      id: `${pluginName}/command/${name}`,
      type: "command",
      name: name.startsWith("/") ? name : "/" + name,
      displayName: name.startsWith("/") ? name : "/" + name,
      plugin: pluginName,
      description: oneLine(fm.description || content.split("\n").find((l) => l.trim())),
      tags: tagsFor(fm, name, keywords),
      path: rel(file),
      githubUrl: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/${rel(file)}`,
      installName: pluginName,
      updatedAt: gitDate(file),
      body: content.trim(),
    });
  }
}

const stats = { plugins: 0, skills: 0, agents: 0, commands: 0 };
const plural = { plugin: "plugins", skill: "skills", agent: "agents", command: "commands" };
for (const a of artifacts) stats[plural[a.type]]++;

const catalog = {
  generatedAt: new Date().toISOString(),
  marketplace: marketplace.name || REPO,
  owner: OWNER,
  repo: REPO,
  branch: BRANCH,
  stats,
  plugins: pluginsOut,
  artifacts,
};

writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");
console.log(
  `[build-index] ${artifacts.length} artifacts ` +
    `(${stats.plugins} plugins, ${stats.skills} skills, ${stats.agents} agents, ${stats.commands} commands) → ${rel(OUT)}`
);
