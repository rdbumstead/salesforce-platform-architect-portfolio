/**
 * @description       : "How this site is built", above the contact call on the home page, for
 *                      a technical reviewer. A compact list of the live pillars from
 *                      c/pillarData (letter, page name, summary, a link to the page), then
 *                      Skills, then a footer row: the newest successful deploy's test counts
 *                      linking to /delivery and a link to the design docs.
 *                      Pillars that are coming are named once in a plain line.
 *                      The tour is not here: it starts from the hero and the header menu and
 *                      runs in c-tour-bar.
 *                      Each pillar can gain a small stat line and a case study from
 *                      ProjectCardController.getPillarCards, merged in by letter. The stat shows
 *                      only with its label. A pillar with Challenge, Solution or Business Value
 *                      text gets a case study disclosure, a real button with aria-expanded,
 *                      showing those blocks and the Live and Source links that are set and safe.
 *                      Opening one sends case_study_opened with the pillar letter. A failed or
 *                      empty read leaves the list as the static data draws it.
 *                      The counts come from ProjectCardController.getBuildCounts and show only
 *                      when the read returns a number, never a placeholder.
 *                      A case study fades and slides in when opened. That motion is off when the
 *                      system "reduce motion" setting is on (c/motionPreference).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { LightningElement, wire } from "lwc";
import basePath from "@salesforce/community/basePath";
import getPillarCards from "@salesforce/apex/ProjectCardController.getPillarCards";
import getBuildCounts from "@salesforce/apex/ProjectCardController.getBuildCounts";
import { LIVE_PILLARS, COMING_PILLARS } from "c/pillarData";
import { toExternalUrl } from "c/externalUrl";
import { trackEvent, EVENTS } from "c/analyticsService";
import { isReduced, onMotionChange } from "c/motionPreference";

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
 * A whole number with thousands separators, or null when it is not a positive number.
 * @param {*} value a count from the wire
 * @returns {string|null} the formatted count
 */
function countText(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value).toLocaleString("en-US")
    : null;
}

/**
 * The extras one Project__c row adds to its pillar: the stat line only when both the number
 * and its label are set, and the case study blocks and links that are set and safe.
 * @param {object} row a ProjectCardController.PillarCard
 * @returns {object} the extras
 */
function toExtras(row) {
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
  return {
    stat: metric && label ? `${metric} ${label}` : null,
    caseBlocks,
    caseLinks,
    hasCaseLinks: caseLinks.length > 0,
    // Links alone are no case study: the disclosure needs at least one text block.
    hasCaseStudy: caseBlocks.length > 0
  };
}

export default class SiteBuildSection extends LightningElement {
  cardRows = [];
  counts;
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

  @wire(getPillarCards)
  wiredPillarCards({ data }) {
    // An error or an empty result leaves every pillar exactly as the static data draws it.
    this.cardRows = Array.isArray(data) ? data : [];
  }

  @wire(getBuildCounts)
  wiredBuildCounts({ data }) {
    // An error or no run shows no counts line.
    this.counts = data || undefined;
  }

  // The opening motion follows the same preference through this class.
  get sectionClass() {
    return this.motionReduced ? "build motion-reduced" : "build";
  }

  get pillars() {
    const rowsByLetter = new Map();
    this.cardRows.forEach((row) => {
      if (row && row.pillar && !rowsByLetter.has(row.pillar)) {
        rowsByLetter.set(row.pillar, row);
      }
    });
    return LIVE_PILLARS.map((pillar) => {
      const expanded = Boolean(this.expandedKeys[pillar.key]);
      return {
        ...toExtras(rowsByLetter.get(pillar.letter)),
        key: pillar.key,
        letter: pillar.letter,
        name: pillar.pageLabel,
        summary: pillar.summary,
        href: pillar.href,
        linkAriaLabel: `Open ${pillar.pageLabel}`,
        caseId: `case-${pillar.key}`,
        expandedText: expanded ? "true" : "false",
        caseHidden: !expanded,
        caseChevron: expanded ? "−" : "+",
        caseToggleLabel: expanded
          ? "Hide the case study"
          : "Read the case study"
      };
    });
  }

  get skillsHref() {
    return toHref("skills");
  }

  get deliveryHref() {
    return toHref("delivery");
  }

  get docsHref() {
    return toHref("docs");
  }

  get countsText() {
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
