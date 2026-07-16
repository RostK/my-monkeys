import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtAge } from "../data.js";
import { TypeIcon, CloseIcon } from "../icons.jsx";
import { t } from "../strings.js";

const Sparkle = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z" />
  </svg>
);

// FYI: a header button that opens a modal (same style as the detail modal)
// listing recently added / updated artifacts, from the git dates in the catalog.
export default function WhatsNew({ items, onOpen }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);
  const hasFresh = items.some((a) => a.days <= 14);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!items.length) return null;
  const pick = (id) => {
    setOpen(false);
    onOpen(id);
  };

  return (
    <>
      <button className="wn-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Sparkle />
        <span className="wn-btn-label">{t.whatsNew.title}</span>
        {hasFresh && <span className="wn-dot" aria-hidden="true" />}
      </button>

      {open && createPortal(
        <div
          className="modal-back"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wnTitle"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="modal wn-modal">
            <div className="modal-head">
              <div className="grow">
                <div className="wn-modal-title">
                  <Sparkle />
                  <h2 id="wnTitle">{t.whatsNew.title}</h2>
                </div>
                <div className="wn-modal-sub">{t.whatsNew.subtitle}</div>
              </div>
              <button className="icon-btn" ref={closeRef} aria-label={t.modal.close} onClick={() => setOpen(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="wn-modal-body">
              <div className="wn-list">
                {items.map((a) => (
                  <button key={a.id} className="wn-item" onClick={() => pick(a.id)}>
                    <span className="wn-left">
                      <span className="wn-ico">
                        <TypeIcon type={a.type} />
                      </span>
                      <span className="wn-name">{a.displayName}</span>
                      <span className="wn-plugin">{a.plugin}</span>
                    </span>
                    <span className="wn-right">
                      {a.version && <span className="wn-ver">v{a.version}</span>}
                      {a.days <= 14 && <span className="wn-badge">{t.whatsNew.badge}</span>}
                      <span className="wn-date">updated {fmtAge(a.days)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
