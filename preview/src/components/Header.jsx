import { DATA, PLUGINS, OWNER, REPO } from "../data.js";
import { GithubIcon, SunIcon, MoonIcon } from "../icons.jsx";
import { t } from "../strings.js";
import WhatsNew from "./WhatsNew.jsx";

export default function Header({ theme, onToggleTheme, recent, onOpenArtifact }) {
  const pluginCount = Object.keys(PLUGINS).length;
  const themeLabel = theme === "dark" ? t.header.switchToLight : t.header.switchToDark;
  return (
    <header className="top">
      <div className="wrap top-inner">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 64 64">
              {/* nudged down 3 units so the antenna doesn't leave the mark top-heavy */}
              <g transform="translate(0,3)">
                <line x1="32" y1="16" x2="32" y2="8.5" stroke="#eceafe" strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="32" cy="7" r="2.7" fill="#eceafe" />
                <circle cx="14.5" cy="27" r="8.5" fill="#eceafe" />
                <circle cx="49.5" cy="27" r="8.5" fill="#eceafe" />
                <circle cx="14.5" cy="27" r="4" fill="#b3a8ff" />
                <circle cx="49.5" cy="27" r="4" fill="#b3a8ff" />
                <circle cx="32" cy="33" r="16.5" fill="#eceafe" />
                <ellipse cx="32" cy="41.5" rx="10" ry="7.5" fill="#ffffff" />
                <rect x="21" y="27.5" width="9" height="10" rx="3.4" fill="#2a2350" />
                <rect x="34" y="27.5" width="9" height="10" rx="3.4" fill="#2a2350" />
                <circle cx="25.5" cy="31" r="1.6" fill="#6ff0c0" />
                <circle cx="38.5" cy="31" r="1.6" fill="#6ff0c0" />
                <circle cx="29" cy="42" r="1.3" fill="#2a2350" />
                <circle cx="35" cy="42" r="1.3" fill="#2a2350" />
              </g>
            </svg>
          </div>
          <span className="brand-name">{t.brand.name}</span>
          <span className="brand-sub">{t.brand.tag}</span>
        </div>
        <div className="top-spacer" />
        <WhatsNew items={recent} onOpen={onOpenArtifact} />
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
