/**
 * @description       : Glass Box footer. One line:
 *                      copyright, the production deploy badge with a text link fallback, the
 *                      telemetry from FooterController.getSystemSnapshot(), profile links from
 *                      getLinks(), and Back to top. The snapshot is requested only once the
 *                      page has loaded and the browser is idle, so it never delays first paint
 *                      (ADR-014). Every provider word on screen comes from the snapshot data.
 *                      At the same moment one small GraphQL query is timed, and the footer says
 *                      "GraphQL: live, N ms" or "GraphQL: unavailable". Never a constant.
 *                      The probe is the c/graphqlProbe child, imported with a literal dynamic import
 *                      only at that moment, so the GraphQL adapter stack is not part of what loads
 *                      before first paint. A statically rendered child, even behind lwc:if, still
 *                      put it in the layout's preloads. The snapshot's
 *                      org quotas (OrgLimits) and the GitHub and Jira breakers show next to
 *                      the AI providers, the GraphQL line shows only a finite time, and a
 *                      Contact link goes to the home page's contact form.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { LightningElement, wire } from "lwc";
import basePath from "@salesforce/community/basePath";
import getLinks from "@salesforce/apex/FooterController.getLinks";
import getSystemSnapshot from "@salesforce/apex/FooterController.getSystemSnapshot";
import { EVENTS, trackEvent } from "c/analyticsService";

const REPO_URL =
  "https://github.com/rdbumstead/salesforce-platform-architect-portfolio";
export const BADGE_URL = `${REPO_URL}/actions/workflows/deploy.yml/badge.svg?branch=main`;
export const ACTIONS_URL = `${REPO_URL}/actions/workflows/deploy.yml`;

/**
 * Local HH:MM for a circuit reopen time.
 * @param {string} value ISO date time from Apex.
 * @returns {string} The time, or an empty string when the value is not a date.
 */
export function formatTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * One provider row's text, built only from the row's own fields.
 * @param {object} row A ContentGenerationController.ProviderStatus.
 * @returns {string} For example "Agentforce: off" or "Gemini: circuit open until 14:05".
 */
export function providerLabel(row) {
  const until = row.circuitOpenUntil ? formatTime(row.circuitOpenUntil) : "";
  const state = until ? `circuit open until ${until}` : row.state;
  return `${row.provider}: ${state}`;
}

/**
 * One integration's breaker text, built only from the row's own fields.
 * @param {object} row A FooterController.IntegrationState.
 * @returns {string} For example "GitHub: circuit closed" or "Jira: circuit open until 14:05".
 */
export function integrationLabel(row) {
  const until = row.open && row.openUntil ? formatTime(row.openUntil) : "";
  if (until) {
    return `${row.label}: circuit open until ${until}`;
  }
  return row.open
    ? `${row.label}: circuit open`
    : `${row.label}: circuit closed`;
}

/**
 * One org quota's text, or null when either number is not a finite number, so a failed or
 * partial read never shows as NaN or a made up 0.
 * @param {object} row A FooterController.OrgQuota.
 * @returns {string|null} For example "API requests today 739 of 5000000".
 */
export function quotaLabel(row) {
  if (!row || !Number.isFinite(row.used) || !Number.isFinite(row.max)) {
    return null;
  }
  return `${row.label} ${row.used} of ${row.max}`;
}

/**
 * Runs the callback once the page has loaded and the browser is idle. Safari has no
 * requestIdleCallback, so it falls back to a single zero delay timeout.
 * @param {Function} callback Work to defer.
 * @returns {Function} Cancels the pending work.
 */
function whenIdleAfterLoad(callback) {
  let cancelIdle = () => {};
  const schedule = () => {
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(callback);
      cancelIdle = () => window.cancelIdleCallback?.(handle);
    } else {
      // One deferred call, not a polling loop (ADR-014 fallback for Safari).
      const handle = setTimeout(callback, 0);
      cancelIdle = () => clearTimeout(handle);
    }
  };
  if (document.readyState === "complete") {
    schedule();
    return () => cancelIdle();
  }
  window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    cancelIdle();
  };
}

export default class Footer extends LightningElement {
  gitHubUrl;
  linkedInUrl;
  badgeFailed = false;
  snapshot;
  snapshotFailed = false;

  badgeUrl = BADGE_URL;
  actionsUrl = ACTIONS_URL;
  // The contact form handles #contact itself.
  contactUrl = `${basePath || ""}/#contact`;

  probeConstructor;
  graphqlMs;
  graphqlFailed = false;

  _cancelDeferred;
  _quotaTracked = false;

  @wire(getLinks)
  wiredLinks({ data }) {
    this.gitHubUrl = data?.gitHubUrl || null;
    this.linkedInUrl = data?.linkedInUrl || null;
  }

  connectedCallback() {
    this._cancelDeferred = whenIdleAfterLoad(() => {
      this.startGraphqlProbe();
      this.loadSnapshot();
    });
  }

  async startGraphqlProbe() {
    try {
      const { default: probe } = await import("c/graphqlProbe");
      this.probeConstructor = probe;
    } catch {
      this.graphqlFailed = true;
      this.graphqlMs = undefined;
    }
  }

  /**
   * The probe's answer: { ms } when the query came back, { failed: true } when it errored.
   * @param {CustomEvent} event The probe event from c/graphqlProbe.
   */
  handleProbe(event) {
    const detail = event.detail || {};
    if (detail.failed) {
      this.graphqlFailed = true;
      this.graphqlMs = undefined;
    } else if (Number.isFinite(detail.ms)) {
      this.graphqlFailed = false;
      this.graphqlMs = detail.ms;
    }
  }

  disconnectedCallback() {
    this._cancelDeferred?.();
  }

  async loadSnapshot() {
    try {
      this.snapshot = await getSystemSnapshot();
      this.snapshotFailed = false;
    } catch {
      this.snapshot = undefined;
      this.snapshotFailed = true;
    }
  }

  get currentYear() {
    return new Date().getFullYear();
  }

  get graphqlLabel() {
    if (this.graphqlFailed) {
      return "GraphQL: unavailable";
    }
    return this.graphqlMs === undefined
      ? null
      : `GraphQL: live, ${this.graphqlMs} ms`;
  }

  get snapshotLoaded() {
    return Boolean(this.snapshot);
  }

  get providerRows() {
    const rows = Array.isArray(this.snapshot?.providers)
      ? [...this.snapshot.providers]
      : [];
    rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return rows.map((row) => ({
      key: row.provider,
      label: providerLabel(row)
    }));
  }

  get integrationRows() {
    const rows = Array.isArray(this.snapshot?.integrations)
      ? this.snapshot.integrations
      : [];
    return rows.map((row) => ({
      key: row.key,
      label: integrationLabel(row)
    }));
  }

  get quotaRows() {
    const rows = Array.isArray(this.snapshot?.orgQuotas)
      ? this.snapshot.orgQuotas
      : [];
    return rows
      .map((row) => ({ key: row.name, label: quotaLabel(row) }))
      .filter((row) => row.label);
  }

  get aiRequestsToday() {
    return this.snapshot?.aiRequestsToday ?? 0;
  }

  get limitRows() {
    const s = this.snapshot || {};
    const kb = (bytes) => Math.round((bytes || 0) / 1024);
    return [
      {
        key: "cpu",
        label: `cpu ${s.cpuTimeMs ?? 0} of ${s.cpuTimeLimitMs ?? 0} ms`
      },
      {
        key: "heap",
        label: `heap ${kb(s.heapBytes)} of ${kb(s.heapLimitBytes)} KB`
      },
      {
        key: "soql",
        label: `soql ${s.soqlQueries ?? 0} of ${s.soqlQueryLimit ?? 0}`
      }
    ];
  }

  handleBadgeError() {
    this.badgeFailed = true;
  }

  handleQuotaVisibility() {
    if (this._quotaTracked) {
      return;
    }
    this._quotaTracked = true;
    trackEvent(EVENTS.FINOPS_QUOTA_VISIBILITY);
  }

  handleBackToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
}
