/**
 * @description       : The home page case studies: a framing line, then up to three cards from
 *                      ProjectCardController.getHomeCaseStudies. Each card has its headline number
 *                      and label (only when both are set), the title, the engagement line
 *                      (Client_Line__c) and a "Read the case study" button. The first card's
 *                      button is the section's one primary button and the others are secondary.
 *                      No status pill is shown. A card shows only with a title and a link, and a
 *                      link is an http or https address or a path on this site (isShownCase).
 *                      Following a link sends case_study_link_followed with the card's title.
 *                      Renders nothing at all before the read returns, when no card can show or
 *                      when it fails, so there is never an empty heading.
 *                      While it shows cards its host element carries the id "case-studies", so
 *                      a link can reach it. revealHeading scrolls to the heading and
 *                      moves focus to it, and an address ending in #case-studies does the same,
 *                      on load or later. Scrolling is smooth unless the system "reduce motion"
 *                      setting is on (c/motionPreference). The width follows
 *                      --portfolio-content-width, with 1024px as the fallback.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
import { LightningElement, api, wire } from "lwc";
import basePath from "@salesforce/community/basePath";
import getHomeCaseStudies from "@salesforce/apex/ProjectCardController.getHomeCaseStudies";
import { toExternalUrl } from "c/externalUrl";
import { trackEvent, EVENTS } from "c/analyticsService";
import { isReduced } from "c/motionPreference";

export const ANCHOR_ID = "case-studies";
const ANCHOR_HASH = `#${ANCHOR_ID}`;
const MAX_CARDS = 3;

/**
 * Trimmed text, or null when the value is not a non blank string.
 * @param {*} value a value from the wire
 * @returns {string|null} the text
 */
function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * A card's link: a path on this site under the base path, or a safe http or https address.
 * Anything else gives no link.
 * @param {string} value the stored Live_URL__c
 * @returns {string|null} the href
 */
export function toCaseHref(value) {
  const text = textOrNull(value);
  if (!text) {
    return null;
  }
  if (text.startsWith("/") && !text.startsWith("//")) {
    return `${basePath || ""}${text}`;
  }
  return /^https?:\/\//i.test(text) ? toExternalUrl(text) : null;
}

/**
 * Whether a case study row can show as a card: it has a title and a usable link.
 * @param {object} row a ProjectCardController.CaseStudy
 * @returns {boolean} true when the card shows
 */
export function isShownCase(row) {
  return Boolean(row && textOrNull(row.title) && toCaseHref(row.liveUrl));
}

export default class CaseStudyGrid extends LightningElement {
  rows = [];
  hashListener = () => this.revealFromHash();
  pendingHashReveal = false;

  connectedCallback() {
    window.addEventListener("hashchange", this.hashListener);
    this.pendingHashReveal = this.hashMatches();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this.hashListener);
  }

  renderedCallback() {
    if (this.pendingHashReveal && this.hasCards) {
      this.pendingHashReveal = false;
      this.revealHeading(isReduced());
    }
  }

  @wire(getHomeCaseStudies)
  wiredCaseStudies({ data, error }) {
    if (Array.isArray(data)) {
      this.rows = data.filter(isShownCase);
    } else if (error || data === null) {
      // An extra on the home page: on an error it stays hidden.
      this.rows = [];
    }
    this.syncAnchor();
  }

  get hasCards() {
    return this.rows.length > 0;
  }

  get cards() {
    return this.rows.slice(0, MAX_CARDS).map((row, index) => {
      const metric = textOrNull(row.headlineMetric);
      const label = textOrNull(row.headlineLabel);
      const title = textOrNull(row.title);
      const href = toCaseHref(row.liveUrl);
      return {
        key: row.key || `case-${index}`,
        title,
        clientLine: textOrNull(row.clientLine),
        hasHeadline: Boolean(metric && label),
        headlineMetric: metric,
        // The leading space keeps "$0 software licence cost" apart when read as one line.
        headlineLabel: label ? ` ${label}` : null,
        href,
        buttonClass: index === 0 ? "btn btn-primary" : "btn btn-secondary",
        buttonLabel: `Read the case study: ${title}`
      };
    });
  }

  /**
   * Scrolls to the section heading and moves focus to it.
   * @param {boolean} reduced true when the system asks for less motion
   * @returns {boolean} true when the heading was there to move to
   */
  @api
  revealHeading(reduced) {
    const heading = this.template.querySelector('[data-id="case-heading"]');
    if (!heading) {
      return false;
    }
    if (typeof heading.scrollIntoView === "function") {
      heading.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start"
      });
    }
    heading.focus({ preventScroll: true });
    return true;
  }

  handleLinkClick(event) {
    const name = event.currentTarget.dataset.name;
    if (name) {
      trackEvent(EVENTS.CASE_STUDY_LINK_FOLLOWED, { name });
    }
  }

  hashMatches() {
    try {
      return window.location.hash === ANCHOR_HASH;
    } catch {
      return false;
    }
  }

  revealFromHash() {
    if (this.hashMatches()) {
      this.revealHeading(isReduced());
    }
  }

  // The id is set only while there is a section to reach, so a link to an empty section
  // falls back to the plain address.
  syncAnchor() {
    if (this.hasCards) {
      this.setAttribute("id", ANCHOR_ID);
    } else {
      this.removeAttribute("id");
    }
  }
}
