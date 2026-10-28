/**
 * @description       : Governance checklist for the Delivery page.
 *                      Reads
 *                      GovernanceController.getPipelineStatus when the page opens and again
 *                      with refreshApex when the tab becomes visible. There is no timer and no
 *                      streaming subscription. The pipeline publishes a platform event, a
 *                      trigger stores it, and this component reads the stored result.
 *                      Each time shows in the visitor's own time and zone first, for example
 *                      "Oct 24, 8:06 AM EDT", inside a time element whose datetime is the ISO
 *                      value and whose title is the UTC time ("2026-10-24 12:06 UTC"). Where
 *                      the browser cannot format a local time the UTC time is shown instead. A
 *                      missing or unreadable value shows no time. The three items read as plain
 *                      sentences: a production deploy, a daily health check and Jira and GitHub
 *                      data refreshed in the last 30 minutes.
 *                      Each item keeps the height it has once its evidence has loaded, and the
 *                      loading line is read aloud only, so the page below does not move when the
 *                      data arrives.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
import { refreshApex } from "@salesforce/apex";
import getPipelineStatus from "@salesforce/apex/GovernanceController.getPipelineStatus";
import { trackEvent, EVENTS } from "c/analyticsService";

const SHORT_SHA_LENGTH = 7;

const STATES = {
  PASS: { text: "Passed", className: "state state-pass" },
  FAIL: { text: "Failed", className: "state state-fail" },
  STALE: { text: "Out of date", className: "state state-stale" },
  NO_SIGNAL: { text: "No signal yet", className: "state state-none" }
};

const ITEM_LABELS = {
  deploy: "Production deploy green",
  // The server still marks a heartbeat older than 26 hours as out of date.
  heartbeat: "Daily health check passed",
  caches: "Jira and GitHub data refreshed in the last 30 minutes"
};

const ITEM_ORDER = ["deploy", "heartbeat", "caches"];

/**
 * Formats an Apex Datetime (ISO 8601) as "YYYY-MM-DD HH:MM UTC", so the time does not
 * shift with the visitor's time zone. Returns "" for a missing or unreadable value.
 */
export function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * The visitor's own time and short zone name for an Apex Datetime, such as "8:06 AM EDT",
 * from Intl.DateTimeFormat in the browser's zone. Returns "" for a missing or unreadable value
 * or where Intl cannot format it.
 * @param {string} value ISO 8601 date time
 * @returns {string} the local time and zone
 */
export function localTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
      })
        .format(date)
        // Some engines put a narrow no-break space before AM or PM.
        .replace(/\u202f/g, " ")
    );
  } catch {
    return "";
  }
}

/**
 * The visitor's own date, time and short zone name for an Apex Datetime, such as
 * "Oct 24, 8:06 AM EDT". Returns "" for a missing or unreadable value or where Intl cannot
 * format it.
 * @param {string} value ISO 8601 date time
 * @returns {string} the local date and time with the zone
 */
export function localDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
      })
        .format(date)
        // Some engines put a narrow no-break space before AM or PM.
        .replace(/\u202f/g, " ")
    );
  } catch {
    return "";
  }
}

/**
 * The text, the hover title and the machine readable value for one time. The text is the
 * visitor's own time, or the UTC time where a local one cannot be made. The title is always
 * the UTC time.
 * @param {string} value ISO 8601 date time from Apex
 * @returns {{text: string, title: string, iso: string}|null} null for a missing or unreadable value
 */
export function timeView(value) {
  const utc = formatTime(value);
  if (!utc) {
    return null;
  }
  return {
    text: localDateTime(value) || utc,
    title: utc,
    iso: new Date(value).toISOString()
  };
}

export function shortSha(sha) {
  return sha ? sha.slice(0, SHORT_SHA_LENGTH) : "";
}

function runEvidence(run) {
  if (!run) {
    return null;
  }
  const short = shortSha(run.commitSha);
  const time = timeView(run.completedAt);
  return {
    workflow: run.workflow,
    sha: run.commitSha || "",
    shortSha: short || "run",
    url: run.runUrl || null,
    time: time ? time.text : "",
    timeTitle: time ? time.title : "",
    iso: time ? time.iso : "",
    linkLabel: `Open the ${run.workflow} run for commit ${short || "unknown"} on GitHub`
  };
}

/**
 * One line per cache, or an empty list when neither cache has a time.
 * @param {object} status the pipeline status
 * @returns {object[]} rows of { key, lead, text, iso, known }, text and iso empty for "none"
 */
function cacheEvidence(status) {
  const rows = [
    {
      key: "github",
      label: "GitHub cache",
      view: timeView(status.githubCacheAt)
    },
    { key: "jira", label: "Jira cache", view: timeView(status.jiraCacheAt) }
  ];
  if (!rows.some((row) => row.view)) {
    return [];
  }
  return rows.map((row) => ({
    key: row.key,
    // The template drops whitespace between elements, so the space after the label rides
    // in the text itself and the line reads "GitHub cache 2026-..." to a screen reader too.
    lead: `${row.label} `,
    text: row.view ? row.view.text : "",
    title: row.view ? row.view.title : "",
    iso: row.view ? row.view.iso : "",
    known: Boolean(row.view)
  }));
}

export default class SmartChecklist extends LightningElement {
  status;
  hasError = false;
  wiredResult;
  handleVisibilityChange = this.onVisibilityChange.bind(this);

  @wire(getPipelineStatus)
  wiredStatus(result) {
    this.wiredResult = result;
    const { data, error } = result;
    if (data) {
      this.status = data;
      this.hasError = false;
    } else if (error) {
      this.status = undefined;
      this.hasError = true;
    }
  }

  connectedCallback() {
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  disconnectedCallback() {
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange
    );
  }

  onVisibilityChange() {
    if (document.visibilityState !== "visible" || !this.wiredResult) {
      return undefined;
    }
    return refreshApex(this.wiredResult).catch(() => {
      this.hasError = true;
    });
  }

  get isLoading() {
    return !this.status && !this.hasError;
  }

  get items() {
    const byKey = {};
    ((this.status && this.status.items) || []).forEach((item) => {
      byKey[item.key] = item;
    });
    return ITEM_ORDER.map((key) => this.toView(key, byKey[key]));
  }

  toView(key, item) {
    const run = runEvidence(item && item.run);
    const cacheRows =
      key === "caches" && this.status ? cacheEvidence(this.status) : [];
    const hasEvidence = !!run || cacheRows.length > 0;
    // A tick needs the server's PASS and evidence to show. Anything else is never a tick.
    let state = item && STATES[item.state] ? item.state : "NO_SIGNAL";
    if (state === "PASS" && !hasEvidence) {
      state = "NO_SIGNAL";
    }
    const view = STATES[state];
    return {
      key,
      label: ITEM_LABELS[key],
      stateText: view.text,
      stateClass: view.className,
      ticked: state === "PASS",
      run,
      hasRunLink: !!(run && run.url),
      hasRunText: !!(run && !run.url),
      hasRunTime: !!(run && run.iso),
      cacheRows,
      hasCache: cacheRows.length > 0
    };
  }

  handleRunClick(event) {
    trackEvent(EVENTS.GOVERNANCE_RUN_LINK_CLICKED, {
      workflow: event.currentTarget.dataset.workflow
    });
  }
}
