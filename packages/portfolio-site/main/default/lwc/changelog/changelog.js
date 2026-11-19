/**
 * @description       : Recent commits for the Delivery page. Reads the newest GitHub cache row
 *                      through DeliveryController.getRecentCommits and shows its age. Guests never trigger a callout from here.
 *                      The "Simulate an outage" switch (ADR-022) lives in the roadmap card,
 *                      beside its "Last updated" label, and drives both panels through
 *                      c/outageSimulation. This panel listens and re-reads the feed with
 *                      simulate=true, which returns the same cached commits marked
 *                      SIMULATED. While the feed is SIMULATED, c-outage-compare shows above the
 *                      list what the panel would show without resilience and what it does
 *                      with it. DEGRADED means the GitHub circuit breaker is open and does
 *                      not show it. A commit
 *                      link click sends changelog_commit_clicked with its sha.
 *                      An empty feed says "No recent updates found." and a failed read says the
 *                      updates could not be loaded, so an outage never reads as a quiet week.
 *                      Each row reads as a plain update. Merge commits are left out,
 *                      and so is any commit that is only tooling (the ci, build, chore, refactor,
 *                      style and perf types) or that names an internal thing, which isInternal
 *                      decides from two plain lists. A leading type such as "feat(lwc):" becomes a
 *                      tag (Feature, Fix, Docs or Tests) and is taken off the sentence, which then
 *                      starts with a capital. A message with no known type carries the tag
 *                      Update, so every row has a tag. A trailing list of round and finding
 *                      numbers in brackets is taken off. No author is shown. Each date
 *                      is a date only stamp in the visitor's own zone, for example "Nov 18, 2026",
 *                      inside a time element whose datetime is the ISO value and whose title is
 *                      the UTC time. Where the browser cannot format it the UTC date is
 *                      shown with "UTC" written out.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
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
// The tag for a message with no known type, so every row carries one.
export const DEFAULT_TAG = "Update";
// Types that only touch tooling. A commit of one of these is left out of the list.
export const TOOLING_TYPES = [
  "ci",
  "build",
  "chore",
  "refactor",
  "perf",
  "style"
];
// Words that name something only the build knows about. A commit that holds one is left out.
export const INTERNAL_WORDS = [
  "glassops",
  "husky",
  "prettier",
  "eslint",
  "fixtures",
  "test groups",
  "snapshot",
  "worktree",
  "verapdf",
  "harness",
  "pipeline",
  "workflow",
  "scratch org",
  "cache refresh",
  "wave"
];
const INTERNAL_PATTERN = new RegExp(
  `\\b(${INTERNAL_WORDS.map((word) => word.replace(/ /g, "\\s+")).join("|")})\\b`,
  "i"
);
const PREFIX = /^([a-z]+)(\([^)]*\))?!?:\s*(\S.*)$/;
const MERGE_START = /^Merge\b/;
const TRAILING_REFS = /\s*\(([^()]*)\)\s*$/;
const REF_TOKEN = /^(?:R\d+-\d+|F-\d+|ADR-\d+|\d+|to|and)$/;

/**
 * Whether a commit message is a merge. Merges are left out of the list.
 * @param {string} message the first line of a commit message
 * @returns {boolean} true for a merge commit
 */
export function isMerge(message) {
  return MERGE_START.test(message || "");
}

/**
 * The type of a conventional commit message, such as "feat" for "feat(lwc): add a thing".
 * @param {string} message the first line of a commit message
 * @returns {string} the type, or an empty string when the message has none
 */
function typeOf(message) {
  const match = PREFIX.exec(message || "");
  return match ? match[1] : "";
}

/**
 * Whether a commit stays out of the public list: a merge, a commit of a tooling only type,
 * or one that names something only the build knows about.
 * @param {string} message the first line of a commit message
 * @returns {boolean} true when the commit is left out
 */
export function isInternal(message) {
  return (
    isMerge(message) ||
    TOOLING_TYPES.includes(typeOf(message)) ||
    INTERNAL_PATTERN.test(message || "")
  );
}

/**
 * Takes a closing list of round and finding numbers in brackets off the end of a sentence. Any
 * other closing bracket is left alone.
 * @param {string} text a sentence
 * @returns {string} the sentence without the list
 */
export function stripReferences(text) {
  const match = TRAILING_REFS.exec(text);
  if (!match) {
    return text;
  }
  const tokens = match[1].split(/[\s,]+/).filter(Boolean);
  if (!tokens.length || !tokens.every((token) => REF_TOKEN.test(token))) {
    return text;
  }
  return text.slice(0, match.index);
}

/**
 * Splits a message such as "feat(lwc): give the page an intro" into a tag and a sentence.
 * A message with no known type keeps its words and carries the tag Update.
 * @param {string} message the first line of a commit message
 * @returns {{tag: string, text: string}} the tag and the sentence, which starts with a capital
 */
export function parseMessage(message) {
  const text = message || "";
  const match = PREFIX.exec(text);
  const type = match ? match[1] : "";
  const known = Boolean(TAGS[type]) || TOOLING_TYPES.includes(type);
  const clean = stripReferences(known ? match[3] : text).trim();
  return {
    tag: text ? TAGS[type] || DEFAULT_TAG : "",
    text: known ? clean.charAt(0).toUpperCase() + clean.slice(1) : clean
  };
}

const STATUS_BADGES = {
  SIMULATED: {
    label: "Simulated",
    className: "pill status-badge badge-simulated"
  },
  DEGRADED: {
    label: "Degraded",
    className: "pill status-badge badge-degraded"
  }
};

export const STATUS_NOTES = {
  SIMULATED:
    "Simulated outage. These are the last cached commits, and no call was made to GitHub.",
  DEGRADED:
    "GitHub is not answering right now. These are the last commits we saved."
};

const UTC_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

function toDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A Datetime from Apex (an ISO 8601 string) as a date in UTC with the zone written out,
 * such as "Nov 18, 2026 UTC". Returns "" for a missing or unreadable value.
 * @param {string} value ISO 8601 date time
 * @returns {string} the UTC date
 */
export function formatDateUtc(value) {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  return `${UTC_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} UTC`;
}

/**
 * A Datetime from Apex as a date only stamp in the visitor's own zone, such as
 * "Nov 18, 2026". Where Intl cannot format it the UTC date with "UTC" written out
 * is returned, so a date is never shown without its zone. Returns "" for a missing or
 * unreadable value.
 * @param {string} value ISO 8601 date time
 * @returns {string} the local date
 */
export function formatDate(value) {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(date);
  } catch {
    return formatDateUtc(value);
  }
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
      .filter((item) => !isInternal(item.message))
      .map((item) => {
        const parsed = parseMessage(item.message);
        const when = toDate(item.committedAt);
        return {
          sha: item.sha,
          shortSha: shortSha(item.sha),
          tag: parsed.tag,
          message: parsed.text,
          url: item.url,
          date: formatDate(item.committedAt),
          dateIso: when ? when.toISOString() : "",
          dateTitle: formatDateUtc(item.committedAt),
          linkLabel: `Open commit ${shortSha(item.sha)} on GitHub`
        };
      });
  }

  get hasCommits() {
    return this.commits.length > 0;
  }

  // A feed that came back with nothing says so. A read that failed says it failed.
  get showEmpty() {
    return !this.hasError && !!this.feed && !this.hasCommits;
  }

  get showFailed() {
    return this.hasError;
  }

  get ageText() {
    return this.status && this.status !== "EMPTY"
      ? ageLabel(this.feed.ageMinutes)
      : "";
  }

  get ageClass() {
    return this.status === "STALE" ? "age-label age-stale" : "age-label";
  }

  // The before and after shows only while the feed itself is SIMULATED, never for DEGRADED.
  get showCompare() {
    return this.status === "SIMULATED";
  }

  get fetchedAt() {
    return this.feed ? this.feed.fetchedAt : undefined;
  }

  get ageMinutes() {
    return this.feed ? this.feed.ageMinutes : undefined;
  }

  get failureThreshold() {
    return this.feed ? this.feed.failureThreshold : undefined;
  }

  get openMinutes() {
    return this.feed ? this.feed.openMinutes : undefined;
  }

  get statusBadge() {
    return STATUS_BADGES[this.status] || null;
  }

  get statusNote() {
    return STATUS_NOTES[this.status] || "";
  }
}
