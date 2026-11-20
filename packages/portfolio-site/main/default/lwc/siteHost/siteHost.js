/**
 * @description       : Which host serves the page. On the Salesforce site every section is
 *                      read from the org when the page loads, so builtAt is null. The static
 *                      build swaps this module for one whose builtAt returns the time its data
 *                      was read, so a section can say which of the two it shows. The wording
 *                      helpers below are shared by both hosts.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 **/

/** True on the static site, false on the Salesforce site. */
export const IS_STATIC = false;

/**
 * The time the page's data was read from Salesforce, as an ISO string, or null when the
 * data is read as the page loads.
 * @returns {string|null}
 */
export function builtAt() {
  return null;
}

/**
 * The origin of the Salesforce site, the host that serves the token endpoint and the API. On
 * the Salesforce site that is the page's own origin. The static build swaps this module for
 * one that returns the Salesforce site's origin, because its own host serves no API.
 * @returns {string}
 */
export function siteOrigin() {
  return typeof window !== "undefined" && window.location
    ? window.location.origin
    : "";
}

function readDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * One format for every build stamp on the site: "Nov 18, 2026, 8:33 PM EST". The zone
 * is always written out, never a bare date. Pass "UTC" for the fixed form, or leave the zone out
 * for the visitor's own.
 * @param {Date} date the moment
 * @param {string} [timeZone] an IANA zone, or nothing for the visitor's zone
 * @returns {string} the stamp, or "" where Intl cannot make one
 */
function stamp(date, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      ...(timeZone ? { timeZone } : {})
    })
      .format(date)
      .replace(/[\u202f\u00a0]/g, " ");
  } catch {
    return "";
  }
}

/**
 * A build time in UTC with "UTC" written out, such as "Nov 18, 2026, 1:33 AM UTC".
 * @param {string} value ISO 8601 date time
 * @returns {string} the label, or "" for a missing or unreadable value
 */
export function utcLabel(value) {
  const date = readDate(value);
  return date ? stamp(date, "UTC") : "";
}

/**
 * A build time in the visitor's own zone with the zone shown, such as
 * "Nov 17, 2026, 8:33 PM EST".
 * @param {string} value ISO 8601 date time
 * @returns {string} the label, or "" where the browser cannot make one
 */
export function localLabel(value) {
  const date = readDate(value);
  return date ? stamp(date) : "";
}

/**
 * The live data marker's words for a section read when the site was built. The marker shows the
 * visitor's own zone, and the UTC form wherever a local one cannot be made.
 * @param {string} value the build time, ISO 8601
 * @returns {{markerLabel: string, panelHeading: string, explanation: string}}
 */
export function buildWording(value) {
  const utc = utcLabel(value);
  const local = localLabel(value) || utc;
  const when = utc && local !== utc ? `${local} (${utc})` : local;
  return {
    markerLabel: `From Salesforce · built ${local}`,
    markerShort: "",
    panelHeading: "Salesforce data",
    explanation: `This section was read from my Salesforce records when the site was built, on ${when}. Each build reads them through an allowlisted API, after every change and every 6 hours.`
  };
}
