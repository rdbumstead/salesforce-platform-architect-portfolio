/**
 * @description       : Recent commits for the Delivery page. Reads the newest GitHub cache row
 *                      through DeliveryController.getRecentCommits and shows its age. Guests never trigger a callout from here.
 *                      The "Simulate an outage" switch (ADR-022) lives in the roadmap card,
 *                      beside its "Last updated" label, and drives both panels through
 *                      c/outageSimulation. This panel listens and re-reads the feed with
 *                      simulate=true, which returns the same cached commits marked
 *                      SIMULATED. DEGRADED means the GitHub circuit breaker is open. A commit
 *                      link click sends changelog_commit_clicked with its sha.
 *                      Each row reads as a plain update. Merge commits are left out. A leading
 *                      type such as "feat(lwc):" becomes a tag (Feature, Fix, Docs or Tests) and
 *                      is taken off the sentence, which then starts with a capital. Other
 *                      conventional types are taken off and carry no tag. No author is shown.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
import getRecentCommits from "@salesforce/apex/DeliveryController.getRecentCommits";
import { trackEvent, EVENTS } from "c/analyticsService";
import { isSimulating, onSimulatingChange } from "c/outageSimulation";

const SHORT_SHA_LENGTH = 7;

// The tag shown for a conventional commit type. A type that is not here carries no tag.
export const TAGS = {
  feat: "Feature",
  fix: "Fix",
  docs: "Docs",
  test: "Tests",
  tests: "Tests"
};
// Types that are taken off the sentence even though they carry no tag.
const UNTAGGED_TYPES = ["ci", "build", "chore", "refactor", "perf", "style"];
const PREFIX = /^([a-z]+)(\([^)]*\))?!?:\s*(\S.*)$/;
const MERGE_START = /^Merge\b/;

/**
 * Whether a commit message is a merge. Merges are left out of the list.
 * @param {string} message the first line of a commit message
 * @returns {boolean} true for a merge commit
 */
export function isMerge(message) {
  return MERGE_START.test(message || "");
}

/**
 * Splits a message such as "feat(lwc): give the page an intro" into a tag and a sentence.
 * @param {string} message the first line of a commit message
 * @returns {{tag: string, text: string}} tag is empty when the type has none or there is no type
 */
export function parseMessage(message) {
  const text = message || "";
  const match = PREFIX.exec(text);
  if (!match) {
    return { tag: "", text };
  }
  const type = match[1];
  const tag = TAGS[type] || "";
  if (!tag && !UNTAGGED_TYPES.includes(type)) {
    return { tag: "", text };
  }
  const rest = match[3];
  return { tag, text: rest.charAt(0).toUpperCase() + rest.slice(1) };
}

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
  stopListening;

  connectedCallback() {
    this.simulate = isSimulating();
    this.stopListening = onSimulatingChange((value) => {
      this.simulate = value;
    });
  }

  disconnectedCallback() {
    if (this.stopListening) {
      this.stopListening();
      this.stopListening = undefined;
    }
  }

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
    return (this.feed.items || [])
      .filter((item) => !isMerge(item.message))
      .map((item) => {
        const parsed = parseMessage(item.message);
        return {
          sha: item.sha,
          shortSha: shortSha(item.sha),
          tag: parsed.tag,
          message: parsed.text,
          url: item.url,
          date: formatDate(item.committedAt),
          linkLabel: `Open commit ${shortSha(item.sha)} on GitHub`
        };
      });
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
