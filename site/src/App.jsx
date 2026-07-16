import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { DATA, INSTALL_MODES, installCommand } from "./data.js";
import { computeResults, getEngine } from "./lib/search.js";
import { parseHash, writeHash } from "./lib/urlState.js";
import { t } from "./strings.js";
import Header from "./components/Header.jsx";
import SearchBar from "./components/SearchBar.jsx";
import Filters from "./components/Filters.jsx";
import Card from "./components/Card.jsx";
import Toast from "./components/Toast.jsx";
import InstallToggle from "./components/InstallToggle.jsx";

// The detail modal pulls in react-markdown; load it only when a card is opened.
const DetailModal = lazy(() => import("./components/DetailModal.jsx"));

// getEngine() already fails closed internally (returns null rather than
// throwing — see lib/search.js). This wrapper is defense-in-depth so that
// even a getEngine() that DOES throw can never crash the app: this is a
// search box, not an authz gate (AC-25).
function safeGetEngine() {
  try {
    return getEngine();
  } catch {
    return null;
  }
}

export default function App() {
  const init = useMemo(parseHash, []);
  const [q, setQ] = useState(init.q);
  const [mode, setMode] = useState(init.mode);
  const [sort, setSort] = useState(init.sort);
  const [types, setTypes] = useState(init.types);
  const [plugins, setPlugins] = useState(init.plugins);
  const [tags, setTags] = useState(init.tags);
  const [openId, setOpenId] = useState(() => (DATA.some((a) => a.id === init.open) ? init.open : null));
  const [toastMsg, setToastMsg] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("mm-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [installMode, setInstallMode] = useState(() => {
    try {
      return INSTALL_MODES.includes(localStorage.getItem("mm-install-mode")) ? localStorage.getItem("mm-install-mode") : "cli";
    } catch {
      return "cli";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("mm-install-mode", installMode);
    } catch {
      /* ignore */
    }
  }, [installMode]);

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

  // Warm the memoized search-engine singleton on mount so it's already built
  // by the time the user's first keystroke needs it. Idempotent (getEngine()
  // memoizes internally) and never sets state — it exists purely as a side
  // effect on the module-level singleton.
  useEffect(() => {
    safeGetEngine();
  }, []);

  const state = useMemo(() => ({ q, mode, sort, types, plugins, tags }), [q, mode, sort, types, plugins, tags]);
  const engine = state.q ? safeGetEngine() : null;
  const results = useMemo(() => computeResults(DATA, state, engine), [state, engine]);
  const openArtifact = useMemo(() => DATA.find((a) => a.id === openId) || null, [openId]);

  // Keep the URL in sync with filter state + the open card (shareable / deep links).
  useEffect(() => {
    writeHash(state, openId);
  }, [state, openId]);

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
      setOpenId(DATA.some((a) => a.id === s.open) ? s.open : null);
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

  const copyInstall = useCallback(
    (installName) => {
      const cmd = installCommand(installName, installMode);
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
    },
    [installMode]
  );

  const copyLink = useCallback(() => {
    const url = location.href;
    const done = () => setToastMsg(t.toast.linkCopied);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => (legacyCopy(url), done()));
    else (legacyCopy(url), done());
  }, []);

  // Most recently added / updated artifacts (by git date) for the What's New dropdown.
  const recent = useMemo(() => [...DATA].sort((a, b) => a.days - b.days || a.displayName.localeCompare(b.displayName)).slice(0, 8), []);

  return (
    <>
      <Header theme={theme} onToggleTheme={toggleTheme} recent={recent} onOpenArtifact={setOpenId} />
      <div className="wrap">
        <SearchBar q={q} setQ={setQ} mode={mode} setMode={setMode} />
        <div className="layout">
          <Filters types={types} plugins={plugins} tags={tags} toggle={toggle} reset={reset} />
          <main>
            <div className="results-head">
              <InstallToggle installMode={installMode} setInstallMode={setInstallMode} />
              <div className="results-meta">
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
          <DetailModal
            artifact={openArtifact}
            onClose={() => setOpenId(null)}
            onInstall={copyInstall}
            onCopyLink={copyLink}
            installMode={installMode}
            setInstallMode={setInstallMode}
          />
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
