/**
 * @description       : Home page: the hero (photo, name, title, location, bio, the tour button, a
 *                      direct link to the resume, profile links), three "start here" paths,
 *                      the live pillar cards, an honest line for the pillars that are coming,
 *                      and the "How to evaluate me" tour.
 *                      Name, title, location and photo are static so they paint without waiting on
 *                      Apex. The bio and profile links come from ResumeController.getHeader, which
 *                      reads only the owner Contact, so the bio does not wait on the full resume.
 *                      The owner's one line (heroLine) shows under the name when it is set and
 *                      not at all when it is blank or the read fails.
 *                      Each card can gain a headline number and a screenshot from
 *                      ProjectCardController.getPillarCards, merged in by
 *                      letter. The number shows only with its label, the image only with its
 *                      alt text, and a failed or empty wire leaves the cards as they were.
 *                      A card with Challenge, Solution or Business
 *                      Value text gets a case study disclosure, a real button with
 *                      aria-expanded, showing those blocks and the Live and Source links that
 *                      are set and safe.
 *                      Smooth scrolling and the card hover transition follow
 *                      c/motionPreference: the visitor's own choice, else the system setting.
 *                      Opening a case study sends case_study_opened with the pillar letter,
 *                      and following a start here path sends start_path_followed.
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
import { trackEvent, EVENTS } from "c/analyticsService";
import { isReduced, onMotionChange } from "c/motionPreference";

// The analytics value each start here path sends with start_path_followed.
const START_PATH_EVENT_VALUES = {
  resume: "resume",
  pillars: "pillars",
  "api-lab": "api"
};

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
 * Scrolls to an element and moves focus to it, smoothly unless motion is reduced.
 * @param {HTMLElement} target the heading to move to
 * @param {boolean} reduced true when the visitor's motion preference (their own choice, else
 *        the system setting) asks for less motion
 */
function moveTo(target, reduced) {
  if (!target) {
    return;
  }
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start"
    });
  }
  target.focus({ preventScroll: true });
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

  // The card hover transition follows the same preference through this class.
  get homeClass() {
    return this.motionReduced ? "home motion-reduced" : "home";
  }

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

  get heroLine() {
    return textOrNull(this.header && this.header.heroLine);
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
    moveTo(
      this.template.querySelector('[data-id="tour-heading"]'),
      this.motionReduced
    );
  }

  handleStartClick(event) {
    const { target, path } = event.currentTarget.dataset;
    const eventPath = START_PATH_EVENT_VALUES[path];
    if (eventPath) {
      trackEvent(EVENTS.START_PATH_FOLLOWED, { path: eventPath });
    }
    if (!target) {
      // A plain link to another page.
      return;
    }
    event.preventDefault();
    moveTo(
      this.template.querySelector(`[data-id="${target}"]`),
      this.motionReduced
    );
  }

  handleCaseToggle(event) {
    const key = event.currentTarget.dataset.key;
    const opening = !this.expandedKeys[key];
    this.expandedKeys = {
      ...this.expandedKeys,
      [key]: opening
    };
    if (opening) {
      const pillar = LIVE_PILLARS.find((entry) => entry.key === key);
      if (pillar) {
        trackEvent(EVENTS.CASE_STUDY_OPENED, { pillar: pillar.letter });
      }
    }
  }
}
