import { DATA, PLUGINS, OWNER, REPO } from "../data.js";
import { GithubIcon, SunIcon, MoonIcon } from "../icons.jsx";
import { t } from "../strings.js";

export default function Header({ theme, onToggleTheme }) {
  const pluginCount = Object.keys(PLUGINS).length;
  const themeLabel = theme === "dark" ? t.header.switchToLight : t.header.switchToDark;
  return (
    <header className="top">
      <div className="wrap top-inner">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7l8-4 8 4-8 4-8-4z" />
              <path d="M4 12l8 4 8-4" />
              <path d="M4 17l8 4 8-4" />
            </svg>
          </div>
          <span className="brand-name">{t.brand.name}</span>
          <span className="brand-sub">{t.brand.tag}</span>
        </div>
        <div className="top-spacer" />
        <div className="stats">
          <span>
            <b>{DATA.length}</b> {t.header.artifacts}
          </span>
          <span className="dot">·</span>
          <span>
            <b>{pluginCount}</b> {t.header.plugins}
          </span>
        </div>
        <button className="theme-toggle" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <a className="gh-link" href={`https://github.com/${OWNER}/${REPO}`} target="_blank" rel="noopener noreferrer">
          <GithubIcon />
          {t.header.github}
        </a>
      </div>
    </header>
  );
}
