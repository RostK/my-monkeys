#!/usr/bin/env node
/**
 * Zero-dependency dev server for the static marketplace preview.
 *
 *   node scripts/dev-server.mjs [--port 5173] [--root preview]
 *
 * Serves ./preview with automatic live-reload: edit index.html / app.js and
 * the browser refreshes itself. No build step, no npm install. This is a
 * development-only tool and is never published to GitHub Pages.
 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { join, extname, normalize, resolve, sep } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = Number(process.env.PORT || arg("port", "5173"));
const ROOT = resolve(process.cwd(), arg("root", "preview"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

// Snippet injected into HTML so the page reloads on any file change.
const LIVE_RELOAD = `
<script>
(function () {
  var es = new EventSource("/__livereload");
  es.onmessage = function () { location.reload(); };
  es.onerror = function () { es.close(); setTimeout(function () { location.reload(); }, 1000); };
})();
</script>`;

/** @type {Set<import('node:http').ServerResponse>} */
const clients = new Set();

function safePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0]));
  const full = join(ROOT, clean);
  // Prevent path traversal outside ROOT.
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  // Live-reload event stream (Server-Sent Events).
  if (req.url === "/__livereload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 1000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  let target = safePath(req.url === "/" ? "/index.html" : req.url);
  if (!target) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    let s = await stat(target).catch(() => null);
    if (s && s.isDirectory()) target = join(target, "index.html");
    let body = await readFile(target);
    const type = MIME[extname(target).toLowerCase()] || "application/octet-stream";
    if (type.startsWith("text/html")) {
      body = Buffer.from(body.toString("utf8").replace(/<\/body>/i, LIVE_RELOAD + "</body>"));
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>404</h1><p>" + req.url + " not found in /" + arg("root", "preview") + "</p>" + LIVE_RELOAD);
  }
});

// Watch the served folder and notify all connected browsers on change.
let debounce = null;
try {
  watch(ROOT, { recursive: true }, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      for (const res of clients) res.write("data: reload\n\n");
    }, 80);
  });
} catch {
  console.warn("[dev] recursive watch unavailable on this platform; live-reload disabled");
}

server.listen(PORT, () => {
  console.log(`\n  my-monkeys preview  →  http://localhost:${PORT}/`);
  console.log(`  serving: ${ROOT}`);
  console.log(`  live-reload: on  ·  press Ctrl+C to stop\n`);
});
