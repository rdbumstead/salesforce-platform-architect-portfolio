/**
 * @description       : Turns a stored profile URL into a safe external href. Contact URL
 *                      fields are typed by hand, and a value with no scheme such as
 *                      "www.linkedin.com/in/name" becomes a path on this site, so the link
 *                      breaks. A bare domain gains https://, http and https URLs stay as they
 *                      are, and any other scheme (javascript:, data:, mailto:) is refused.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/

const HTTP_SCHEME = /^https?:\/\//i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;

/**
 * Returns a safe absolute http or https URL, or null when the value cannot be one.
 * @param {string} value stored URL
 * @returns {string|null} href
 */
export function toExternalUrl(value) {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (!text) {
    return null;
  }
  if (HTTP_SCHEME.test(text)) {
    return text;
  }
  if (text.startsWith("//")) {
    return BARE_DOMAIN.test(text.slice(2)) ? `https:${text}` : null;
  }
  if (ANY_SCHEME.test(text) && !BARE_DOMAIN.test(text)) {
    return null;
  }
  return BARE_DOMAIN.test(text) ? `https://${text}` : null;
}
