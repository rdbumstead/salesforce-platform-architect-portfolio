/**
 * @description       : Project asset gallery. Reads the projects of
 *                      one pillar and their Project_Asset__c rows through the UI API GraphQL wire adapter,
 *                      ordered by Sort_Order__c. The read lives in the
 *                      c/projectAssetGalleryData child, which this component imports dynamically once
 *                      the page has loaded and the browser is idle, so the GraphQL adapter stack stays
 *                      out of its bundle. Until the read settles it holds its heading and a skeleton. Images open full size in a new tab, documents are download
 *                      links, videos and links are external links with no embed. A URL is
 *                      used as is when it is http or https, and resource:<Name>/<path> becomes the site's
 *                      static resource path. Generic, so any project page can reuse it.
 *                      With no assets, or when the read fails, it renders nothing at all,
 *                      no heading and no note.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/22/2026
 **/
import { LightningElement, api } from "lwc";
import basePath from "@salesforce/community/basePath";
import { trackEvent, EVENTS } from "c/analyticsService";
import { onShowMe, revealAnchor } from "c/tourShowMe";

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

export default class ProjectAssetGallery extends LightningElement {
  /** Pillar letter, A to E. */
  @api pillar;
  /** Optional heading shown above the gallery. */
  @api heading;

  assets = [];
  stopShowMe;
  dataConstructor;
  settled = false;
  _cancelDeferred;
  _loadStarted = false;
  _revealPending = false;

  // The tour's stop A names the first image link. The same gallery sits on the Solution
  // Architecture page too, and it answers stop A only. If the data has not been requested
  // yet, the stop starts the load and reveals the link once the cards are on the page.
  connectedCallback() {
    this.stopShowMe = onShowMe("A", () => this.handleShowMe());
    if (this.validPillar) {
      this._cancelDeferred = whenIdleAfterLoad(() => this.loadData());
    }
  }

  disconnectedCallback() {
    if (this._cancelDeferred) {
      this._cancelDeferred();
      this._cancelDeferred = undefined;
    }
    if (this.stopShowMe) {
      this.stopShowMe();
      this.stopShowMe = undefined;
    }
  }

  renderedCallback() {
    if (this._revealPending && this.hasAssets) {
      this._revealPending = false;
      revealAnchor(this.template);
    }
  }

  get validPillar() {
    return PILLAR_PATTERN.test(this.pillar || "");
  }

  handleShowMe() {
    if (this.hasAssets) {
      revealAnchor(this.template);
      return;
    }
    if (!this.settled && this.validPillar) {
      this._revealPending = true;
      this.loadData();
    }
  }

  async loadData() {
    if (this._loadStarted) {
      return;
    }
    this._loadStarted = true;
    try {
      const { default: constructor } =
        await import("c/projectAssetGalleryData");
      this.dataConstructor = constructor;
    } catch {
      // A failed load renders nothing, the same as a failed read.
      this.settle([]);
    }
  }

  handleRead(event) {
    const detail = event.detail || {};
    this.settle(detail.failed ? [] : this.buildAssets(detail.data));
  }

  settle(assets) {
    this.assets = assets;
    this.settled = true;
    if (!assets.length) {
      this._revealPending = false;
    }
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
    const assets = rows.map((row) => this.toAsset(row));
    const firstImage = assets.find((asset) => asset.isImage);
    if (firstImage) {
      firstImage.tourAnchor = "stop-a";
    }
    return assets;
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
      isUnavailable: !url,
      tourAnchor: undefined
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

  /** Waiting for the read: the heading and a skeleton hold the space. */
  get isLoading() {
    return this.validPillar && !this.settled;
  }

  get showGallery() {
    return this.hasAssets || this.isLoading;
  }
}
