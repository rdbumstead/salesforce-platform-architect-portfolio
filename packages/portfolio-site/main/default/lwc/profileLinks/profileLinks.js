/**
 * @description       : The owner's profile links, in one place for every page that shows the
 *                      owner's header: the resume preview, its PDF and ATS text, and the header
 *                      over each cover letter on /ai-lab. LinkedIn, GitHub, Trailhead and
 *                      Portfolio from ResumeController.Header, each through toExternalUrl and
 *                      left out when empty, then Contact, the site's contact page built from the
 *                      portfolio URL, shown only when that URL is set. Every href is absolute,
 *                      so the links work in the PDF too. No email address or phone number.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { toExternalUrl } from "c/externalUrl";

/** The path of the site's contact page under the portfolio URL. */
export const CONTACT_PATH = "/contact";

/**
 * The contact page under the portfolio URL, or null when there is no portfolio URL.
 * @param {string} portfolioUrl stored portfolio URL
 * @returns {string|null} absolute href
 */
export function contactUrl(portfolioUrl) {
  const base = toExternalUrl(portfolioUrl);
  if (!base) {
    return null;
  }
  const withoutEnd = base.split(/[?#]/)[0].replace(/\/+$/, "");
  return `${withoutEnd}${CONTACT_PATH}`;
}

/**
 * The header links in their order, each { label, url }, empty ones left out.
 * @param {object} header a ResumeController.Header, or null
 * @returns {Array<{label: string, url: string}>} links
 */
export function headerLinks(header) {
  const source = header || {};
  return [
    { label: "LinkedIn", url: toExternalUrl(source.linkedInUrl) },
    { label: "GitHub", url: toExternalUrl(source.gitHubUrl) },
    { label: "Trailhead", url: toExternalUrl(source.trailheadUrl) },
    { label: "Portfolio", url: toExternalUrl(source.portfolioUrl) },
    { label: "Contact", url: contactUrl(source.portfolioUrl) }
  ].filter((link) => link.url);
}
