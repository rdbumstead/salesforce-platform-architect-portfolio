/**
 * @description       : Home page hero, written for a recruiter's first look: the photo, the
 *                      name as the page's h1, the meta line (employer title and location), the
 *                      title line, one outcome sentence, a proof panel that holds two buttons,
 *                      and the profile links, where Resume sits. There are no chips. The project
 *                      showcase (c-case-study-grid) sits directly under the hero.
 *                      Name, meta line, location and photo are static so they paint without
 *                      waiting on Apex. The title line (heroLine) and the outcome sentence
 *                      (valueSentence) come from ResumeController.getHeader, which reads only
 *                      the owner Contact. The title line shows only when it is set, and nothing
 *                      extra shows when the read fails. The outcome sentence falls back to the
 *                      constant below.
 *                      The profile links are GitHub, LinkedIn and Trailhead from the owner
 *                      Contact's stored URLs (each only when set and safe, in a new tab), then
 *                      Resume and API docs.
 *                      One outcome line sits under the headline: the value sentence from the
 *                      header read, so the owner tunes it in the record, or the WHY_FALLBACK
 *                      constant when it is blank or missing. Beside it a proof panel says the site runs on Salesforce, shows one monospace line of
 *                      live test counts from ProjectCardController.getBuildCounts (each part
 *                      left out when its count is missing, the whole line left out with no Apex
 *                      count), then holds the hero's buttons. "Take the 12 minute tour" (the
 *                      minutes from c/pillarData) is the one primary button, on its own row. It
 *                      starts the tour (c/tourBar startTour) and goes straight to its first stop
 *                      as a plain link. If the tour cannot start (storage is blocked) the link
 *                      still opens that page. Under it sits one secondary button to the
 *                      architecture spec, where the guest access section stays reachable.
 *                      The case studies follow the hero directly, and the value sentence points
 *                      at them, so the hero has no button of its own to scroll there.
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
import getBuildCounts from "@salesforce/apex/ProjectCardController.getBuildCounts";
import HEADSHOT from "@salesforce/resourceUrl/Portfolio_Headshot";
import { TOUR_MINUTES } from "c/pillarData";
import { toExternalUrl } from "c/externalUrl";
import { startTour, firstStopHref } from "c/tourBar";
import { IS_STATIC } from "c/siteHost";

/** The proof panel's opening line on the Salesforce site, where every section reads live. */
export const PROOF_LIVE =
  "This site runs on Salesforce. Every case study, stat and timeline entry on it is a record served through my own API.";

/** The same line on the static site, whose sections were read when it was built. */
export const PROOF_STATIC =
  "Every case study, stat and timeline entry here is a record in my Salesforce org. Each build reads them through an allowlisted API and publishes static pages.";

/** The outcome line shown when the owner Contact's value sentence is blank or not yet read. */
export const WHY_FALLBACK =
  "Salesforce for schools and nonprofits should cost less, change safely and show its work. The case studies below show how I do each.";

/**
 * Trimmed text, or null when the value is not a non blank string.
 * @param {*} value a value from the wire
 * @returns {string|null} the text
 */
function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * A count formatted with thousands separators, or null when it is missing or not above zero.
 * @param {*} value a count from the wire
 * @returns {string|null} the formatted count
 */
function countText(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value).toLocaleString("en-US")
    : null;
}

/**
 * Builds a site relative href from the community base path and a route URL.
 * @param {string} url route URL
 * @returns {string} href
 */
function toHref(url) {
  return `${basePath || ""}/${url}`;
}

export default class HeroBanner extends LightningElement {
  headshotUrl = HEADSHOT;
  name = "Ryan Bumstead";
  title = "Senior Solution Consultant at TELUS Digital";
  location = "Greater Toledo, Ohio";
  tourHref = firstStopHref();
  tourLabel = `Take the ${TOUR_MINUTES} minute tour`;
  proofIntro = IS_STATIC ? PROOF_STATIC : PROOF_LIVE;
  header;
  // Undefined until the build counts read returns. An error keeps the stats line off.
  counts;
  @wire(getHeader)
  wiredHeader({ data }) {
    // An error or an empty header renders nothing extra: never a placeholder sentence.
    this.header = data || undefined;
  }

  // The same cacheable read c-site-build-section makes, so the counts come from one source.
  @wire(getBuildCounts)
  wiredBuildCounts({ data }) {
    this.counts = data || undefined;
  }

  get heroLine() {
    return textOrNull(this.header && this.header.heroLine);
  }

  get valueSentence() {
    return textOrNull(this.header && this.header.valueSentence) || WHY_FALLBACK;
  }

  /** One monospace line of live test stats. Each part drops out when its count is missing. */
  get statsText() {
    const parts = this.statsList;
    return parts ? parts.join(" · ") : null;
  }

  /**
   * The same stats as parts, for the template. Every part after the first carries its " · "
   * separator, so a part that wraps to a new line takes its separator with it, where the
   * panel's clip hides it. A line never ends or starts with a separator.
   */
  get statsParts() {
    const parts = this.statsList || [];
    return parts.map((text, index) => ({
      key: `stat-${index}`,
      text,
      sep: index > 0 ? " · " : null
    }));
  }

  get statsList() {
    const apex = countText(this.counts && this.counts.apexPassed);
    if (!apex) {
      return null;
    }
    const coverage = countText(this.counts.coverage);
    const jest = countText(this.counts.jestPassed);
    return [
      `${apex} Apex tests passing`,
      coverage ? `${coverage}% coverage` : null,
      jest ? `${jest} Jest tests passing` : null
    ].filter(Boolean);
  }

  get docsHref() {
    return toHref("docs");
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

  // Starts the tour. The link's own address, the first stop, is then followed.
  handleTourClick() {
    startTour();
  }
}
