/**
 * @description       : Governance checklist for the Delivery page.
 *                      Reads
 *                      GovernanceController.getPipelineStatus when the page opens and again
 *                      with refreshApex when the tab becomes visible. There is no timer and no
 *                      streaming subscription. The pipeline publishes a platform event, a
 *                      trigger stores it, and this component reads the stored result.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
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
  heartbeat: "Org heartbeat today",
  caches: "Integration caches under 30 minutes old"
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

export function shortSha(sha) {
  return sha ? sha.slice(0, SHORT_SHA_LENGTH) : "";
}

function runEvidence(run) {
  if (!run) {
    return null;
  }
  const short = shortSha(run.commitSha);
  return {
    workflow: run.workflow,
    sha: run.commitSha || "",
    shortSha: short || "run",
    url: run.runUrl || null,
    time: formatTime(run.completedAt),
    linkLabel: `Open the ${run.workflow} run for commit ${short || "unknown"} on GitHub`
  };
}

function cacheEvidence(status) {
  const github = formatTime(status.githubCacheAt);
  const jira = formatTime(status.jiraCacheAt);
  if (!github && !jira) {
    return "";
  }
  return `GitHub cache ${github || "none"}. Jira cache ${jira || "none"}.`;
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
    const cacheText =
      key === "caches" && this.status ? cacheEvidence(this.status) : "";
    const hasEvidence = !!run || !!cacheText;
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
      cacheText
    };
  }

  handleRunClick(event) {
    trackEvent(EVENTS.GOVERNANCE_RUN_LINK_CLICKED, {
      workflow: event.currentTarget.dataset.workflow
    });
  }
}
