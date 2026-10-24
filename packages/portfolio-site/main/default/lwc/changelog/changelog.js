/**
 * @description       : Recent commits for the Delivery page. Reads the newest GitHub cache row
 *                      through DeliveryController.getRecentCommits and shows its age. Guests never trigger a callout from here.
 *                      The "Simulate an outage" switch (ADR-022) re-reads the
 *                      feed with simulate=true, which returns the same cached commits marked
 *                      SIMULATED. DEGRADED means the GitHub circuit breaker is open. A commit
 *                      link click sends changelog_commit_clicked with its sha, and turning
 *                      the switch on sends resilience_test_triggered.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
import getRecentCommits from "@salesforce/apex/DeliveryController.getRecentCommits";
import { trackEvent, EVENTS } from "c/analyticsService";

const SHORT_SHA_LENGTH = 7;

const STATUS_BADGES = {
  SIMULATED: { label: "Simulated", className: "status-badge badge-simulated" },
  DEGRADED: { label: "Degraded", className: "status-badge badge-degraded" }
};

export const STATUS_NOTES = {
  SIMULATED:
    "Simulated outage. These are the last cached commits, and no call was made to GitHub.",
  DEGRADED:
    "GitHub is not answering right now. These are the last commits we saved."
};

/**
 * Formats a Datetime from Apex (an ISO 8601 string) as YYYY-MM-DD in UTC, so the
 * date does not shift with the visitor's time zone.
 */
export function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

export function ageLabel(ageMinutes) {
  if (ageMinutes === null || ageMinutes === undefined) {
    return "";
  }
  return `Last updated ${ageMinutes} min ago`;
}

function shortSha(sha) {
  return sha ? sha.slice(0, SHORT_SHA_LENGTH) : "";
}

export default class Changelog extends LightningElement {
  feed;
  hasError = false;
  simulate = false;

  @wire(getRecentCommits, { simulate: "$simulate" })
  wiredCommits({ data, error }) {
    if (data) {
      this.feed = data;
      this.hasError = false;
    } else if (error) {
      this.feed = undefined;
      this.hasError = true;
    }
  }

  handleSimulateChange(event) {
    this.simulate = event.target.checked;
    if (this.simulate) {
      trackEvent(EVENTS.RESILIENCE_TEST_TRIGGERED, { source: "changelog" });
    }
  }

  handleCommitClick(event) {
    trackEvent(EVENTS.CHANGELOG_COMMIT_CLICKED, {
      sha: event.currentTarget.dataset.sha
    });
  }

  get isLoading() {
    return !this.feed && !this.hasError;
  }

  get status() {
    return this.feed ? this.feed.status : null;
  }

  get commits() {
    if (!this.feed || this.status === "EMPTY") {
      return [];
    }
    return (this.feed.items || []).map((item) => ({
      sha: item.sha,
      shortSha: shortSha(item.sha),
      message: item.message,
      authorName: item.authorName,
      url: item.url,
      date: formatDate(item.committedAt),
      linkLabel: `Open commit ${shortSha(item.sha)} on GitHub`
    }));
  }

  get hasCommits() {
    return this.commits.length > 0;
  }

  get showEmpty() {
    return this.hasError || (!!this.feed && !this.hasCommits);
  }

  get ageText() {
    return this.status && this.status !== "EMPTY"
      ? ageLabel(this.feed.ageMinutes)
      : "";
  }

  get ageClass() {
    return this.status === "STALE" ? "age-label age-stale" : "age-label";
  }

  get statusBadge() {
    return STATUS_BADGES[this.status] || null;
  }

  get statusNote() {
    return STATUS_NOTES[this.status] || "";
  }
}
