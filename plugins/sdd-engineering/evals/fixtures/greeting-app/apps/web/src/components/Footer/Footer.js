import { t } from '../../i18n/index.js';
import { tokens } from '../../styles/tokens.js';

/** The page footer: the greeting again, then a sign-off. */
export function Footer() {
  return `<footer style="background: var(${tokens.surfaceRaised})">${t('greeting.hello')} · ${t('footer.signoff')}</footer>`;
}
