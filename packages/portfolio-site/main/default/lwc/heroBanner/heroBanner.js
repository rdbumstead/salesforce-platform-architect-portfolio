/**
 * @description       : Home page: the hero (photo, name, title, location, bio, the tour button, a
 *                      direct link to the resume, profile links), three "start here" paths (audit
 *                      E2), the live pillar cards, an honest line for the pillars that are coming,
 *                      and the "How to evaluate me" tour.
 *                      Name, title, location and photo are static so they paint without waiting on
 *                      Apex. The bio and profile links come from ResumeController.getHeader, which
 *                      reads only the owner Contact, so the bio does not wait on the full resume.
 *                      Each card can gain a headline number and a screenshot from
 *                      ProjectCardController.getPillarCards (Round 6 plan N7), merged in by
 *                      letter. The number shows only with its label, the image only with its
 *                      alt text, and a failed or empty wire leaves the cards as they were.
 *                      Round 7 plan P5 (audit E3): a card with Challenge, Solution or Business
 *                      Value text gets a case study disclosure, a real button with
 *                      aria-expanded, showing those blocks and the Live and Source links that
 *                      are set and safe.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { LightningElement, wire } from "lwc";
import basePath from "@salesforce/community/basePath";
import getHeader from "@salesforce/apex/ResumeController.getHeader";
import getPillarCards from "@salesforce/apex/ProjectCardController.getPillarCards";
import HEADSHOT from "@salesforce/resourceUrl/Portfolio_Headshot";
import { LIVE_PILLARS, COMING_PILLARS } from "c/pillarData";
import { toExternalUrl, toSiteAssetUrl } from "c/externalUrl";

const MINUTES_PER_STEP = 1;
// The card images are rendered at this size (Project_Card_Images), so the browser can
// reserve the space before they load.
const CARD_IMAGE_WIDTH = 640;
const CARD_IMAGE_HEIGHT = 360;

/**
 * Trimmed text, or null when the value is not a non blank string.
 * @param {*} value a value from the wire
 * @returns {string|null} the text
 */
function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The extras one Project__c row adds to its card: the headline only when both the number
 * and its label are set, the image only when both the URL and the alt text are set.
 * @param {object} row a ProjectCardController.PillarCard
 * @returns {object} the card extras
 */
function toCardExtras(row) {
  const caseBlocks = [
    ["challenge", "Challenge"],
    ["solution", "Solution"],
    ["businessValue", "Business value"]
  ]
    .map(([field, heading]) => ({
      key: field,
      heading,
      text: textOrNull(row && row[field])
    }))
    .filter((block) => block.text);
  const caseLinks = [
    ["live", "Live site", toExternalUrl(row && row.liveUrl)],
    ["source", "Source code", toExternalUrl(row && row.repositoryUrl)]
  ]
    .filter(([, , href]) => href)
    .map(([key, label, href]) => ({ key, label, href }));
  const metric = textOrNull(row && row.headlineMetric);
  const label = textOrNull(row && row.headlineLabel);
  const imageUrl = toSiteAssetUrl(row && row.imageUrl, basePath);
  const imageAlt = textOrNull(row && row.imageAlt);
  const hasHeadline = Boolean(metric && label);
  const hasImage = Boolean(imageUrl && imageAlt);
  return {
    hasHeadline,
    headlineMetric: hasHeadline ? metric : null,
    headlineLabel: hasHeadline ? label : null,
    hasImage,
    imageUrl: hasImage ? imageUrl : null,
    imageAlt: hasImage ? imageAlt : null,
    caseBlocks,
    caseLinks,
    hasCaseLinks: caseLinks.length > 0,
    // Links alone are no case study: the disclosure needs at least one text block.
    hasCaseStudy: caseBlocks.length > 0
  };
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
 * Scrolls to an element and moves focus to it, respecting reduced motion.
 * @param {HTMLElement} target the heading to move to
 */
function moveTo(target) {
  if (!target) {
    return;
  }
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start"
    });
  }
  target.focus({ preventScroll: true });
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
  headshotUrl = HEADSHOT;
  name = "Ryan Bumstead";
  title = "Salesforce Platform Architect";
  location = "Greater Toledo, Ohio";
  header;
  cardRows = [];
  cardImageWidth = CARD_IMAGE_WIDTH;
  cardImageHeight = CARD_IMAGE_HEIGHT;
  expandedKeys = {};
  newTabNote = ", opens in a new tab";

  @wire(getPillarCards)
  wiredPillarCards({ data }) {
    // An error or an empty result leaves every card exactly as the static data draws it.
    this.cardRows = Array.isArray(data) ? data : [];
  }

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
    const rowsByLetter = new Map();
    this.cardRows.forEach((row) => {
      if (row && row.pillar && !rowsByLetter.has(row.pillar)) {
        rowsByLetter.set(row.pillar, row);
      }
    });
    return LIVE_PILLARS.map((pillar) => ({
      ...toCardExtras(rowsByLetter.get(pillar.letter)),
      key: pillar.key,
      letter: pillar.letter,
      eyebrow: `Pillar ${pillar.letter} · ${pillar.pageLabel}`,
      sasName: pillar.sasName,
      summary: pillar.summary,
      code: pillar.code,
      tags: pillar.tags.map((tag) => ({ key: tag, label: tag })),
      href: pillar.href,
      linkLabel: `Open ${pillar.pageLabel}`
    })).map((card) => {
      const expanded = Boolean(this.expandedKeys[card.key]);
      return {
        ...card,
        caseId: `case-${card.key}`,
        expandedText: expanded ? "true" : "false",
        caseHidden: !expanded,
        caseChevron: expanded ? "−" : "+",
        caseToggleLabel: expanded
          ? "Hide the case study"
          : "Read the case study"
      };
    });
  }

  get startPaths() {
    const paths = [
      {
        key: "resume",
        audience: "For recruiters",
        title: "Read the resume",
        href: this.resumeHref,
        arrow: "→",
        text: "Filter it by Admin, Developer or Architect, then download the PDF."
      },
      {
        key: "pillars",
        audience: "For architects",
        title: "Start with the pillars",
        href: "#pillars-heading",
        target: "pillars-heading",
        arrow: "↓",
        text: "Five pieces of work, each with its case study and a live page."
      }
    ];
    const apiLab = LIVE_PILLARS.find((pillar) => pillar.letter === "C");
    if (apiLab) {
      paths.push({
        key: "api-lab",
        audience: "For developers",
        title: "Call the API",
        href: apiLab.href,
        arrow: "→",
        text: "Send a live request to the portfolio API and read the headers it returns."
      });
    }
    return paths;
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
    moveTo(this.template.querySelector('[data-id="tour-heading"]'));
  }

  handleStartClick(event) {
    const target = event.currentTarget.dataset.target;
    if (!target) {
      // A plain link to another page.
      return;
    }
    event.preventDefault();
    moveTo(this.template.querySelector(`[data-id="${target}"]`));
  }

  handleCaseToggle(event) {
    const key = event.currentTarget.dataset.key;
    this.expandedKeys = {
      ...this.expandedKeys,
      [key]: !this.expandedKeys[key]
    };
  }
}
