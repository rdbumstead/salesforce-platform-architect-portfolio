/**
 * @description       : Home page: the hero (photo, name, title, location, bio, the tour button, a
 *                      direct link to the resume, profile links), the live pillar cards, an honest
 *                      line for the pillars that are coming, and the "How to evaluate me" tour.
 *                      Name, title, location and photo are static so they paint without waiting on
 *                      Apex. The bio and profile links come from ResumeController.getHeader, which
 *                      reads only the owner Contact, so the bio does not wait on the full resume.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { LightningElement, wire } from "lwc";
import basePath from "@salesforce/community/basePath";
import getHeader from "@salesforce/apex/ResumeController.getHeader";
import { LIVE_PILLARS, COMING_PILLARS } from "c/pillarData";
import { toExternalUrl } from "c/externalUrl";

const MINUTES_PER_STEP = 1;
// The same URL the head markup preloads, so the photo starts downloading before this
// component renders and the browser reuses that response.
const HEADSHOT_PATH = "sfsites/c/resource/Portfolio_Headshot";

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
 * Whether the visitor asked the system for less motion.
 * @returns {boolean} true when reduced motion is set
 */
function prefersReducedMotion() {
  try {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

export default class HeroBanner extends LightningElement {
  headshotUrl = toHref(HEADSHOT_PATH);
  name = "Ryan Bumstead";
  title = "Salesforce Platform Architect";
  location = "Greater Toledo, Ohio";
  header;

  @wire(getHeader)
  wiredHeader({ data }) {
    // An error or an empty header renders nothing extra: never a placeholder sentence.
    this.header = data || undefined;
  }

  get bio() {
    const text = this.header && this.header.careerObjective;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  }

  get resumeHref() {
    return toHref("resume");
  }

  get profileLinks() {
    const links = [];
    const gitHubHref = toExternalUrl(this.header && this.header.gitHubUrl);
    const linkedInHref = toExternalUrl(this.header && this.header.linkedInUrl);
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

  get pillars() {
    return LIVE_PILLARS.map((pillar) => ({
      key: pillar.key,
      letter: pillar.letter,
      eyebrow: `Pillar ${pillar.letter} · ${pillar.pageLabel}`,
      sasName: pillar.sasName,
      summary: pillar.summary,
      code: pillar.code,
      tags: pillar.tags.map((tag) => ({ key: tag, label: tag })),
      href: pillar.href,
      linkLabel: `Open ${pillar.pageLabel}`
    }));
  }

  get hasComing() {
    return COMING_PILLARS.length > 0;
  }

  get comingText() {
    const letters = joinNames(COMING_PILLARS.map((p) => p.letter));
    const names = joinNames(COMING_PILLARS.map((p) => p.sasName));
    const noun = COMING_PILLARS.length === 1 ? "Pillar" : "Pillars";
    const verb = COMING_PILLARS.length === 1 ? "is" : "are";
    return `${noun} ${letters}, ${names}, ${verb} coming.`;
  }

  get tourSteps() {
    return LIVE_PILLARS.map((pillar, index) => ({
      key: pillar.key,
      number: String(index + 1).padStart(2, "0"),
      href: pillar.href,
      title: pillar.pageLabel,
      text: pillar.tour,
      duration: `${MINUTES_PER_STEP} minute`
    }));
  }

  get tourMinutes() {
    return LIVE_PILLARS.length * MINUTES_PER_STEP;
  }

  get tourButtonLabel() {
    return `Take the ${this.tourMinutes} minute tour`;
  }

  get tourHeading() {
    return `A ${this.tourMinutes} minute tour.`;
  }

  handleTourClick(event) {
    event.preventDefault();
    const heading = this.template.querySelector('[data-id="tour-heading"]');
    if (heading) {
      if (typeof heading.scrollIntoView === "function") {
        heading.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "start"
        });
      }
      heading.focus({ preventScroll: true });
    }
  }
}
