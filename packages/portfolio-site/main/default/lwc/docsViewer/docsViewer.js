/**
 * @description       : The architecture docs page. Without a doc in the query string it lists
 *                      the documents SourceController.getDocs returns, in three groups: Start
 *                      here, Specifications and Decisions, which is closed until opened. With one, for example
 *                      ?doc=sas, it shows that document from the daily source cache, never
 *                      from a live GitHub call: the title, where it came from, a table of
 *                      contents and the body, which c/docsViewer's docsRenderer builds from
 *                      Marked_Library's tokens without parsing any HTML. A hash in the address
 *                      names a heading, by its slug or by the slug GitHub would give it, and the
 *                      page scrolls to that heading and moves focus to it. Contents links and
 *                      heading anchors do the same and update the address. Opening a document
 *                      sends docs_opened with its key.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
import { LightningElement, wire } from "lwc";
import { CurrentPageReference } from "lightning/navigation";
import { loadScript } from "lightning/platformResourceLoader";
import basePath from "@salesforce/community/basePath";
import MARKED_LIBRARY from "@salesforce/resourceUrl/Marked_Library";
import getDocs from "@salesforce/apex/SourceController.getDocs";
import getDoc from "@salesforce/apex/SourceController.getDoc";
import { trackEvent, EVENTS } from "c/analyticsService";
import { renderMarkdown } from "./docsRenderer";

const DOC_KEY_PATTERN = /^[a-z0-9-]{1,40}$/;
const PHONE_QUERY = "(max-width: 47.99em)";
const SETTLE_MS = 600;

let markedPromise;

/**
 * Loads Marked_Library once per page. A failed load is not cached, so a later call can try
 * again.
 * @param {LightningElement} component the calling component, passed to loadScript
 * @returns {Promise<object>} resolves to window.marked
 */
export function loadMarked(component) {
  if (!markedPromise) {
    markedPromise = loadScript(component, MARKED_LIBRARY)
      .then(() => {
        const marked = window.marked;
        if (!marked || typeof marked.lexer !== "function") {
          throw new Error(
            "Marked_Library loaded but no marked.lexer was found"
          );
        }
        return marked;
      })
      .catch((error) => {
        markedPromise = undefined;
        throw error;
      });
  }
  return markedPromise;
}

/** The doc key from a page reference's state or the address, or "" for the list. */
export function docKeyFrom(pageRef, search) {
  let value = pageRef && pageRef.state ? pageRef.state.doc : undefined;
  if (value === undefined && typeof search === "string") {
    value = new URLSearchParams(search).get("doc");
  }
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  return DOC_KEY_PATTERN.test(key) ? key : "";
}

/** Short badges for the guides, whose keys are too long to read as one. */
const SHORT_BADGES = new Map([
  ["executive-overview", "OVERVIEW"],
  ["program-charter", "CHARTER"],
  ["guardrails", "GUARDRAILS"]
]);

/**
 * The badge for a list row: "ADR-027" for adr-027, "SAS" for sas, "OVERVIEW" for
 * executive-overview. Any other key is shown upper cased.
 */
export function badgeFor(key) {
  const value = String(key || "");
  return SHORT_BADGES.get(value) || value.toUpperCase();
}

/** The three groups of the list, in the order shown. */
export const DOC_GROUPS = Object.freeze([
  { key: "start", label: "Start here", open: true },
  { key: "specifications", label: "Specifications", open: true },
  { key: "decisions", label: "Decisions", open: false }
]);
const START_KEYS = new Set(["executive-overview", "program-charter"]);

/**
 * The group a document belongs to: the architecture decision records are Decisions, the
 * executive overview and the program charter are Start here, and every other document is a
 * Specification, so a document added later is listed without a code change.
 * @param {string} key the doc key, for example adr-027 or sas
 * @returns {string} start, specifications or decisions
 */
export function groupFor(key) {
  const value = String(key || "");
  if (/^adr-/.test(value)) {
    return "decisions";
  }
  return START_KEYS.has(value) ? "start" : "specifications";
}

function docsPath() {
  return `${basePath || ""}/docs`;
}

export function docHref(key, hash) {
  return `${docsPath()}?doc=${encodeURIComponent(key)}${hash ? `#${hash}` : ""}`;
}

function isPhone() {
  try {
    return window.matchMedia(PHONE_QUERY).matches;
  } catch {
    return false;
  }
}

export default class DocsViewer extends LightningElement {
  docKey = "";
  docs = [];
  docsLoaded = false;
  doc;
  docLoaded = false;
  docError = false;
  renderError = false;
  title = "";
  headings = [];
  aliases = new Map();
  marked;
  tocOpen = true;

  _painted = null;
  _pendingHash = null;
  _trackedKey = null;
  _onPopState;

  @wire(CurrentPageReference)
  wiredPageRef(pageRef) {
    this.setDocKey(docKeyFrom(pageRef, window.location.search));
  }

  @wire(getDocs)
  wiredDocs({ data, error }) {
    this.docs = data && !error ? data.filter((d) => d && d.key) : [];
    this.docsLoaded = Boolean(data || error);
    // The list maps links between documents, so a document already shown is built again,
    // and the heading the address names is found again after it.
    if (this._painted) {
      this._pendingHash = this._pendingHash || this.currentHash();
    }
    this._painted = null;
    this.paint();
  }

  @wire(getDoc, { docKey: "$docKey" })
  wiredDoc({ data, error }) {
    if (!this.docKey) {
      return;
    }
    this.doc = data && !error ? data : undefined;
    this.docLoaded = data !== undefined || Boolean(error);
    this.docError = Boolean(error) || (this.docLoaded && !data);
    this._painted = null;
    this._pendingHash = this.currentHash();
  }

  connectedCallback() {
    this.tocOpen = !isPhone();
    this._onPopState = () => {
      this.setDocKey(docKeyFrom(null, window.location.search));
      this._pendingHash = this.currentHash();
      this.scrollToPending();
    };
    window.addEventListener("popstate", this._onPopState);
    if (!this.docKey) {
      this.setDocKey(docKeyFrom(null, window.location.search));
    }
    loadMarked(this)
      .then((marked) => {
        this.marked = marked;
        this._painted = null;
        // marked is not read by the template, so its arrival does not render by itself.
        this.paint();
      })
      .catch(() => {
        this.renderError = true;
      });
  }

  disconnectedCallback() {
    window.removeEventListener("popstate", this._onPopState);
  }

  setDocKey(key) {
    if (key === this.docKey) {
      return;
    }
    this.docKey = key;
    this.doc = undefined;
    this.docLoaded = false;
    this.docError = false;
    this.title = "";
    this.headings = [];
    this._painted = null;
  }

  currentHash() {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#")) {
      return null;
    }
    try {
      return decodeURIComponent(hash.slice(1)) || null;
    } catch {
      return null;
    }
  }

  get showList() {
    return !this.docKey;
  }

  get showDoc() {
    return Boolean(this.docKey);
  }

  get listItems() {
    return this.docs.map((d) => ({
      key: d.key,
      title: d.title,
      badge: badgeFor(d.key),
      href: docHref(d.key)
    }));
  }

  /** The list's groups. A group with no document is left out. */
  get groups() {
    const items = this.listItems;
    return DOC_GROUPS.map((group) => {
      const members = items.filter((i) => groupFor(i.key) === group.key);
      return {
        key: group.key,
        label: group.label,
        isOpenGroup: group.open,
        items: members,
        countLabel: `${members.length} ${members.length === 1 ? "record" : "records"}`
      };
    }).filter((group) => group.items.length > 0);
  }

  get hasDocs() {
    return this.docs.length > 0;
  }

  get listEmpty() {
    return this.docsLoaded && this.docs.length === 0;
  }

  get listHref() {
    return docsPath();
  }

  get isLoading() {
    return this.showDoc && !this.docError && !this.renderError && !this.title;
  }

  get showDocMissing() {
    return this.showDoc && this.docError;
  }

  get showRenderError() {
    return this.showDoc && this.renderError && !this.docError;
  }

  get pageTitle() {
    return this.title || (this.doc && this.doc.title) || "";
  }

  get githubUrl() {
    const url = this.doc && this.doc.htmlUrl;
    return typeof url === "string" && url.startsWith("https://") ? url : null;
  }

  get fetchedLabel() {
    const value = this.doc && this.doc.fetchedAt;
    if (!value) {
      return "";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  get hasToc() {
    return this.tocItems.length > 0;
  }

  get tocItems() {
    return this.headings
      .filter((h) => h.depth === 2 || h.depth === 3)
      .map((h) => ({
        id: h.id,
        text: h.text,
        href: docHref(this.docKey, h.id),
        className: h.depth === 3 ? "toc-item toc-sub" : "toc-item"
      }));
  }

  get isTruncated() {
    return Boolean(this.doc && this.doc.truncated);
  }

  renderedCallback() {
    this.paint();
  }

  /** Fills the manual DOM body once per document, then scrolls to a pending hash. */
  paint() {
    if (!this.showDoc || !this.doc || !this.marked) {
      return;
    }
    const target = this.template.querySelector(".doc-body");
    if (!target) {
      return;
    }
    if (this._painted !== this.doc) {
      this._painted = this.doc;
      const known = new Map(this.docs.map((d) => [d.path, d.key]));
      try {
        const result = renderMarkdown(this.marked, this.doc.content, {
          doc: document,
          baseUrl: this.githubUrl,
          docHrefForPath: (path, hash) => {
            return known.has(path) ? docHref(known.get(path), hash) : null;
          }
        });
        while (target.firstChild) {
          target.removeChild(target.firstChild);
        }
        target.appendChild(result.fragment);
        this.aliases = result.aliases;
        this.headings = result.headings;
        this.title = result.title || this.doc.title || this.docKey;
        this.renderError = false;
      } catch {
        this.renderError = true;
        return;
      }
      if (this._trackedKey !== this.docKey && EVENTS.DOCS_OPENED) {
        this._trackedKey = this.docKey;
        trackEvent(EVENTS.DOCS_OPENED, { doc_key: this.docKey });
      }
    }
    this.scrollToPending();
  }

  scrollToPending() {
    const hash = this._pendingHash;
    if (!hash) {
      return;
    }
    if (this.scrollToHeading(hash)) {
      this._pendingHash = null;
      // The page above the body can still grow after the first scroll, for example while
      // the layout's fonts and images arrive, so the heading is placed once more.
      setTimeout(() => this.settle(hash), SETTLE_MS);
    }
  }

  /** Scrolls to the heading again if the page moved it away from the top since. */
  settle(hash) {
    const id = this.resolveId(hash);
    const heading = id ? this.findHeading(id) : null;
    if (!heading) {
      return;
    }
    const top = heading.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight / 3) {
      heading.scrollIntoView({ block: "start" });
    }
  }

  /** Scrolls to a heading by id or GitHub alias and moves focus to it. */
  scrollToHeading(hash) {
    const id = this.resolveId(hash);
    const heading = id ? this.findHeading(id) : null;
    if (!heading) {
      return false;
    }
    heading.scrollIntoView({ block: "start" });
    heading.focus({ preventScroll: true });
    return true;
  }

  resolveId(hash) {
    if (this.findHeading(hash)) {
      return hash;
    }
    return this.aliases.get(hash) || null;
  }

  findHeading(id) {
    const body = this.template.querySelector(".doc-body");
    if (!body) {
      return null;
    }
    for (const node of body.querySelectorAll(".doc-heading")) {
      if (node.id === id) {
        return node;
      }
    }
    return null;
  }

  /** A click on an in-document link: scroll and focus, and keep the address in step. */
  handleBodyClick(event) {
    const anchor = event.target.closest ? event.target.closest("a") : null;
    if (!anchor || !anchor.dataset || !anchor.dataset.hash) {
      return;
    }
    event.preventDefault();
    this.goToHeading(anchor.dataset.hash);
  }

  /**
   * A contents link. On a phone the contents close first and the scroll waits for that
   * render, because closing them moves every heading up.
   */
  handleTocClick(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.id;
    if (isPhone() && this.tocOpen) {
      this.tocOpen = false;
      this._pendingHash = id;
      this.updateAddress(id);
      return;
    }
    this.goToHeading(id);
  }

  goToHeading(id) {
    if (this.scrollToHeading(id)) {
      this.updateAddress(id);
    }
  }

  updateAddress(id) {
    try {
      window.history.replaceState(
        window.history.state,
        "",
        docHref(this.docKey, id)
      );
    } catch {
      // The address stays as it was. The page still scrolls.
    }
  }

  handleTocToggle(event) {
    this.tocOpen = event.currentTarget.open;
  }
}
