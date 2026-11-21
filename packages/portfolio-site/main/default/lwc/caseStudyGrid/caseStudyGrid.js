/**
 * @description       : The home page project showcase, directly under the hero: a heading and a
 *                      short intro, then up to eight projects from
 *                      ProjectCardController.getHomeCaseStudies in two tiers. The first four rows
 *                      are the featured tier: full cards with the number labelled "Outcome", the
 *                      title, the client line, "My part", one line each labelled "Context" and
 *                      "Decision", a slot for the picture (drawn only when figureKey is set,
 *                      sized by the CSS at 4 to 3, the picture component is placed inside it)
 *                      and "Read the case study". Row five on is "More work": compact rows with
 *                      the number, the title, "My part" and the link, and no picture. A line with
 *                      no text is left out, never a placeholder. No status pill is shown. A row
 *                      shows only with a title and a link, and a link is an http or https address
 *                      or a path on this site (isShownCase).
 *                      Following a link sends case_study_link_followed with the title, position
 *                      (1 based), total and tier (featured or more). The first time half the
 *                      section is on screen it sends case_studies_seen once, through trackEvent
 *                      and so through the same consent path as every event.
 *                      Renders nothing at all before the read returns, when no row can show or
 *                      when it fails, so there is never an empty heading.
 *                      While it shows cards its host element carries the id "case-studies", so
 *                      a link can reach it. revealHeading scrolls to the heading and
 *                      moves focus to it, and an address ending in #case-studies does the same,
 *                      on load or later. Scrolling is smooth unless the system "reduce motion"
 *                      setting is on (c/motionPreference). The width follows
 *                      --portfolio-content-width, with 1024px as the fallback.
 *                      View source and the data chip sit in one tools row: at the heading's end
 *                      from 1024px, the first width where both fit, and under the projects
 *                      below that, so a phone shows the first project close under the heading.
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
const MAX_CARDS = 8;
export const FEATURED_COUNT = 4;
export const TIER_FEATURED = "featured";
export const TIER_MORE = "more";

/**
 * The client line with each " · " kept with the word after it, by a no break space, so a
 * wrapped line never ends on a dot.
 */
function glueDots(text) {
  return text ? text.replace(/ \u00B7 /g, " \u00B7\u00A0") : text;
}

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
  seenSent = false;
  observer;

  connectedCallback() {
    window.addEventListener("hashchange", this.hashListener);
    this.pendingHashReveal = this.hashMatches();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this.hashListener);
    this.stopWatching();
  }

  renderedCallback() {
    if (this.hasCards) {
      this.watchSeen();
    } else {
      this.stopWatching();
    }
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

  get shownRows() {
    return this.rows.slice(0, MAX_CARDS);
  }

  get cards() {
    return this.shownRows.map((row, index) => this.toCard(row, index));
  }

  get featuredCards() {
    return this.cards.filter((card) => card.isFeatured);
  }

  get moreCards() {
    return this.cards.filter((card) => !card.isFeatured);
  }

  get hasMore() {
    return this.moreCards.length > 0;
  }

  toCard(row, index) {
    const metric = textOrNull(row.headlineMetric);
    const label = textOrNull(row.headlineLabel);
    const title = textOrNull(row.title);
    const isFeatured = index < FEATURED_COUNT;
    const myPart = textOrNull(row.myPart);
    const contextLine = textOrNull(row.contextLine);
    const decisionLine = textOrNull(row.decisionLine);
    const figureKey = textOrNull(row.figureKey);
    return {
      key: row.key || `case-${index}`,
      title,
      position: index + 1,
      isFeatured,
      clientLine: textOrNull(row.clientLine),
      clientText: glueDots(textOrNull(row.clientLine)),
      hasHeadline: Boolean(metric && label),
      headlineMetric: metric,
      // The leading space keeps "$0 software licence cost" apart when read as one line.
      headlineLabel: label ? ` ${label}` : null,
      myPart,
      contextLine,
      decisionLine,
      // The picture slot exists on a featured card with a key only. More work has no picture.
      figureKey: isFeatured ? figureKey : null,
      href: toCaseHref(row.liveUrl),
      buttonLabel: `Read the case study: ${title}`
    };
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
    const { name, position } = event.currentTarget.dataset;
    if (name) {
      const place = Number(position);
      trackEvent(EVENTS.CASE_STUDY_LINK_FOLLOWED, {
        name,
        position: place,
        total: this.shownRows.length,
        tier: place <= FEATURED_COUNT ? TIER_FEATURED : TIER_MORE
      });
    }
  }

  // Sends case_studies_seen once, the first time half the section, or half the window when
  // the section is taller than the window, is on screen.
  watchSeen() {
    if (
      this.seenSent ||
      this.observer ||
      typeof window.IntersectionObserver !== "function"
    ) {
      return;
    }
    const section = this.template.querySelector("section");
    if (!section) {
      return;
    }
    this.observer = new window.IntersectionObserver(
      (entries) => entries.forEach((entry) => this.handleSeen(entry)),
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    this.observer.observe(section);
  }

  handleSeen(entry) {
    if (this.seenSent || !entry.isIntersecting) {
      return;
    }
    const windowHeight = entry.rootBounds ? entry.rootBounds.height : 0;
    const half =
      entry.intersectionRatio >= 0.5 ||
      (windowHeight > 0 && entry.intersectionRect.height >= windowHeight / 2);
    if (!half) {
      return;
    }
    this.seenSent = true;
    this.stopWatching();
    trackEvent(EVENTS.CASE_STUDIES_SEEN, {
      total: this.shownRows.length,
      featured: Math.min(this.shownRows.length, FEATURED_COUNT)
    });
  }

  stopWatching() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
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
