/**
 * @description       : Home page hero, written for a recruiter's first look: the photo, the
 *                      name as the page's h1, the meta line (employer title and location), the
 *                      title line, one value sentence, a short proof strip, "See the case
 *                      studies", and the profile links, where Resume sits.
 *                      Name, meta line, location, proof strip and photo are static so they paint
 *                      without waiting on Apex. The proof strip's "On Salesforce since 2017"
 *                      then takes its year from ResumeController.getTimeline (the
 *                      Salesforce_Start_Year setting), the same cacheable read the career line
 *                      makes, so both show one year. The title line (heroLine) and the value
 *                      sentence (valueSentence) come from ResumeController.getHeader, which
 *                      reads only the owner Contact, and each shows only when it is set: never
 *                      a placeholder, and nothing extra when the read fails.
 *                      "See the case studies" shows only once
 *                      ProjectCardController.getHomeCaseStudies returns at least one card that
 *                      c-case-study-grid would show (a title and a usable link, isShownCase),
 *                      the same read and cache the grid uses, so it never points at a section
 *                      that is not there. Its row keeps the button's height from the first
 *                      paint, so nothing below moves when it appears. The button scrolls to
 *                      c-case-study-grid's heading and moves focus there, smoothly unless the
 *                      system "reduce motion" setting is on
 *                      (c/motionPreference). If the section cannot be found the link falls back
 *                      to the home page address ending in #case-studies.
 *                      The profile links are GitHub, LinkedIn and Trailhead from the owner
 *                      Contact's stored URLs (each only when set and safe, in a new tab), then
 *                      Resume and API docs.
 *                      Under the buttons a quiet link, "Have 10 minutes? Take the guided tour"
 *                      (the minutes from c/pillarData), starts the tour (c/tourBar startTour)
 *                      and goes straight to its first stop as a plain link. If the tour cannot
 *                      start (storage is blocked) the link still opens that page.
 *                      The pillars and their case studies live in c-site-build-section.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/19/2025
 **/
import { LightningElement, wire } from "lwc";
import basePath from "@salesforce/community/basePath";
import getHeader from "@salesforce/apex/ResumeController.getHeader";
import getHomeCaseStudies from "@salesforce/apex/ProjectCardController.getHomeCaseStudies";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import HEADSHOT from "@salesforce/resourceUrl/Portfolio_Headshot";
import {
  ACTIVE_CERTIFICATIONS,
  salesforceSince,
  TOUR_MINUTES
} from "c/pillarData";
import { isShownCase } from "c/caseStudyGrid";
import { toExternalUrl } from "c/externalUrl";
import { isReduced, onMotionChange } from "c/motionPreference";
import { startTour, firstStopHref } from "c/tourBar";

/** The id c-case-study-grid gives its host element, and the address the button falls back to. */
export const CASE_STUDIES_ANCHOR = "case-studies";

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
 * Finds an element by id in the document and in every open shadow root under it, because the
 * case study section sits in another component's tree.
 * @param {string} id the element id
 * @returns {Element|null} the element
 */
export function findById(id) {
  if (typeof document === "undefined") {
    return null;
  }
  const selector = `[id="${id}"]`;
  const roots = [document];
  while (roots.length) {
    const root = roots.shift();
    const found = root.querySelector(selector);
    if (found) {
      return found;
    }
    root.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot) {
        roots.push(element.shadowRoot);
      }
    });
  }
  return null;
}

export default class HeroBanner extends LightningElement {
  headshotUrl = HEADSHOT;
  name = "Ryan Bumstead";
  title = "Senior Solution Consultant at TELUS Digital";
  location = "Greater Toledo, Ohio";
  // A full path, not a bare fragment: the template would rewrite a bare "#..." link as a
  // reference inside this component.
  caseStudiesHref = `${basePath || ""}/#${CASE_STUDIES_ANCHOR}`;
  tourHref = firstStopHref();
  tourLabel = `Have ${TOUR_MINUTES} minutes? Take the guided tour`;
  header;
  // Undefined until the timeline read returns, so the strip paints the fallback year at once.
  startYear;
  // False until the case study read returns a card, so the button never shows with no target.
  hasCaseStudies = false;
  motionReduced = isReduced();
  stopMotionListener;

  connectedCallback() {
    this.motionReduced = isReduced();
    this.stopMotionListener = onMotionChange((reduced) => {
      this.motionReduced = reduced;
    });
  }

  disconnectedCallback() {
    if (typeof this.stopMotionListener === "function") {
      this.stopMotionListener();
    }
    this.stopMotionListener = undefined;
  }

  @wire(getHeader)
  wiredHeader({ data }) {
    // An error or an empty header renders nothing extra: never a placeholder sentence.
    this.header = data || undefined;
  }

  // The same cacheable read as c-case-study-grid with the same (empty) parameters, so the two
  // share one cached result. A card counts only by the rule the grid shows cards by.
  @wire(getHomeCaseStudies)
  wiredCaseStudies({ data }) {
    this.hasCaseStudies = Array.isArray(data) && data.some(isShownCase);
  }

  // The same cacheable read as c-career-line. Only the start year is used here. An error keeps
  // the fallback year.
  @wire(getTimeline)
  wiredTimeline({ data }) {
    this.startYear = data ? data.salesforceStartYear : undefined;
  }

  get heroLine() {
    return textOrNull(this.header && this.header.heroLine);
  }

  get valueSentence() {
    return textOrNull(this.header && this.header.valueSentence);
  }

  get proofPoints() {
    return [salesforceSince(this.startYear), ACTIVE_CERTIFICATIONS].map(
      (text, index) => ({ key: `proof-${index}`, text })
    );
  }

  get resumeHref() {
    return toHref("resume");
  }

  get profileLinks() {
    const links = [];
    const gitHubHref = toExternalUrl(this.header && this.header.gitHubUrl);
    const linkedInHref = toExternalUrl(this.header && this.header.linkedInUrl);
    const trailheadHref = toExternalUrl(
      this.header && this.header.trailheadUrl
    );
    if (gitHubHref) {
      links.push({
        key: "github",
        label: "GitHub",
        href: gitHubHref,
        external: true,
        isGitHub: true
      });
    }
    if (linkedInHref) {
      links.push({
        key: "linkedin",
        label: "LinkedIn",
        href: linkedInHref,
        external: true,
        isLinkedIn: true
      });
    }
    if (trailheadHref) {
      links.push({
        key: "trailhead",
        label: "Trailhead",
        href: trailheadHref,
        external: true,
        isTrailhead: true
      });
    }
    links.push({
      key: "resume",
      label: "Resume",
      href: this.resumeHref,
      isResume: true
    });
    links.push({
      key: "api-docs",
      label: "API docs",
      href: toHref("api-lab/reference"),
      isApi: true
    });
    return links.map((link) => ({
      ...link,
      target: link.external ? "_blank" : undefined,
      rel: link.external ? "noopener noreferrer" : undefined
    }));
  }

  handleCaseStudiesClick(event) {
    const section = findById(CASE_STUDIES_ANCHOR);
    if (section && typeof section.revealHeading === "function") {
      event.preventDefault();
      section.revealHeading(this.motionReduced);
    }
    // Otherwise the link's own #case-studies address is followed.
  }

  // Starts the tour. The link's own address, the first stop, is then followed.
  handleTourClick() {
    startTour();
  }
}
