import { t } from '../../i18n/index.js';
import { tokens } from '../../styles/tokens.js';

/** The greeting at the top of every page. */
export function GreetingBanner() {
  return `<section class="greeting-banner" style="color: var(${tokens.textPrimary}); padding: var(${tokens.spaceMd})">${t('greeting.hello')}</section>`;
}
