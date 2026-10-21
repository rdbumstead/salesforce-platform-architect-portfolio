/**
 * @description       : Recent commits for the Delivery page. Reads the newest GitHub cache row
 *                      through DeliveryController.getRecentCommits (plan K3, pillar-e-design
 *                      section 4.3) and shows its age. Guests never trigger a callout from here.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
import getRecentCommits from "@salesforce/apex/DeliveryController.getRecentCommits";

const SHORT_SHA_LENGTH = 7;

const STATUS_BADGES = {
  SIMULATED: { label: "Simulated", className: "status-badge badge-simulated" },
  DEGRADED: { label: "Degraded", className: "status-badge badge-degraded" }
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

  @wire(getRecentCommits)
  wiredCommits({ data, error }) {
    if (data) {
      this.feed = data;
      this.hasError = false;
    } else if (error) {
      this.feed = undefined;
      this.hasError = true;
    }
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
}
