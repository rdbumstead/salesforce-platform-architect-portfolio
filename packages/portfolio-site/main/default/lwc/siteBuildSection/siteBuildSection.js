/**
 * @description       : "How this site is built", above the contact call on the home page, for
 *                      a technical reviewer. One card per live pillar from c/pillarData, in the
 *                      case study card style: the pillar's stat as the big number with its label
 *                      when it has one, then the letter and page name, the summary and one
 *                      secondary "Open" button to the pillar page. A pillar with no stat shows
 *                      its card without a number. The section intro carries a plain link to the
 *                      spec's section on how a visitor's request reaches the data. Pillars that
 *                      are coming are named once in a plain line. The section has no primary
 *                      button. The build counts and the two architecture links are in the hero,
 *                      not here, and the case study text lives on the pillar pages.
 *                      The tour is not here: it starts from the hero and the header menu and
 *                      runs in c-tour-bar.
 *                      The stat comes from ProjectCardController.getPillarCards, merged in by
 *                      letter, and shows only when both the number and its label are set. A failed
 *                      or empty read leaves the cards as the static data draws them. The width
 *                      follows --portfolio-content-width, with 1024px as the fallback.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
import { LightningElement, wire } from "lwc";
import basePath from "@salesforce/community/basePath";
import getPillarCards from "@salesforce/apex/ProjectCardController.getPillarCards";
import { LIVE_PILLARS, COMING_PILLARS } from "c/pillarData";

/**
 * Trimmed text, or null when the value is not a non blank string.
 * @param {*} value a value from the wire
 * @returns {string|null} the text
 */
function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Builds a site relative href from the community base path and a route URL.
 * @param {string} url route URL
 * @returns {string} href
 */
function toHref(url) {
  return `${basePath || ""}/${url}`;
}

/**
 * Joins names as "A", "A and B" or "A, B and C".
 * @param {string[]} names the names
 * @returns {string} the joined text
 */
function joinNames(names) {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The stat one Project__c row gives its pillar card: the number and its label, only when both
 * are set.
 * @param {object} row a ProjectCardController.PillarCard
 * @returns {object} hasStat, statNumber and statLabel
 */
function toStat(row) {
  const number = textOrNull(row && row.headlineMetric);
  const label = textOrNull(row && row.headlineLabel);
  const hasStat = Boolean(number && label);
  return {
    hasStat,
    statNumber: hasStat ? number : null,
    statLabel: hasStat ? ` ${label}` : null
  };
}

export default class SiteBuildSection extends LightningElement {
  cardRows = [];

  @wire(getPillarCards)
  wiredPillarCards({ data }) {
    // An error or an empty result leaves every pillar exactly as the static data draws it.
    this.cardRows = Array.isArray(data) ? data : [];
  }

  get pillars() {
    const rowsByLetter = new Map();
    this.cardRows.forEach((row) => {
      if (row && row.pillar && !rowsByLetter.has(row.pillar)) {
        rowsByLetter.set(row.pillar, row);
      }
    });
    return LIVE_PILLARS.map((pillar) => ({
      ...toStat(rowsByLetter.get(pillar.letter)),
      key: pillar.key,
      letter: pillar.letter,
      name: pillar.pageLabel,
      summary: pillar.summary,
      href: pillar.href,
      linkAriaLabel: `Open ${pillar.pageLabel}`
    }));
  }

  /** The architecture spec's section on how the site guest reaches Apex and data. */
  get guestAccessHref() {
    return `${toHref("docs")}?doc=sas#3-2-how-a-guest-reaches-apex`;
  }

  get hasComing() {
    return COMING_PILLARS.length > 0;
  }

  get comingText() {
    const letters = joinNames(COMING_PILLARS.map((p) => p.letter));
    const names = joinNames(COMING_PILLARS.map((p) => p.pageLabel));
    const noun = COMING_PILLARS.length === 1 ? "Pillar" : "Pillars";
    const verb = COMING_PILLARS.length === 1 ? "is" : "are";
    return `${noun} ${letters}, ${names}, ${verb} coming.`;
  }
}
