/**
 * @description       : Glass Box footer, in the same 1024 px column as the header: copyright,
 *                      one caption over the live readings, the readings in labelled groups,
 *                      the footer links (Skills, Testimonials, Contact, Docs, then the profile
 *                      links from getLinks()), and Back to top.
 *                      Each group is a list named by its visible label (Deploy, Platform,
 *                      Integrations, Quotas and limits), set apart by vertical rules on wide
 *                      screens and stacked on phones. Inside a group the metrics are split by thin
 *                      bars drawn in CSS only, clipped away at the start of every line so none
 *                      dangles when a row wraps, and absent from the markup and the text. Deploy holds the production deploy badge
 *                      with a text link fallback. Platform holds the GraphQL timing, or the
 *                      snapshot error. Integrations holds the AI providers and the GitHub and
 *                      Jira connections, in plain words: "connected", or "paused" while a
 *                      circuit breaker holds calls back. Quotas and limits sits in a closed
 *                      disclosure and holds AI requests today, the org quotas and the governor
 *                      limits, every number grouped by thousands. Platform shows once it has a
 *                      line, the last two once the telemetry from
 *                      FooterController.getSystemSnapshot() has loaded. The snapshot is requested
 *                      only once the page has loaded and the browser is idle, so it never delays
 *                      first paint (ADR-014). Every provider word on screen comes from the
 *                      snapshot data.
 *                      At the same moment one small GraphQL query is timed, and the footer says
 *                      "GraphQL: live, N ms" or "GraphQL: unavailable". When the probe says the
 *                      answer came from the data service cache with no request, the footer
 *                      says so instead of showing a near zero time.
 *                      The probe is the c/graphqlProbe child, imported with a literal dynamic import
 *                      only at that moment, so the GraphQL adapter stack is not part of what loads
 *                      before first paint. A statically rendered child, even behind lwc:if, still
 *                      put it in the layout's preloads. Opening the quotas, or hovering over
 *                      the AI requests line, sends finops_quota_visibility once.
 *                      Back to top sends back_to_top_used, as the header's arrow does.
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
export const CACHED_GRAPHQL_LABEL = "GraphQL: cached, no request made";

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

/**
 * A whole number grouped by thousands, for example 5,000,000.
 * @param {number} value the number
 * @returns {string} the formatted number, "0" when it is not a finite number
 */
export function formatNumber(value) {
  return NUMBER_FORMAT.format(Number.isFinite(value) ? value : 0);
}

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
 * @returns {string} For example "Agentforce: off" or "Gemini: paused until 14:05".
 */
export function providerLabel(row) {
  const until = row.circuitOpenUntil ? formatTime(row.circuitOpenUntil) : "";
  const state = until ? `paused until ${until}` : row.state;
  return `${row.provider}: ${state}`;
}

/**
 * One integration's connection text, built only from the row's own fields. A closed breaker
 * means calls go through, so it reads "connected". An open one holds calls back for a while,
 * so it reads "paused".
 * @param {object} row A FooterController.IntegrationState.
 * @returns {string} For example "GitHub: connected" or "Jira: paused until 14:05".
 */
export function integrationLabel(row) {
  const until = row.open && row.openUntil ? formatTime(row.openUntil) : "";
  if (until) {
    return `${row.label}: paused until ${until}`;
  }
  return row.open ? `${row.label}: paused` : `${row.label}: connected`;
}

/**
 * One org quota's text, or null when either number is not a finite number, so a failed or
 * partial read never shows as NaN or a made up 0.
 * @param {object} row A FooterController.OrgQuota.
 * @returns {string|null} For example "API requests today: 739 of 5,000,000".
 */
export function quotaLabel(row) {
  if (!row || !Number.isFinite(row.used) || !Number.isFinite(row.max)) {
    return null;
  }
  return `${row.label}: ${formatNumber(row.used)} of ${formatNumber(row.max)}`;
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
  skillsUrl = `${basePath || ""}/skills`;
  testimonialsUrl = `${basePath || ""}/testimonials`;
  contactUrl = `${basePath || ""}/contact`;
  docsUrl = `${basePath || ""}/docs`;

  probeConstructor;
  graphqlMs;
  graphqlFailed = false;
  graphqlCached = false;

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
      this.graphqlCached = false;
    } else if (Number.isFinite(detail.ms)) {
      this.graphqlFailed = false;
      this.graphqlMs = detail.ms;
      this.graphqlCached = detail.cached === true;
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
    if (this.graphqlMs === undefined) {
      return null;
    }
    // A cached answer made no request, so its time says nothing about the API.
    return this.graphqlCached
      ? CACHED_GRAPHQL_LABEL
      : `GraphQL: live, ${this.graphqlMs} ms`;
  }

  get snapshotLoaded() {
    return Boolean(this.snapshot);
  }

  get showPlatform() {
    return Boolean(this.graphqlLabel) || this.snapshotFailed;
  }

  get showIntegrations() {
    return this.providerRows.length > 0 || this.integrationRows.length > 0;
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
    return formatNumber(this.snapshot?.aiRequestsToday ?? 0);
  }

  get limitRows() {
    const s = this.snapshot || {};
    const kb = (bytes) => Math.round((bytes || 0) / 1024);
    const of = (used, max) =>
      `${formatNumber(used ?? 0)} of ${formatNumber(max ?? 0)}`;
    return [
      {
        key: "cpu",
        label: `CPU time: ${of(s.cpuTimeMs, s.cpuTimeLimitMs)} ms`
      },
      {
        key: "heap",
        label: `Memory: ${of(kb(s.heapBytes), kb(s.heapLimitBytes))} KB`
      },
      {
        key: "soql",
        label: `Database queries: ${of(s.soqlQueries, s.soqlQueryLimit)}`
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

  handleQuotaToggle(event) {
    if (event.currentTarget.open) {
      this.handleQuotaVisibility();
    }
  }

  handleBackToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    trackEvent(EVENTS.BACK_TO_TOP_USED);
  }
}
