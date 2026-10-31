/**
 * @description       : Home page hero, written for a recruiter's first look: the photo, the
 *                      name as the page's h1, the meta line (employer title and location), the
 *                      title line, one value sentence, a short proof strip, a proof panel that
 *                      holds the tour, and the profile links, where Resume sits.
 *                      Name, meta line, location, proof strip and photo are static so they paint
 *                      without waiting on Apex. The proof strip's "On Salesforce since 2017"
 *                      then takes its year from ResumeController.getTimeline (the
 *                      Salesforce_Start_Year setting), the same cacheable read the career line
 *                      makes, so both show one year. The title line (heroLine) and the value
 *                      sentence (valueSentence) come from ResumeController.getHeader, which
 *                      reads only the owner Contact. The title line shows only when it is set,
 *                      and nothing extra shows when the read fails. The value sentence falls
 *                      back to the constant below.
 *                      The profile links are GitHub, LinkedIn and Trailhead from the owner
 *                      Contact's stored URLs (each only when set and safe, in a new tab), then
 *                      Resume and API docs.
 *                      One "why you are here" line sits under the headline: the value sentence
 *                      from the header read, so the owner tunes it in the record, or the
 *                      WHY_FALLBACK constant when it is blank or missing. The proof strip's
 *                      certification count is the number of certifications in the same
 *                      getTimeline read, which leaves retired ones out, and shows the
 *                      c/pillarData constant until that read returns, or when it fails or
 *                      counts none. Under the proof strip a proof panel, as wide as the value
 *                      sentence, says the site runs on Salesforce, shows one monospace line of
 *                      live test counts from ProjectCardController.getBuildCounts (each part
 *                      left out when its count is missing, the whole line left out with no Apex
 *                      count), then holds the hero's buttons. "Take the 10 minute tour" (the
 *                      minutes from c/pillarData) is the one primary button, on its own row. It
 *                      starts the tour (c/tourBar startTour) and goes straight to its first stop
 *                      as a plain link. If the tour cannot start (storage is blocked) the link
 *                      still opens that page. Under it sit two secondary buttons to the
 *                      architecture spec and the guest access section.
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
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import getBuildCounts from "@salesforce/apex/ProjectCardController.getBuildCounts";
import HEADSHOT from "@salesforce/resourceUrl/Portfolio_Headshot";
import {
  ACTIVE_CERTIFICATIONS,
  activeCertificationsText,
  salesforceSince,
  TOUR_MINUTES
} from "c/pillarData";
import { toExternalUrl } from "c/externalUrl";
import { startTour, firstStopHref } from "c/tourBar";

/** The why line shown when the owner Contact's value sentence is blank or not yet read. */
export const WHY_FALLBACK =
  "If you're hiring a Salesforce architect for education or nonprofit work, start with the three case studies below. Each shows the problem, the call I made and how it turned out.";

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
  proofIntro =
    "This site runs on Salesforce. Every case study, stat and timeline entry on it is a record served through my own API.";
  header;
  // Undefined until the build counts read returns. An error keeps the stats line off.
  counts;
  // Active certifications counted from the timeline read. Undefined until it returns.
  certCount;
  // Undefined until the timeline read returns, so the strip paints the fallback year at once.
  startYear;
  @wire(getHeader)
  wiredHeader({ data }) {
    // An error or an empty header renders nothing extra: never a placeholder sentence.
    this.header = data || undefined;
  }

  // The same cacheable read as c-career-line. Only the start year is used here. An error keeps
  // the fallback year.
  @wire(getTimeline)
  wiredTimeline({ data }) {
    this.startYear = data ? data.salesforceStartYear : undefined;
    // The read already leaves out retired certifications. An error or zero keeps the constant.
    this.certCount =
      data && Array.isArray(data.certifications)
        ? data.certifications.length
        : undefined;
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

  get proofPoints() {
    const certs = this.certCount
      ? activeCertificationsText(this.certCount)
      : ACTIVE_CERTIFICATIONS;
    return [salesforceSince(this.startYear), certs].map((text, index) => ({
      key: `proof-${index}`,
      text
    }));
  }

  /** One monospace line of live test stats. Each part drops out when its count is missing. */
  get statsText() {
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
    ]
      .filter(Boolean)
      .join(" · ");
  }

  get docsHref() {
    return toHref("docs");
  }

  /** The architecture spec's section on how the site guest reaches Apex and data. */
  get guestAccessHref() {
    return `${toHref("docs")}?doc=sas#3-2-how-a-guest-reaches-apex`;
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
