import { t } from "../strings.js";

// Segmented switch choosing how install commands are rendered/copied everywhere:
// a shell command (`claude plugin install …`) vs the in-session `/plugin install …`
// slash command. Shared by the header (global, always visible) and the detail modal
// so both controls stay in sync via the single `installMode` state in App.
export default function InstallToggle({ installMode, setInstallMode, className = "" }) {
  return (
    <div className={"toggle install-toggle " + className} title={t.install.hint}>
      <span>{t.install.label}</span>
      <div className="seg">
        <button className={installMode === "cli" ? "on" : ""} onClick={() => setInstallMode("cli")}>
          {t.install.cli}
        </button>
        <button className={installMode === "code" ? "on" : ""} onClick={() => setInstallMode("code")}>
          {t.install.code}
        </button>
      </div>
    </div>
  );
}
