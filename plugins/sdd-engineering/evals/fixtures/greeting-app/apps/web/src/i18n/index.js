import en from '../../messages/en.js';

/**
 * Looks up a message by key and fills `{name}`-style placeholders.
 * @param {string} key
 * @param {Record<string, string>} [values]
 */
export function t(key, values = {}) {
  const template = en[key];
  if (template === undefined) throw new Error(`missing message: ${key}`);
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
}
