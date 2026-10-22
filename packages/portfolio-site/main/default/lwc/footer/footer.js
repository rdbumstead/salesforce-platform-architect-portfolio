/**
 * @description       : Glass Box footer (Round 4 plan L8, pillar-d-design 3.8). One line:
 *                      copyright, the production deploy badge with a text link fallback, the
 *                      telemetry from FooterController.getSystemSnapshot(), profile links from
 *                      getLinks(), and Back to top. The snapshot is requested only once the
 *                      page has loaded and the browser is idle, so it never delays first paint
 *                      (ADR-014). Every provider word on screen comes from the snapshot data.
 *                      At the same moment one small GraphQL query is timed, and the footer says
 *                      "GraphQL: live, N ms" or "GraphQL: unavailable" (log 155). Never a constant.
 *                      lightning/uiGraphQLApi is imported only at that moment. As a static import it
 *                      put the whole GraphQL engine (about 1.2 MB unminified) into the theme layout
 *                      bundle that every page downloads before first paint (Round 5 WS5).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { LightningElement, wire } from "lwc";
import getLinks from "@salesforce/apex/FooterController.getLinks";
import getSystemSnapshot from "@salesforce/apex/FooterController.getSystemSnapshot";
import { EVENTS, trackEvent } from "c/analyticsService";

const REPO_URL =
  "https://github.com/rdbumstead/salesforce-platform-architect-portfolio";
export const BADGE_URL = `${REPO_URL}/actions/workflows/deploy.yml/badge.svg?branch=main`;
export const ACTIONS_URL = `${REPO_URL}/actions/workflows/deploy.yml`;

/**
 * Loads the GraphQL wire adapter on demand, so the engine is not part of the page bundle.
 * Same module skillNetwork uses (Round 3 plan K5).
 * @returns {Promise<object>} The lightning/uiGraphQLApi module.
 */
function loadGraphqlApi() {
  return import("lightning/uiGraphQLApi");
}

function nowMs() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
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
 * @returns {string} For example "Agentforce: off" or "Gemini: circuit open until 14:05".
 */
export function providerLabel(row) {
  const until = row.circuitOpenUntil ? formatTime(row.circuitOpenUntil) : "";
  const state = until ? `circuit open until ${until}` : row.state;
  return `${row.provider}: ${state}`;
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

  graphqlMs;
  graphqlFailed = false;

  _cancelDeferred;
  _quotaTracked = false;
  _graphqlStartedAt;
  _graphqlAdapter;
  _disconnected = false;

  @wire(getLinks)
  wiredLinks({ data }) {
    this.gitHubUrl = data?.gitHubUrl || null;
    this.linkedInUrl = data?.linkedInUrl || null;
  }

  /**
   * Receives the probe result from the GraphQL adapter.
   * @param {object} result The adapter value, { data, errors }.
   */
  handleGraphqlResult(result) {
    const { data, errors } = result || {};
    if (this._graphqlStartedAt === undefined) {
      return;
    }
    if (errors && errors.length) {
      this.graphqlFailed = true;
      this.graphqlMs = undefined;
    } else if (data) {
      this.graphqlFailed = false;
      this.graphqlMs = Math.round(nowMs() - this._graphqlStartedAt);
    }
  }

  connectedCallback() {
    this._cancelDeferred = whenIdleAfterLoad(() => {
      this.startGraphqlProbe();
      this.loadSnapshot();
    });
  }

  /**
   * Imports the adapter, then drives it through the wire adapter protocol (connect, update)
   * exactly as @wire would. The clock starts when the query is handed over, so the time on
   * screen is the query, not the module download.
   */
  async startGraphqlProbe() {
    try {
      const { gql, graphql } = await loadGraphqlApi();
      if (this._disconnected) {
        return;
      }
      const adapter = new graphql((value) => this.handleGraphqlResult(value));
      this._graphqlAdapter = adapter;
      adapter.connect();
      // The smallest read the guest may make: one Skill__c Id (Round 3 plan K4).
      const query = gql`
        query FooterGraphqlProbe {
          uiapi {
            query {
              Skill__c(first: 1) {
                edges {
                  node {
                    Id
                  }
                }
              }
            }
          }
        }
      `;
      this._graphqlStartedAt = nowMs();
      adapter.update({ query }, {});
    } catch {
      this.graphqlFailed = true;
      this.graphqlMs = undefined;
    }
  }

  disconnectedCallback() {
    this._disconnected = true;
    this._cancelDeferred?.();
    this._graphqlAdapter?.disconnect();
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
