import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MARKETPLACE } from "../data.js";
import { TypeIcon, CopyIcon, CloseIcon, GithubIcon } from "../icons.jsx";
import { t } from "../strings.js";

export default function DetailModal({ artifact: a, onClose, onInstall }) {
  const closeRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const install = "claude plugin install " + a.installName + "@" + MARKETPLACE;

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="mTitle" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div className="grow">
            <span className="badge">
              <TypeIcon type={a.type} />
              {a.type}
            </span>
            <span className="tag-hint" style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <TypeIcon type="plugin" /> {a.plugin}
            </span>
            <h2 id="mTitle" className={a.type === "command" ? "mono" : undefined}>
              {a.displayName}
            </h2>
            <div className="modal-tags">
              {a.tags.map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <button className="icon-btn" aria-label={t.modal.close} ref={closeRef} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-actions">
          <div className="install-box">
            <span style={{ color: "var(--text-mut)" }}>$</span> <code>{install}</code>
          </div>
          <button className="btn btn-primary" style={{ flex: "none", padding: "9px 14px" }} onClick={() => onInstall(a.installName)}>
            <CopyIcon />
            {t.modal.copy}
          </button>
          <a className="btn btn-ghost" style={{ flex: "none", padding: "9px 14px" }} href={a.githubUrl} target="_blank" rel="noopener noreferrer">
            <GithubIcon />
            {t.modal.github}
          </a>
        </div>

        <div className="modal-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
            }}
          >
            {a.body}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
