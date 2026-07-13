import { TYPES, TYPE_COUNTS, PLUGINS, PLUGIN_COUNTS, ALL_TAGS } from "../data.js";
import { TypeIcon, CheckIcon, DotIcon } from "../icons.jsx";

function Row({ on, onToggle, radio, box, label, count }) {
  return (
    <div
      className={"check" + (radio ? " radio" : "") + (on ? " on" : "")}
      role="checkbox"
      tabIndex={0}
      aria-checked={on}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span className="box">{box}</span>
      <span className="lbl">{label}</span>
      <span className="cnt">{count}</span>
    </div>
  );
}

export default function Filters({ types, plugins, tags, toggle, reset }) {
  return (
    <aside>
      <div className="facet">
        <p className="facet-title">Type</p>
        {TYPES.map((t) => (
          <Row
            key={t}
            on={types.has(t)}
            onToggle={() => toggle("types", t)}
            box={<CheckIcon />}
            count={TYPE_COUNTS[t] || 0}
            label={
              <>
                <span className="type-ico">
                  <TypeIcon type={t} />
                </span>
                {t}
              </>
            }
          />
        ))}
      </div>

      <div className="facet">
        <p className="facet-title">Plugin</p>
        {Object.keys(PLUGINS).map((p) => (
          <Row
            key={p}
            radio
            on={plugins.has(p)}
            onToggle={() => toggle("plugins", p)}
            box={<DotIcon />}
            count={PLUGIN_COUNTS[p] || 0}
            label={p}
          />
        ))}
      </div>

      <div className="facet">
        <p className="facet-title">Tags</p>
        <div className="chips">
          {ALL_TAGS.map((t) => (
            <button key={t} className={"chip" + (tags.has(t) ? " on" : "")} onClick={() => toggle("tags", t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <button className="reset" onClick={reset}>
        Reset filters
      </button>
    </aside>
  );
}
