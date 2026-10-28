/**
 * @description       : Turns a stored profile URL into a safe external href. Contact URL
 *                      fields are typed by hand, and a value with no scheme such as
 *                      "www.linkedin.com/in/name" becomes a path on this site, so the link
 *                      breaks. A bare domain gains https://, http and https URLs stay as they
 *                      are, and any other scheme (javascript:, data:, mailto:) is refused.
 *                      toSiteAssetUrl resolves a stored image URL the way the project gallery
 *                      does: http and https as they are, and
 *                      resource:<Name>/<path> as the site's static resource path.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/22/2026
 **/

const HTTP_SCHEME = /^https?:\/\//i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;
const RESOURCE_PREFIX = "resource:";
const RESOURCE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

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

/**
 * Turns a stored image or asset URL into one the browser can load. The same rules as
 * c/projectAssetGallery resolveAssetUrl, copied here so the home page does not import the
 * gallery.
 * @param {string} value stored URL, http(s) or resource:<Name>/<path>
 * @param {string} sitePath the site's base path, for example "/portfolio"
 * @returns {string|null} the URL, or null when it is blank or not an accepted form
 */
export function toSiteAssetUrl(value, sitePath) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return null;
  }
  if (HTTP_SCHEME.test(text)) {
    return text;
  }
  if (!text.toLowerCase().startsWith(RESOURCE_PREFIX)) {
    return null;
  }
  const parts = text.slice(RESOURCE_PREFIX.length).split("/");
  const name = parts.shift();
  if (
    !RESOURCE_NAME.test(name || "") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    return null;
  }
  const path = [name, ...parts.map((part) => encodeURIComponent(part))];
  return `${sitePath || ""}/sfsites/c/resource/${path.join("/")}`;
}
