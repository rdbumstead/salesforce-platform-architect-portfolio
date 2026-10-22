/**
 * @description       : The footer's measured GraphQL probe (log 155). One small read, timed from
 *                      the moment this component connects to the first answer, reported to the
 *                      parent as a "probe" event with { ms } or { failed: true }. It lives in its
 *                      own module so the GraphQL adapter stack loads only when the footer asks
 *                      for it after the page is idle, never with the layout before first paint
 *                      (Round 5 WS5, log 203).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { LightningElement, wire } from "lwc";
// Same module skillNetwork uses (Round 3 plan K5). The lint rule prefers lightning/graphql.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { gql, graphql } from "lightning/uiGraphQLApi";

// The smallest read the guest may make: one Skill__c Id (Round 3 plan K4).
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

function nowMs() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

export default class GraphqlProbe extends LightningElement {
  _startedAt;
  _reported = false;

  connectedCallback() {
    this._startedAt = nowMs();
  }

  @wire(graphql, { query: GRAPHQL_PROBE })
  wiredProbe({ data, errors }) {
    if (this._reported) {
      return;
    }
    if (errors && errors.length) {
      this.report({ failed: true });
    } else if (data) {
      this.report({ ms: Math.round(nowMs() - this._startedAt) });
    }
  }

  report(detail) {
    this._reported = true;
    this.dispatchEvent(new CustomEvent("probe", { detail }));
  }
}
