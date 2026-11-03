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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

function readDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * A build time in UTC, such as "3 Nov 2026, 14:00 UTC".
 * @param {string} value ISO 8601 date time
 * @returns {string} the label, or "" for a missing or unreadable value
 */
export function utcLabel(value) {
  const date = readDate(value);
  if (!date) {
    return "";
  }
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${hours}:${minutes} UTC`;
}

/**
 * A build time in the visitor's own zone, such as "3 Nov 2026, 9:00 am EST".
 * @param {string} value ISO 8601 date time
 * @returns {string} the label, or "" where the browser cannot make one
 */
export function localLabel(value) {
  const date = readDate(value);
  if (!date) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short"
    }).format(date);
  } catch {
    return "";
  }
}

/**
 * The live data marker's words for a section read when the site was built.
 * @param {string} value the build time, ISO 8601
 * @returns {{markerLabel: string, panelHeading: string, explanation: string}}
 */
export function buildWording(value) {
  const utc = utcLabel(value);
  const local = localLabel(value);
  const when = local ? `${utc} (${local} your time)` : utc;
  return {
    markerLabel: `From Salesforce · built ${utc}`,
    panelHeading: "Salesforce data",
    explanation: `This section was read from my Salesforce records when the site was built, on ${when}. Each build reads them through an allowlisted API, after every change and every 6 hours.`
  };
}
