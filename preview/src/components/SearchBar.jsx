import { SearchIcon } from "../icons.jsx";

export default function SearchBar({ q, setQ, mode, setMode }) {
  return (
    <div className="searchbar">
      <div className="search-shell">
        <SearchIcon />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search skills, commands, agents…"
          autoComplete="off"
          aria-label="Search the marketplace"
        />
        <div className="toggle" title="Smart = semantic ranking · Exact = keyword only">
          <span>search</span>
          <div className="seg">
            <button className={mode === "smart" ? "on" : ""} onClick={() => setMode("smart")}>
              Smart
            </button>
            <button className={mode === "exact" ? "on" : ""} onClick={() => setMode("exact")}>
              Exact
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
