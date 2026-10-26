/**
 * @description       : The home page case studies: up to three cards from
 *                      ProjectCardController.getHomeCaseStudies, each with its headline number
 *                      and label (only when both are set), the title, the client line, the
 *                      three blocks "The problem", "My call" and "The result" (each only when
 *                      set), the topic chips and a link to the full write up. The link shows
 *                      only for an http or https address or a path on this site, and following
 *                      it sends case_study_link_followed with the card's title.
 *                      Renders nothing at all before the read returns, when it is empty or when
 *                      it fails, so there is never an empty heading.
 *                      While it shows cards its host element carries the id "case-studies", so
 *                      the hero button and the header's Work link can reach it. revealHeading
 *                      scrolls to the heading and moves focus to it, and an address ending in
 *                      #case-studies does the same, on load or later. Scrolling is smooth
 *                      unless the system "reduce motion" setting is on (c/motionPreference).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
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
const LINK_LABEL = "See the full design";

const BLOCKS = [
  ["challenge", "The problem"],
  ["solution", "My call"],
  ["businessValue", "The result"]
];

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
      this.rows = data.filter((row) => row && textOrNull(row.title));
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
      const tags = Array.isArray(row.tags)
        ? row.tags
            .map((tag) => textOrNull(tag))
            .filter(Boolean)
            .map((tag) => ({ key: tag, label: tag }))
        : [];
      return {
        key: row.key || `case-${index}`,
        title,
        clientLine: textOrNull(row.clientLine),
        hasHeadline: Boolean(metric && label),
        headlineMetric: metric,
        // The leading space keeps "$0 software licence cost" apart when read as one line.
        headlineLabel: label ? ` ${label}` : null,
        blocks: BLOCKS.map(([field, heading]) => ({
          key: field,
          heading,
          text: textOrNull(row[field])
        })).filter((block) => block.text),
        tags,
        hasTags: tags.length > 0,
        href,
        linkLabel: LINK_LABEL,
        linkAriaLabel: `${LINK_LABEL}: ${title}`
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
