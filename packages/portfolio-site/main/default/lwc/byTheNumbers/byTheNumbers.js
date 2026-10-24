/**
 * @description       : The numbers panel for the Delivery page. Reads
 *                      PortfolioStatsController.getStats once through the wire service and
 *                      shows each count as text: deploys recorded, the newest deploy's Apex
 *                      tests and org coverage, evaluator tokens issued, and a table of
 *                      testimonials approved and waiting by vibe. The server returns counts
 *                      only, so nothing here can show a record.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
import { LightningElement, wire } from "lwc";
import getStats from "@salesforce/apex/PortfolioStatsController.getStats";

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
 * The newest deploy's test line, or a plain statement when no deploy has a test result.
 * @param {object} stats the server's counts
 * @returns {string} the text
 */
export function testLine(stats) {
  if (!stats || !Number.isFinite(stats.latestTestsRun)) {
    return "No deploy has a test result yet.";
  }
  const passed = Number.isFinite(stats.latestTestsPassed)
    ? stats.latestTestsPassed
    : 0;
  let text = `${formatCount(passed)} of ${formatCount(
    stats.latestTestsRun
  )} Apex tests passed`;
  const coverage = formatPercent(stats.latestCoverage);
  if (coverage) {
    text += `, ${coverage} org coverage`;
  }
  return `${text}.`;
}

export default class ByTheNumbers extends LightningElement {
  stats;
  hasError = false;

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

  get isLoading() {
    return !this.stats && !this.hasError;
  }

  get hasStats() {
    return !!this.stats;
  }

  get deployRuns() {
    return formatCount(this.stats.deployRuns);
  }

  get latestTests() {
    return testLine(this.stats);
  }

  get tokensIssued() {
    return formatCount(this.stats.tokensIssued);
  }

  get vibeRows() {
    return (this.stats.testimonialsByVibe || []).map((row) => ({
      key: row.vibe,
      vibe: row.vibe,
      approved: formatCount(row.approved),
      waiting: formatCount(row.waiting)
    }));
  }

  get approvedTotal() {
    return formatCount(this.stats.testimonialsApproved);
  }

  get waitingTotal() {
    return formatCount(this.stats.testimonialsWaiting);
  }
}
