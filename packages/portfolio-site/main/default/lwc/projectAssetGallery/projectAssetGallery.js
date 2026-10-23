/**
 * @description       : Project asset gallery. Reads the projects of
 *                      one pillar and their Project_Asset__c rows through the UI API GraphQL wire adapter,
 *                      ordered by Sort_Order__c. Images open full size in a new tab, documents are download
 *                      links, videos and links are external links with no embed. A URL is
 *                      used as is when it is http or https, and resource:<Name>/<path> becomes the site's
 *                      static resource path. Generic, so any project page can reuse it.
 *                      With no assets, or when the read fails, it renders nothing at all,
 *                      no heading and no note.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { LightningElement, api, wire } from "lwc";
// The site pins lightning/uiGraphQLApi, as skillNetwork does.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { gql, graphql } from "lightning/uiGraphQLApi";
import basePath from "@salesforce/community/basePath";
import { trackEvent, EVENTS } from "c/analyticsService";

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
const HTTP_PATTERN = /^https?:\/\//i;
const RESOURCE_PREFIX = "resource:";
const RESOURCE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

function fieldValue(record, field) {
  return record && record[field] ? record[field].value : null;
}

function edgesOf(connection) {
  return connection && Array.isArray(connection.edges)
    ? connection.edges.map((edge) => edge.node).filter(Boolean)
    : [];
}

/**
 * Turns a stored asset URL into a link the browser can open.
 * @param {string} raw External_URL__c as stored.
 * @param {string} sitePath the site's base path, for example "/portfolio".
 * @returns {string|null} the URL, or null when it is blank or not a form this gallery accepts.
 */
export function resolveAssetUrl(raw, sitePath) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return null;
  }
  if (HTTP_PATTERN.test(value)) {
    return value;
  }
  if (value.toLowerCase().startsWith(RESOURCE_PREFIX)) {
    const parts = value.slice(RESOURCE_PREFIX.length).split("/");
    const name = parts.shift();
    if (
      !RESOURCE_NAME_PATTERN.test(name || "") ||
      parts.some((part) => !part || part === "." || part === "..")
    ) {
      return null;
    }
    const path = [name, ...parts.map((part) => encodeURIComponent(part))];
    return `${sitePath || ""}/sfsites/c/resource/${path.join("/")}`;
  }
  return null;
}

export default class ProjectAssetGallery extends LightningElement {
  /** Pillar letter, A to E. */
  @api pillar;
  /** Optional heading shown above the gallery. */
  @api heading;

  assets = [];

  get variables() {
    return PILLAR_PATTERN.test(this.pillar || "")
      ? { pillar: this.pillar }
      : undefined;
  }

  @wire(graphql, { query: GALLERY_QUERY, variables: "$variables" })
  wiredAssets({ data, errors }) {
    // A failed read renders nothing, the same as a pillar with no assets.
    if (errors && errors.length) {
      this.assets = [];
      return;
    }
    if (!data) {
      return;
    }
    this.assets = this.buildAssets(data);
  }

  buildAssets(data) {
    const rows = [];
    edgesOf(data?.uiapi?.query?.Project__c).forEach((project) => {
      edgesOf(project.Project_Assets__r).forEach((asset) => rows.push(asset));
    });
    rows.sort((left, right) => {
      const a = Number(fieldValue(left, "Sort_Order__c"));
      const b = Number(fieldValue(right, "Sort_Order__c"));
      return (Number.isFinite(a) ? a : 0) - (Number.isFinite(b) ? b : 0);
    });
    return rows.map((row) => this.toAsset(row));
  }

  toAsset(row) {
    const type = fieldValue(row, "Type__c") || "Link";
    const name = fieldValue(row, "Name") || "Untitled";
    const url = resolveAssetUrl(fieldValue(row, "External_URL__c"), basePath);
    return {
      key: row.Id,
      type,
      name,
      url,
      altText: fieldValue(row, "Alt_Text__c") || name,
      isImage: type === "Image" && Boolean(url),
      isDocument: type === "Document" && Boolean(url),
      isExternal: (type === "Video" || type === "Link") && Boolean(url),
      isUnavailable: !url
    };
  }

  handleOpen(event) {
    trackEvent(EVENTS.GALLERY_ASSET_OPENED, {
      type: event.currentTarget.dataset.type,
      pillar: this.pillar
    });
  }

  get hasHeading() {
    return Boolean(this.heading);
  }

  /** The gallery renders only when it has something to show. */
  get hasAssets() {
    return this.assets.length > 0;
  }
}
