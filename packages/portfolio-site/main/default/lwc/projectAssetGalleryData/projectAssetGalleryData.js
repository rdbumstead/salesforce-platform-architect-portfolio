/**
 * @description       : Data half of the project asset gallery. Reads the projects of one pillar and
 *                      their Project_Asset__c rows through the UI API GraphQL wire adapter and hands
 *                      the result to its parent in a galleryread event, { data } when the read came
 *                      back or { failed: true } when it errored. It renders nothing. The gallery
 *                      imports it with a literal dynamic import after the page has loaded, so the
 *                      GraphQL adapter stack is not part of the gallery's own bundle.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/29/2026
 **/
import { LightningElement, api, wire } from "lwc";
// The site pins lightning/uiGraphQLApi, as skillNetwork does.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { gql, graphql } from "lightning/uiGraphQLApi";

// Reads only fields the guest can read: Name and the required Alt_Text__c and
// Sort_Order__c, plus Type__c and External_URL__c from Portfolio_Guest.
const GALLERY_QUERY = gql`
  query ProjectAssetGallery($pillar: Picklist) {
    uiapi {
      query {
        Project__c(
          where: { Pillar__c: { eq: $pillar } }
          orderBy: { Sort_Order__c: { order: ASC } }
          first: 10
        ) {
          edges {
            node {
              Id
              Name {
                value
              }
              Project_Assets__r(
                orderBy: { Sort_Order__c: { order: ASC } }
                first: 50
              ) {
                edges {
                  node {
                    Id
                    Name {
                      value
                    }
                    Type__c {
                      value
                    }
                    External_URL__c {
                      value
                    }
                    Alt_Text__c {
                      value
                    }
                    Sort_Order__c {
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;
const PILLAR_PATTERN = /^[A-E]$/;

export default class ProjectAssetGalleryData extends LightningElement {
  /** Pillar letter, A to E. */
  @api pillar;

  get variables() {
    return PILLAR_PATTERN.test(this.pillar || "")
      ? { pillar: this.pillar }
      : undefined;
  }

  @wire(graphql, { query: GALLERY_QUERY, variables: "$variables" })
  wiredAssets({ data, errors }) {
    if (errors && errors.length) {
      this.dispatchEvent(
        new CustomEvent("galleryread", { detail: { failed: true } })
      );
      return;
    }
    if (!data) {
      return;
    }
    this.dispatchEvent(new CustomEvent("galleryread", { detail: { data } }));
  }
}
