/**
 * @description       : The numbers panel for the Delivery page. Reads
 *                      PortfolioStatsController.getStats once through the wire service and
 *                      shows each count as text: production deploys recorded, the newest
 *                      deploy's Apex and Jest tests each with one plain line on what they
 *                      prove, evaluator tokens issued, cover letters written and API Lab
 *                      requests sent since the month counting began, a closed "What the tests
 *                      cover" disclosure, and a table of approved testimonials by vibe once
 *                      one is approved. The server returns counts only, so nothing here can
 *                      show a record.
 *
 *                      Each number is in the text from the start, so a screen reader reads it
 *                      once. When the counts scroll into view after the visitor has scrolled,
 *                      a copy that hides from assistive technology counts up from 0 over about
 *                      600 ms on top of the real number, which fades out for those frames.
 *                      Nothing counts when the counts are already on screen at the top of the
 *                      page, when the system asks for reduced motion, or when the browser has
 *                      no IntersectionObserver.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
import { LightningElement, wire } from "lwc";
import getStats from "@salesforce/apex/PortfolioStatsController.getStats";
import { isReduced } from "c/motionPreference";
import { APEX_GROUPS, JEST_GROUPS, COUNTED_ON } from "./testGroups";

/** How long the count up runs, in milliseconds. */
export const COUNT_UP_MS = 600;

/** One plain line on what the Apex tests prove. */
export const APEX_LINE =
  "Every API contract, guest access rule, rate limit and data path, run in production after each deploy.";

/** One plain line on what the Jest tests prove. */
export const JEST_LINE =
  "Every site component's rendering, wiring and accessibility rules, run on each change.";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

/**
 * A count as text, with a thousands separator. A missing count reads as 0.
 * @param {number} value the count
 * @returns {string} the text
 */
export function formatCount(value) {
  const number = Number.isFinite(value) ? value : 0;
  return number.toLocaleString("en-US");
}

/**
 * A coverage percentage as text, such as "98%" or "97.5%". Empty when missing.
 * @param {number} value the coverage from 0 to 100
 * @returns {string} the text
 */
export function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return `${Number(value.toFixed(2))}%`;
}

/**
 * The month and year of a date such as "2026-10-26", for example "October 2026". Empty when
 * the value is missing or not a date.
 * @param {string} isoDate the date as year, month and day
 * @returns {string} the text
 */
export function formatMonth(isoDate) {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(isoDate || "");
  if (!match) {
    return "";
  }
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : "";
}

/**
 * A date such as "2026-10-26" as "26 October 2026". Empty when it is not a date.
 * @param {string} isoDate the date as year, month and day
 * @returns {string} the text
 */
export function formatDay(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || "");
  const month = match ? MONTHS[Number(match[2]) - 1] : null;
  return month ? `${Number(match[3])} ${month} ${match[1]}` : "";
}

/**
 * The detail under the Apex count: how many ran in the newest deploy and the coverage.
 * @param {object} stats the server's counts
 * @returns {string} the text, empty when there is no result
 */
export function apexDetail(stats) {
  if (!stats || !Number.isFinite(stats.latestTestsRun)) {
    return "";
  }
  let text = `of ${formatCount(stats.latestTestsRun)} run in the newest deploy`;
  const coverage = formatPercent(stats.latestCoverage);
  if (coverage) {
    text += `, ${coverage} org coverage`;
  }
  return `${text}.`;
}

/**
 * The sum of the tests in a list of groups.
 * @param {Array<{tests: number}>} groups the groups
 * @returns {number} the total
 */
export function totalOf(groups) {
  return groups.reduce((sum, group) => sum + group.tests, 0);
}

export default class ByTheNumbers extends LightningElement {
  stats;
  hasError = false;
  progress = 1;
  counting = false;

  observer;
  frame;
  watching = false;

  @wire(getStats)
  wiredStats({ data, error }) {
    if (data) {
      this.stats = data;
      this.hasError = false;
    } else if (error) {
      this.stats = undefined;
      this.hasError = true;
    }
  }

  renderedCallback() {
    if (this.hasStats && !this.watching) {
      this.watching = true;
      this.watchForView();
    }
  }

  disconnectedCallback() {
    this.stopWatching();
    if (this.frame && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(this.frame);
    }
    this.frame = null;
  }

  watchForView() {
    if (
      isReduced() ||
      typeof window.IntersectionObserver !== "function" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return;
    }
    const target = this.template.querySelector(".stats");
    if (!target) {
      return;
    }
    this.observer = new window.IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }
      this.stopWatching();
      // On screen at the top of the page, before any scroll: leave the numbers as they are.
      if (!window.scrollY) {
        return;
      }
      this.startCount();
    });
    this.observer.observe(target);
  }

  stopWatching() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  startCount() {
    this.progress = 0;
    this.counting = true;
    let started = null;
    const step = (now) => {
      if (started === null) {
        started = now;
      }
      const share = Math.min(1, (now - started) / COUNT_UP_MS);
      this.progress = 1 - Math.pow(1 - share, 3);
      if (share < 1) {
        this.frame = window.requestAnimationFrame(step);
      } else {
        this.progress = 1;
        this.counting = false;
        this.frame = null;
      }
    };
    this.frame = window.requestAnimationFrame(step);
  }

  get isLoading() {
    return !this.stats && !this.hasError;
  }

  get hasStats() {
    return !!this.stats;
  }

  get isCounting() {
    return this.counting;
  }

  get finalClass() {
    return this.counting ? "value-final value-hidden" : "value-final";
  }

  get tiles() {
    const stats = this.stats;
    const since = formatMonth(stats.countingSince);
    const sinceText = since ? `since ${since}` : "";
    return [
      this.tile("deploys", stats.deployRuns, "Production deploys recorded"),
      this.testTile(
        "apex",
        stats.latestTestsRun,
        stats.latestTestsPassed,
        "Apex tests passed",
        apexDetail(stats),
        "No deploy has a test result yet.",
        APEX_LINE
      ),
      this.testTile(
        "jest",
        stats.latestJestRun,
        stats.latestJestPassed,
        "Jest tests passed",
        Number.isFinite(stats.latestJestRun)
          ? `of ${formatCount(stats.latestJestRun)} run in the newest deploy.`
          : "",
        "No deploy has a Jest result yet.",
        JEST_LINE
      ),
      this.tile(
        "tokens",
        stats.tokensIssued,
        "API Lab evaluator tokens issued"
      ),
      this.tile(
        "letters",
        stats.coverLettersWritten,
        "Cover letters written",
        sinceText
      ),
      this.tile(
        "requests",
        stats.apiLabRequests,
        "API Lab requests sent",
        sinceText
      )
    ];
  }

  tile(key, count, label, detail = "", line = "") {
    const target = Number.isFinite(count) ? count : 0;
    return {
      key,
      hasValue: true,
      valueText: formatCount(target),
      liveText: formatCount(Math.floor(target * this.progress)),
      label,
      detail,
      line,
      hasDetail: !!detail,
      hasLine: !!line
    };
  }

  testTile(key, run, passed, label, detail, missing, line) {
    if (!Number.isFinite(run)) {
      return {
        key,
        hasValue: false,
        message: missing,
        label,
        line,
        hasDetail: false,
        hasLine: true
      };
    }
    return this.tile(
      key,
      Number.isFinite(passed) ? passed : 0,
      label,
      detail,
      line
    );
  }

  get vibeRows() {
    return (this.stats.testimonialsByVibe || []).map((row) => ({
      key: row.vibe,
      vibe: row.vibe,
      approved: formatCount(row.approved)
    }));
  }

  get hasApproved() {
    return (this.stats.testimonialsApproved || 0) > 0;
  }

  get approvedTotal() {
    return formatCount(this.stats.testimonialsApproved);
  }

  get apexGroups() {
    return APEX_GROUPS.map((group) => ({
      key: group.name,
      name: group.name,
      tests: formatCount(group.tests)
    }));
  }

  get jestGroups() {
    return JEST_GROUPS.map((group) => ({
      key: group.name,
      name: group.name,
      tests: formatCount(group.tests)
    }));
  }

  get apexGroupsTotal() {
    return formatCount(totalOf(APEX_GROUPS));
  }

  get jestGroupsTotal() {
    return formatCount(totalOf(JEST_GROUPS));
  }

  get countedOn() {
    return formatDay(COUNTED_ON);
  }
}
