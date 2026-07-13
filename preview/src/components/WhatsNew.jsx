import { fmtAge } from "../data.js";
import { TypeIcon } from "../icons.jsx";
import { t } from "../strings.js";

// Recently added / updated artifacts, derived from the git last-commit dates in
// the catalog. Shown on the default (unfiltered) view.
export default function WhatsNew({ items, onOpen }) {
  if (!items.length) return null;
  return (
    <section className="whatsnew">
      <div className="wn-head">
        <span className="wn-spark" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z" />
          </svg>
        </span>
        <h2>{t.whatsNew.title}</h2>
        <span className="wn-sub">{t.whatsNew.subtitle}</span>
      </div>
      <div className="wn-list">
        {items.map((a) => (
          <button key={a.id} className="wn-item" onClick={() => onOpen(a.id)}>
            <span className="wn-left">
              <span className="wn-ico">
                <TypeIcon type={a.type} />
              </span>
              <span className="wn-name">{a.displayName}</span>
              <span className="wn-plugin">{a.plugin}</span>
            </span>
            <span className="wn-right">
              {a.days <= 14 && <span className="wn-badge">{t.whatsNew.badge}</span>}
              <span className="wn-date">updated {fmtAge(a.days)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
