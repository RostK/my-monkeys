import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { DATA, MARKETPLACE } from "./data.js";
import { computeResults } from "./lib/search.js";
import { t } from "./strings.js";
import Header from "./components/Header.jsx";
import SearchBar from "./components/SearchBar.jsx";
import Filters from "./components/Filters.jsx";
import Card from "./components/Card.jsx";
import Toast from "./components/Toast.jsx";

// The detail modal pulls in react-markdown; load it only when a card is opened.
const DetailModal = lazy(() => import("./components/DetailModal.jsx"));

const SORTS = ["relevance", "newest", "az"];

function toSet(csv) {
  return new Set(csv ? csv.split(",").filter(Boolean) : []);
}

function parseHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ""));
  return {
    q: p.get("q") || "",
    mode: p.get("mode") === "exact" ? "exact" : "smart",
    sort: SORTS.includes(p.get("sort")) ? p.get("sort") : "relevance",
    types: toSet(p.get("type")),
    plugins: toSet(p.get("plugin")),
    tags: toSet(p.get("tag")),
  };
}

function writeHash(s) {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.mode !== "smart") p.set("mode", s.mode);
  if (s.sort !== "relevance") p.set("sort", s.sort);
  if (s.types.size) p.set("type", [...s.types].join(","));
  if (s.plugins.size) p.set("plugin", [...s.plugins].join(","));
  if (s.tags.size) p.set("tag", [...s.tags].join(","));
  const str = p.toString();
  history.replaceState(null, "", str ? "#" + str : location.pathname + location.search);
}

export default function App() {
  const init = useMemo(parseHash, []);
  const [q, setQ] = useState(init.q);
  const [mode, setMode] = useState(init.mode);
  const [sort, setSort] = useState(init.sort);
  const [types, setTypes] = useState(init.types);
  const [plugins, setPlugins] = useState(init.plugins);
  const [tags, setTags] = useState(init.tags);
  const [openId, setOpenId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("mm-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  // Apply + persist the theme (dark is the default).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("mm-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  const state = useMemo(() => ({ q, mode, sort, types, plugins, tags }), [q, mode, sort, types, plugins, tags]);
  const results = useMemo(() => computeResults(DATA, state), [state]);
  const openArtifact = useMemo(() => DATA.find((a) => a.id === openId) || null, [openId]);

  // Keep the URL in sync with filter state (shareable links).
  useEffect(() => {
    writeHash(state);
  }, [state]);

  // React to manual URL edits / back-forward navigation.
  useEffect(() => {
    const onHash = () => {
      const s = parseHash();
      setQ(s.q);
      setMode(s.mode);
      setSort(s.sort);
      setTypes(s.types);
      setPlugins(s.plugins);
      setTags(s.tags);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 1900);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const setters = { types: setTypes, plugins: setPlugins, tags: setTags };
  const toggle = useCallback((bucket, key) => {
    setters[bucket]((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setQ("");
    setMode("smart");
    setSort("relevance");
    setTypes(new Set());
    setPlugins(new Set());
    setTags(new Set());
  }, []);

  const copyInstall = useCallback((plugin) => {
    const cmd = "claude plugin install " + plugin + "@" + MARKETPLACE;
    const done = () => setToastMsg(t.toast.copiedPrefix + " " + cmd);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(cmd).then(done, () => {
        legacyCopy(cmd);
        done();
      });
    } else {
      legacyCopy(cmd);
      done();
    }
  }, []);

  return (
    <>
      <Header theme={theme} onToggleTheme={toggleTheme} />
      <div className="wrap">
        <SearchBar q={q} setQ={setQ} mode={mode} setMode={setMode} />
        <div className="layout">
          <Filters types={types} plugins={plugins} tags={tags} toggle={toggle} reset={reset} />
          <main>
            <div className="results-head">
              <div className="results-count">
                <b>{results.length}</b> {results.length === 1 ? t.results.one : t.results.many}
              </div>
              <div className="sort">
                <label htmlFor="sort">{t.results.sort}</label>
                <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="relevance">{t.results.sortRelevance}</option>
                  <option value="newest">{t.results.sortNewest}</option>
                  <option value="az">{t.results.sortAz}</option>
                </select>
              </div>
            </div>

            {results.length === 0 ? (
              <div className="grid">
                <div className="empty">
                  <h3>{t.results.emptyTitle}</h3>
                  <p>{t.results.emptyHint}</p>
                </div>
              </div>
            ) : (
              <div className="grid">
                {results.map((a) => (
                  <Card key={a.id} artifact={a} onOpen={setOpenId} onInstall={copyInstall} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {openArtifact && (
        <Suspense fallback={null}>
          <DetailModal artifact={openArtifact} onClose={() => setOpenId(null)} onInstall={copyInstall} />
        </Suspense>
      )}
      <Toast message={toastMsg} />
    </>
  );
}

function legacyCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* ignore */
  }
  document.body.removeChild(ta);
}
