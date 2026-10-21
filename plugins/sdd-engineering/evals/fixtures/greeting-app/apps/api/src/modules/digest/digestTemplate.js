/** The weekly digest e-mail body. */
export function digestTemplate({ items }) {
  return `<p>Hello there</p><ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}
