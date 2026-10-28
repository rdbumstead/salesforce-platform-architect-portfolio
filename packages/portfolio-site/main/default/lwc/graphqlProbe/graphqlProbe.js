/**
 * @description       : The footer's measured GraphQL probe. One small read, timed from
 *                      the moment this component is created to the first answer, reported to the
 *                      parent as a "probe" event with { ms } or { failed: true }. It lives in its
 *                      own module so the GraphQL adapter stack loads only when the footer asks
 *                      for it after the page is idle, never with the layout before first paint.
 *                      The data service can answer from records another component already read,
 *                      with no request at all. So the probe watches the browser's resource timing
 *                      from its creation, and an answer that arrives with no GraphQL request
 *                      since then is reported with cached: true. When a request did go out the
 *                      event says cached: false. Where resource timing is missing the event
 *                      carries no cached flag at all.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/22/2026
 **/
import { LightningElement, wire } from "lwc";
// Same module skillNetwork uses, which the site pins. The lint rule prefers lightning/graphql.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { gql, graphql } from "lightning/uiGraphQLApi";

// The smallest read the guest may make: one Skill__c Id.
const GRAPHQL_PROBE = gql`
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

// The data service posts every GraphQL read to .../services/data/vNN.N/graphql.
export const GRAPHQL_REQUEST_PATH = /\/services\/data\/v[\d.]+\/graphql(\?|$)/;

function nowMs() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

/**
 * Starts watching resource timing entries, or returns null where the browser cannot.
 * @param {Function} onEntries Receives each batch of entries.
 * @returns {PerformanceObserver|null} The observer.
 */
function watchRequests(onEntries) {
  try {
    if (typeof PerformanceObserver !== "function") {
      return null;
    }
    const observer = new PerformanceObserver((list) =>
      onEntries(list.getEntries())
    );
    observer.observe({ type: "resource" });
    return observer;
  } catch {
    return null;
  }
}

export default class GraphqlProbe extends LightningElement {
  // Set when the field is created. The engine connects the wire before
  // connectedCallback runs, and a cached answer can arrive in that gap, so a timer started in
  // connectedCallback read as undefined and the footer showed "NaN ms".
  _startedAt = nowMs();
  _entries = [];
  _observer = watchRequests((entries) => {
    this._entries.push(...entries);
  });
  _reported = false;

  @wire(graphql, { query: GRAPHQL_PROBE })
  wiredProbe({ data, errors }) {
    if (this._reported) {
      return;
    }
    if (errors && errors.length) {
      this.report({ failed: true });
    } else if (data) {
      const detail = { ms: Math.round(nowMs() - this._startedAt) };
      const sent = this.sentRequest();
      if (sent !== undefined) {
        detail.cached = !sent;
      }
      this.report(detail);
    }
  }

  disconnectedCallback() {
    this.stopWatching();
  }

  /**
   * Whether a GraphQL request started after this probe was created.
   * @returns {boolean|undefined} undefined when resource timing is not available.
   */
  sentRequest() {
    if (!this._observer) {
      return undefined;
    }
    try {
      const pending =
        typeof this._observer.takeRecords === "function"
          ? this._observer.takeRecords()
          : [];
      const buffered =
        typeof performance.getEntriesByType === "function"
          ? performance.getEntriesByType("resource")
          : [];
      return [...this._entries, ...pending, ...buffered].some(
        (entry) =>
          entry &&
          typeof entry.name === "string" &&
          GRAPHQL_REQUEST_PATH.test(entry.name) &&
          entry.startTime >= this._startedAt
      );
    } catch {
      return undefined;
    }
  }

  stopWatching() {
    if (this._observer) {
      try {
        this._observer.disconnect();
      } catch {
        // Nothing to release.
      }
      this._observer = null;
    }
  }

  report(detail) {
    this._reported = true;
    this.stopWatching();
    this.dispatchEvent(new CustomEvent("probe", { detail }));
  }
}
