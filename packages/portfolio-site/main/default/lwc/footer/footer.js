/**
 * @description       : Glass Box footer, in the same 1024 px column as the header: copyright,
 *                      two rows of status, and the footer links (Contact, Docs, then the profile
 *                      links from getLinks()) with Back to top. Skills and Testimonials are in the
 *                      header, not here.
 *                      Row one is CI, one labelled group of workflow badges: the production deploy
 *                      badge, the Live Smoke Test badge and the Postman Sync badge, each linking to
 *                      its Actions page with a text link fallback when the image fails. The badges
 *                      come from the CI_BADGES array, so another is one more entry. GitHub issues a
 *                      badge per workflow, which is why the Postman sync is its own workflow.
 *                      Row two is the live readings. One caption sits over it, with View source
 *                      beside the caption (source key footer: this component and
 *                      FooterController). The readings are labelled groups, each a list named by
 *                      its visible label (Platform, Integrations, Storage, Quotas and limits),
 *                      set apart by vertical rules on wide screens and stacked on phones. Inside
 *                      a group the metrics are split by thin bars drawn in CSS only, clipped away
 *                      at the start of every line so none dangles when a row wraps, and absent
 *                      from the markup and the text. Platform holds the GraphQL timing, or the
 *                      snapshot error. Integrations holds the AI providers and the GitHub and
 *                      Jira connections, in plain words: "connected", or "paused" while a
 *                      circuit breaker holds calls back. Quotas and limits is always open, like
 *                      the other groups, and holds AI requests today, the org quotas and the
 *                      governor limits, every number grouped by thousands. Platform shows once it
 *                      has a line, the last groups once the telemetry from
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
 *                      put it in the layout's preloads. Hovering over the AI requests line
 *                      sends finops_quota_visibility once.
 *                      Back to top sends back_to_top_used, as the header's arrow does.
 *                      Storage sits between Integrations and Quotas and limits once the snapshot
 *                      holds stored figures. It is one line, "Data 1 of 5 MB, Files 5 of 20 MB",
 *                      and a button that opens a small panel grouped by area, not by object:
 *                      the data estimate by area, the files by kind and, only when the server
 *                      returns them, the site's page views. The button carries aria-expanded
 *                      and keeps focus, and Escape closes the panel. Opening it sends
 *                      storage_panel_opened once.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
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
export const SMOKE_BADGE_URL = `${REPO_URL}/actions/workflows/smoke.yml/badge.svg`;
export const SMOKE_ACTIONS_URL = `${REPO_URL}/actions/workflows/smoke.yml`;
export const POSTMAN_BADGE_URL = `${REPO_URL}/actions/workflows/postman-sync.yml/badge.svg`;
export const POSTMAN_ACTIONS_URL = `${REPO_URL}/actions/workflows/postman-sync.yml`;

/**
 * The CI badges, in the order they show. To add another workflow badge, add one entry here.
 * Each needs its own data-id pair so a test or a fallback can find it.
 */
export const CI_BADGES = [
  {
    key: "deploy",
    label: "Production deploy status",
    src: BADGE_URL,
    href: ACTIONS_URL,
    imageId: "badge",
    fallbackId: "badge-fallback"
  },
  {
    key: "smoke",
    label: "Live smoke test status",
    src: SMOKE_BADGE_URL,
    href: SMOKE_ACTIONS_URL,
    imageId: "badge-smoke",
    fallbackId: "badge-fallback-smoke"
  },
  {
    key: "postman",
    label: "Postman collection sync status",
    src: POSTMAN_BADGE_URL,
    href: POSTMAN_ACTIONS_URL,
    imageId: "badge-postman",
    fallbackId: "badge-fallback-postman"
  }
];
export const CACHED_GRAPHQL_LABEL = "GraphQL: cached, no request made";
export const STORAGE_NOTE =
  "Data is an estimate, counted at about 2 KB a record. Salesforce shows exact figures per object only in Setup.";

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
 * A size in kilobytes as KB below 1,024 and MB above.
 * @param {number} kb Kilobytes.
 * @returns {string} For example "24 KB" or "1.5 MB".
 */
export function formatSize(kb) {
  const value = Number.isFinite(kb) ? kb : 0;
  if (value < 1024) {
    return `${formatNumber(value)} KB`;
  }
  return `${(Math.round((value / 1024) * 10) / 10).toLocaleString("en-US")} MB`;
}

/**
 * "1 of 5 MB" from a used and a maximum, or null when either is not a finite number.
 * @param {number} used Megabytes used.
 * @param {number} max Megabytes available.
 * @returns {string|null} The pair, or null.
 */
function storagePair(used, max) {
  if (!Number.isFinite(used) || !Number.isFinite(max)) {
    return null;
  }
  return `${formatNumber(used)} of ${formatNumber(max)} MB`;
}

/**
 * Today's date as the server writes a Date, for example 2026-10-27, in the visitor's time.
 * @returns {string} The date.
 */
function todayKey() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Page views in a day entry, origin and cache together.
 * @param {object} day A StorageSnapshot.TrafficDay.
 * @returns {number} The page views.
 */
function pageViews(day) {
  return (day?.originPageViews || 0) + (day?.cachePageViews || 0);
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
  failedBadges = [];
  snapshot;
  snapshotFailed = false;

  contactUrl = `${basePath || ""}/contact`;
  docsUrl = `${basePath || ""}/docs`;

  probeConstructor;
  graphqlMs;
  graphqlFailed = false;
  graphqlCached = false;

  _cancelDeferred;
  _quotaTracked = false;
  _storageTracked = false;
  storageOpen = false;

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

  get badgeRows() {
    return CI_BADGES.map((badge) => ({
      ...badge,
      failed: this.failedBadges.includes(badge.key)
    }));
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

  get storage() {
    return this.snapshot?.storage || null;
  }

  /** The compact line, or null when neither total was stored. */
  get storageLine() {
    const data = storagePair(this.storage?.dataUsedMb, this.storage?.dataMaxMb);
    const files = storagePair(
      this.storage?.fileUsedMb,
      this.storage?.fileMaxMb
    );
    const parts = [];
    if (data) {
      parts.push(`Data ${data}`);
    }
    if (files) {
      parts.push(`Files ${files}`);
    }
    return parts.length ? parts.join(", ") : null;
  }

  get storageExpanded() {
    return this.storageOpen ? "true" : "false";
  }

  get storagePanelHidden() {
    return !this.storageOpen;
  }

  get storageNote() {
    return STORAGE_NOTE;
  }

  get storageDataRows() {
    const rows = Array.isArray(this.storage?.dataAreas)
      ? this.storage.dataAreas
      : [];
    return rows.map((row) => ({
      key: row.label,
      label: `${row.label}: ${formatNumber(row.records)} ${row.records === 1 ? "record" : "records"}, about ${formatSize(row.kb)}`
    }));
  }

  get storageFileRows() {
    const rows = Array.isArray(this.storage?.fileGroups)
      ? this.storage.fileGroups
      : [];
    return rows.map((row) => ({
      key: row.label,
      label: `${row.label}: ${formatSize(row.kb)}`
    }));
  }

  get hasStorageFiles() {
    return this.storageFileRows.length > 0;
  }

  /** Page view rows, only when the server returned traffic. */
  get storageTrafficRows() {
    const days = Array.isArray(this.storage?.traffic)
      ? this.storage.traffic
      : [];
    if (!days.length) {
      return [];
    }
    const today = days.find((day) => day.day === todayKey());
    const week = days.reduce((total, day) => total + pageViews(day), 0);
    const rows = [];
    if (today) {
      rows.push({
        key: "today",
        label: `Site traffic today: ${formatNumber(pageViews(today))} page views`
      });
    }
    rows.push({
      key: "week",
      label: `Site traffic, last 7 days: ${formatNumber(week)} page views`
    });
    return rows;
  }

  get hasStorageTraffic() {
    return this.storageTrafficRows.length > 0;
  }

  get storageUpdated() {
    const time = formatTime(this.storage?.capturedAt);
    return time ? `Updated ${time}` : "";
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

  handleBadgeError(event) {
    const key = event.target?.dataset?.key;
    if (key && !this.failedBadges.includes(key)) {
      this.failedBadges = [...this.failedBadges, key];
    }
  }

  handleQuotaVisibility() {
    if (this._quotaTracked) {
      return;
    }
    this._quotaTracked = true;
    trackEvent(EVENTS.FINOPS_QUOTA_VISIBILITY);
  }

  handleStorageToggle() {
    this.storageOpen = !this.storageOpen;
    if (this.storageOpen && !this._storageTracked) {
      this._storageTracked = true;
      trackEvent(EVENTS.STORAGE_PANEL_OPENED);
    }
  }

  handleStorageKeydown(event) {
    if (event.key !== "Escape" || !this.storageOpen) {
      return;
    }
    this.storageOpen = false;
    this.template.querySelector('[data-id="storage-toggle"]')?.focus();
  }

  handleBackToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    trackEvent(EVENTS.BACK_TO_TOP_USED);
  }
}
