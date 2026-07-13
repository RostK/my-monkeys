import { DATA, PLUGINS, OWNER, REPO } from "../data.js";
import { GithubIcon } from "../icons.jsx";

export default function Header() {
  const pluginCount = Object.keys(PLUGINS).length;
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
          <span className="brand-name">my-monkeys</span>
          <span className="brand-sub">marketplace</span>
        </div>
        <div className="top-spacer" />
        <div className="stats">
          <span>
            <b>{DATA.length}</b> artifacts
          </span>
          <span className="dot">·</span>
          <span>
            <b>{pluginCount}</b> plugins
          </span>
        </div>
        <a className="gh-link" href={`https://github.com/${OWNER}/${REPO}`} target="_blank" rel="noopener noreferrer">
          <GithubIcon />
          GitHub
        </a>
      </div>
    </header>
  );
}
