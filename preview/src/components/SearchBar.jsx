import { SearchIcon } from "../icons.jsx";
import { t } from "../strings.js";

export default function SearchBar({ q, setQ, mode, setMode }) {
  return (
    <div className="searchbar">
      <div className="search-shell">
        <SearchIcon />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.search.placeholder}
          autoComplete="off"
          aria-label={t.search.ariaLabel}
        />
        <div className="toggle" title={t.search.modeHint}>
          <span>{t.search.label}</span>
          <div className="seg">
            <button className={mode === "smart" ? "on" : ""} onClick={() => setMode("smart")}>
              {t.search.smart}
            </button>
            <button className={mode === "exact" ? "on" : ""} onClick={() => setMode("exact")}>
              {t.search.exact}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
