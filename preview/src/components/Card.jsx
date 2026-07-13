import { fmtAge } from "../data.js";
import { TypeIcon, CopyIcon, ArrowIcon } from "../icons.jsx";

export default function Card({ artifact: a, onOpen, onInstall }) {
  const isCmd = a.type === "command";
  return (
    <article className="card" onClick={() => onOpen(a.id)}>
      <div className="card-top">
        <span className="badge">
          <TypeIcon type={a.type} />
          {a.type}
        </span>
        <span className="tag-hint">#{a.tags[0]}</span>
      </div>
      <h3 className={isCmd ? "cmd-name" : undefined}>{a.displayName}</h3>
      <p>{a.description}</p>
      <div className="card-meta">
        <span className="mplug">
          <TypeIcon type="plugin" />
          {a.plugin}
        </span>
        <span>·</span>
        <span>updated {fmtAge(a.days)}</span>
      </div>
      <div className="card-actions">
        <button
          className="btn btn-primary"
          onClick={(e) => {
            e.stopPropagation();
            onInstall(a.installName);
          }}
        >
          <CopyIcon />
          Install
        </button>
        <button
          className="btn btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(a.id);
          }}
        >
          Details
          <ArrowIcon />
        </button>
      </div>
    </article>
  );
}
