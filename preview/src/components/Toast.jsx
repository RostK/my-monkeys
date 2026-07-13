import { t } from "../strings.js";

export default function Toast({ message }) {
  return (
    <div className={"toast" + (message ? " show" : "")}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span>{message || t.toast.copied}</span>
    </div>
  );
}
