/**
 * @description       : Interactive API reference for the API Lab page. Shows the
 *                      SAPI or PAPI OpenAPI spec in Redoc, version 2 by default (the
 *                      SAPI_Spec_V2 and PAPI_Spec_V2 static resources) or version 1, labelled
 *                      deprecated with its sunset policy in one line (SAPI_Spec and PAPI_Spec).
 *                      A link opens on ?version=v2 or ?version=v1, beside ?spec=sapi or
 *                      ?spec=papi, and an unknown version opens v2. Redoc_Script loads only when the visitor opens the
 *                      reference. Any load or render failure shows a message and the hosted
 *                      reference link instead, and so does a render that has not finished 15 s
 *                      after the visitor opened it (Redoc never finishes under the site runtime
 *                      in WebKit). Sends api_reference_opened on open.
 *                      On its own page (route Api_Reference, api-lab/reference) the builder
 *                      sets fullWidth and openOnLoad: the reference then fills the page width
 *                      with no height cap and opens without a click, the SAPI and PAPI switch
 *                      staying at the top. There the component carries the page's only h1 and
 *                      the Pillar C intro, so the view needs no header of its own, and the
 *                      open button shows only when the reference is not on screen. At desktop
 *                      widths Redoc's menu sticks below the header and the switch, so it stays
 *                      beside the reader. A tag row opens and closes with Redoc's own expand by
 *                      click, Enter or Space and scrolls its intro into view. An operation row
 *                      scrolls its section into view and moves focus there.
 *                      After Redoc renders, a portfolio-reference document event with
 *                      { mounted: true } tells the theme layout, whose floating Back to top
 *                      would sit on Redoc's phone menu button. A failed render or leaving the
 *                      page sends { mounted: false }.
 *                      Under the intro, the Postman collection downloads with a file name
 *                      (the PAPI_Postman_Collection resource), and a Run in Postman link shows
 *                      only while Portfolio_Setting.Postman_Run_Url holds one. Both send their
 *                      event with source reference. A failed load reads as a plain sentence,
 *                      never the platform's raw error.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/21/2026
 **/
import { LightningElement, api, wire } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import REDOC_SCRIPT from "@salesforce/resourceUrl/Redoc_Script";
import SAPI_SPEC from "@salesforce/resourceUrl/SAPI_Spec";
import PAPI_SPEC from "@salesforce/resourceUrl/PAPI_Spec";
import SAPI_SPEC_V2 from "@salesforce/resourceUrl/SAPI_Spec_V2";
import PAPI_SPEC_V2 from "@salesforce/resourceUrl/PAPI_Spec_V2";
import { trackEvent, EVENTS } from "c/analyticsService";
import basePath from "@salesforce/community/basePath";
import POSTMAN_COLLECTION from "@salesforce/resourceUrl/PAPI_Postman_Collection";
import getPostmanRunUrl from "@salesforce/apex/ApiLabController.getPostmanRunUrl";

/** The file name the Postman collection downloads as, the same as on the API Lab. */
export const COLLECTION_FILE_NAME =
  "ryan-bumstead-portfolio-api.postman_collection.json";

/** The source param of the Postman events from this component. */
export const ANALYTICS_SOURCE = "reference";

/** True for an https link on postman.com or getpostman.com, the only Run in Postman links shown. */
export function isPostmanRunUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      /(^|.)(getpostman|postman).com$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export const HOSTED_REFERENCE_URL =
  "https://rdbumstead.github.io/salesforce-platform-architect-portfolio/api/oas/salesforce-sapi";

/** How long the visitor waits for Redoc before the page gives up. */
export const RENDER_TIMEOUT_MS = 15000;
export const TIMEOUT_MESSAGE =
  "The interactive reference could not load in this browser.";

class RenderTimeoutError extends Error {}

/** The document event the theme layout listens for, with { mounted }. */
export const REFERENCE_EVENT = "portfolio-reference";

/**
 * Tells the theme layout whether Redoc is on the page. Never throws.
 * @param {boolean} mounted true once Redoc has rendered, false when it is gone or failed
 */
function announceReference(mounted) {
  try {
    document.dispatchEvent(
      new CustomEvent(REFERENCE_EVENT, { detail: { mounted } })
    );
  } catch {
    // No document. Nothing listens.
  }
}

export const SPECS = {
  sapi: { label: "System API (SAPI)", url: SAPI_SPEC },
  papi: { label: "Process API (PAPI)", url: PAPI_SPEC }
};

/** Each API version, its picker label and the spec resource of each API. v2 is the default. */
export const VERSIONS = {
  v2: {
    label: "v2",
    urls: { sapi: SAPI_SPEC_V2, papi: PAPI_SPEC_V2 }
  },
  v1: {
    label: "v1 (deprecated)",
    urls: { sapi: SAPI_SPEC, papi: PAPI_SPEC }
  }
};
export const DEFAULT_VERSION = "v2";
export const DEPRECATED_VERSION = "v1";

/** The one line shown under the picker while v1 is open. */
export const V1_NOTICE =
  "v1 is deprecated. It stays for one month after v2 reaches production, then answers 410 Gone. Its responses carry Deprecation, Sunset and Link headers.";

const SYSTEM_FONTS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO_FONTS = 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace';

/**
 * Link and primary colour inside the Redoc panel. The panel is white in both site themes,
 * so it takes the light accent (the light --pf-accent, --pf-btn in both themes), 5.17:1
 * on white, never the dark theme accent, which is 2.54:1 there.
 */
export const REDOC_LINK_COLOR = "#2563EB";

/**
 * Response tab text on Redoc's dark code panel (rgb(17,23,26) as rendered). With no
 * tonalOffset Redoc's own reds and greens fall to 3.45:1 and 3.64:1 there, so each tab
 * colour is set from the site's dark palette, every one above 6:1 on that panel.
 */
export const REDOC_TAB_COLORS = {
  success: "#47CD89",
  error: "#F97066",
  redirect: "#FDB022",
  info: "#60A5FA"
};

/**
 * Text of Redoc's constraint chips such as "[ 1 .. 200 ]". Redoc draws them in the primary
 * colour at 90% opacity on a 5% primary tint, 4.3:1 at 13 px (axe color-contrast).
 * This darker blue at full opacity is 6.6:1 on that tint.
 */
export const REDOC_CONSTRAINT_COLOR = "#1D4ED8";

/**
 * Label of the active menu row. Redoc draws it in the primary colour on its sidebar grey
 * darkened for the active row, #ededed for a tag (4.41:1) and #e1e1e1 for a group (3.95:1).
 * This darker blue is 5.72:1 and 5.12:1 there. A tag is active whenever it is open, so the
 * open row needs it.
 */
export const REDOC_ACTIVE_MENU_COLOR = "#1D4ED8";

/**
 * The bottom edge of the sticky or fixed element at the top of the viewport, the site
 * header, so a section scrolled into view lands below it. 0 when nothing is pinned there.
 * The element is found through every open shadow root, because the header sits inside
 * the theme layout component. Where the site's runtime does not let this component open the
 * layout's shadow root, the header's bottom is found by scanning instead (scannedBottom).
 * @param {Element} [host] this component's host element, so the scan can check the element
 *   at the top is a layout the component sits inside
 */
export function headerOffset(host) {
  try {
    return pinnedBottom(host);
  } catch {
    // A runtime with no elementFromPoint (a test DOM) has no header to allow for.
    return 0;
  }
}

/** The tallest header the scan allows for. A taller band is not taken for a header. */
const HEADER_SCAN_LIMIT = 200;

/**
 * The header's bottom when it sits inside a layout component whose shadow root cannot be
 * read: the first point down the viewport's centre line where the element the document
 * reports is no longer that layout. Used only when the element at the top is a custom
 * element with no readable shadow root that holds this component, so a page with no header,
 * or this component's own content at the top, gives 0.
 */
function scannedBottom(x, top, host) {
  const holdsComponent = host ? top !== host && top.contains(host) : true;
  if (!top.tagName.includes("-") || top.shadowRoot || !holdsComponent) {
    return 0;
  }
  for (let y = 3; y <= HEADER_SCAN_LIMIT; y++) {
    if (document.elementFromPoint(x, y) !== top) {
      return y;
    }
  }
  return 0;
}

function pinnedBottom(host) {
  const x = Math.round(window.innerWidth / 2);
  const top = document.elementFromPoint(x, 2);
  let element = top;
  while (element && element.shadowRoot) {
    const inner = element.shadowRoot.elementFromPoint
      ? element.shadowRoot.elementFromPoint(x, 2)
      : null;
    if (!inner || inner === element) {
      break;
    }
    element = inner;
  }
  let node = element;
  while (node) {
    if (node.nodeType === 1) {
      const position = window.getComputedStyle(node).position;
      if (position === "fixed" || position === "sticky") {
        return Math.max(0, Math.round(node.getBoundingClientRect().bottom));
      }
    }
    node = node.parentNode || node.host;
  }
  return top ? scannedBottom(x, top, host) : 0;
}

/**
 * Redoc 2.5.4 options. System fonts instead of the default web fonts, no download
 * button, native scrollbars inside the component, and search off because Redoc runs
 * search in a web worker built from a blob URL, which Lightning Web Security may block.
 * The 2.5.4 bundle has no telemetry, so no telemetry option is needed. scrollYOffset is
 * the site header's height, so Redoc's own active item tracking allows for it.
 */
export const REDOC_OPTIONS = {
  disableSearch: true,
  hideDownloadButton: true,
  nativeScrollbars: true,
  scrollYOffset: headerOffset,
  expandResponses: "200",
  theme: {
    colors: {
      // No lightened or darkened shades: Redoc's lightened primary was 2.41:1 on white.
      tonalOffset: 0,
      primary: {
        main: REDOC_LINK_COLOR,
        light: REDOC_LINK_COLOR,
        dark: REDOC_LINK_COLOR
      },
      responses: {
        success: { tabTextColor: REDOC_TAB_COLORS.success },
        error: { tabTextColor: REDOC_TAB_COLORS.error },
        redirect: { tabTextColor: REDOC_TAB_COLORS.redirect },
        info: { tabTextColor: REDOC_TAB_COLORS.info }
      }
    },
    sidebar: {
      activeTextColor: REDOC_ACTIVE_MENU_COLOR
    },
    typography: {
      fontFamily: SYSTEM_FONTS,
      headings: { fontFamily: SYSTEM_FONTS },
      code: { fontFamily: MONO_FONTS },
      links: {
        color: REDOC_LINK_COLOR,
        visited: REDOC_LINK_COLOR,
        hover: REDOC_LINK_COLOR,
        // A link inside text needs more than colour (axe link-in-text-block).
        textDecoration: "underline",
        hoverTextDecoration: "underline"
      }
    },
    // Redoc appends this CSS to the named styled component.
    extensionsHook: (name) => {
      return name === "ConstraintItem"
        ? `color: ${REDOC_CONSTRAINT_COLOR}; font-weight: 600;`
        : "";
    }
  }
};

/** A Redoc section id the menu and deep links use, such as tag/Skills or operation/getSkills. */
const SECTION_HASH = /^(tag|operation|section|schema)\//;

/**
 * A visible ring on every control Redoc draws (Expand all, Collapse all, Copy, the expand
 * toggles, menu rows, tabs, permalinks and links). Redoc removes the browser outline on most
 * of them. The ring is the site's own token. The panel is light in both themes and
 * .redoc-panel points --pf-accent at --pf-btn, so one rule serves both.
 */
export const REDOC_FOCUS_RULE = [
  ".redoc-target a:focus-visible, .redoc-target button:focus-visible,",
  ".redoc-target [role=button]:focus-visible, .redoc-target [role=tab]:focus-visible,",
  ".redoc-target [role=menuitem]:focus-visible, .redoc-target [tabindex]:focus-visible,",
  ".redoc-target input:focus-visible, .redoc-target select:focus-visible,",
  ".redoc-target textarea:focus-visible, .redoc-target summary:focus-visible",
  " { outline: 2px solid var(--pf-accent, #2563eb) !important; outline-offset: 2px !important; }"
].join("\n");

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

/**
 * Brings Redoc's headings into a sequence under the page's own h1. Redoc has no option for
 * heading levels and draws its own h1 for the spec title. Each heading is read one level
 * deeper than the heading that holds it (h1 as 2, h2 as 3 and so on, to a ceiling of 6)
 * and may rise no more than one level above the heading before it, so no level is skipped. aria-level is set rather than
 * rewriting Redoc's elements, because React owns them.
 * @param {Element} root the Redoc target
 * @param {number} parentLevel level of the component's own heading, 1 on the page, 2 embedded
 */
export function normaliseHeadingLevels(root, parentLevel = 1) {
  if (!root) {
    return;
  }
  let previous = parentLevel;
  root.querySelectorAll(HEADING_SELECTOR).forEach((heading) => {
    const native = Number(heading.tagName.charAt(1));
    const level = Math.min(Math.min(native + parentLevel, 6), previous + 1);
    if (heading.getAttribute("aria-level") !== String(level)) {
      heading.setAttribute("aria-level", String(level));
    }
    previous = level;
  });
}

/**
 * Redoc's permalink anchors carry aria-label set to their own id ("tag/Monitoring"). Each
 * sits inside the heading it points at, so the heading text is the readable name. The
 * anchor stays in the tab order as a permalink.
 * @param {Element} root the Redoc target
 */
export function nameSectionLinks(root) {
  if (!root) {
    return;
  }
  root.querySelectorAll('a[href^="#"][aria-label]').forEach((link) => {
    let id = "";
    try {
      id = decodeURIComponent(link.getAttribute("href").slice(1));
    } catch {
      return;
    }
    if (link.getAttribute("aria-label") !== id) {
      return;
    }
    const heading = link.closest(HEADING_SELECTOR);
    const title = heading ? (heading.textContent || "").trim() : "";
    if (title) {
      link.setAttribute("aria-label", `Link to ${title}`);
    }
  });
}

/**
 * Rules added after Redoc's own: a link inside Redoc's text, such as the licence link, is
 * underlined, because colour alone does not mark it (axe link-in-text-block).
 * The :link and :visited forms outrank the site platform's own link rule, specificity
 * 0,2,2, which otherwise takes the underline away.
 * On its own page at desktop widths, Redoc's sticky menu sits just below the site header and
 * the pinned spec switch (--reference-menu-top, measured after each render) and scrolls on its
 * own, never taller than the viewport below that line. Redoc writes its own top and height
 * inline from scrollYOffset, so these win with !important. Below 50rem Redoc folds the menu
 * behind its own menu button, which these rules leave alone.
 */
export const REDOC_STYLE_OVERRIDES = [
  ".redoc-target a[href]:link, .redoc-target a[href]:visited { text-decoration: underline; }",
  REDOC_FOCUS_RULE,
  "@media (min-width: 50rem) { .redoc-panel_full .menu-content {",
  " top: var(--reference-menu-top, 0px) !important;",
  " height: calc(100vh - var(--reference-menu-top, 0px)) !important; } }"
].join("\n");

/** Space left between the header and a section scrolled into view. */
const SECTION_GAP = 8;

/** Redoc scrolls on its own after a menu click. The component settles the result after it. */
const CLICK_SETTLE_MS = 150;

/**
 * A tag's intro lands this many pixels higher than an operation's. Redoc's scroll tracking
 * keeps a section active only once its top is at or above the header line, and lands its own
 * scrolls 1 px past it, so a tag that lands exactly on the line can lose to the item before it,
 * which closes the tag.
 */
const TAG_NUDGE = 1;

/** The attribute Redoc 2.5.4 marks each section with and looks sections up by. */
const SECTION_ATTRIBUTE = "data-section-id";

// The rendered reference Redoc's section lookups should search, set on each render.
let sectionRoot;
let sectionLookupInstalled = false;

/**
 * Redoc looks its sections up with document.querySelector('[data-section-id="..."]'),
 * which cannot see inside this component's shadow root, so its scroll tracking marked the
 * last item active and rewrote the URL hash to it. This lets that one kind of
 * lookup fall back to the rendered reference when the document finds nothing. Every
 * other query is untouched. If the runtime does not allow it, the component's own
 * scrolling still works.
 */
export function installSectionLookup() {
  if (sectionLookupInstalled) {
    return;
  }
  sectionLookupInstalled = true;
  try {
    const original = document.querySelector;
    document.querySelector = function querySelector(selector) {
      const hit = original.call(this, selector);
      if (
        hit ||
        typeof selector !== "string" ||
        !selector.startsWith(`[${SECTION_ATTRIBUTE}=`) ||
        !sectionRoot
      ) {
        return hit;
      }
      const root = sectionRoot();
      return root ? root.querySelector(selector) : null;
    };
  } catch {
    sectionLookupInstalled = false;
  }
}

/** How many React fibers disposePreviousRedoc looks through before it gives up. */
const FIBER_SEARCH_LIMIT = 400;

/**
 * Redoc 2.5.4's init renders a new React root into the element on every call and never
 * unmounts the one before (its destroy makes yet another root and unmounts that). So after a
 * spec switch the previous spec's store keeps its window scroll listener. Its scroll tracking
 * cannot find its own sections any more, runs to its last menu item and writes that item's id
 * into the URL hash. This finds that store through the element's React root and disposes it,
 * which removes the listener. It does nothing when no earlier render is found.
 * @returns {boolean} whether a store was disposed
 */
export function disposePreviousRedoc(element) {
  try {
    const key = Object.keys(element).find((name) =>
      name.startsWith("__reactContainer$")
    );
    const stack = key && element[key] ? [element[key]] : [];
    for (let seen = 0; stack.length && seen < FIBER_SEARCH_LIMIT; seen++) {
      const fiber = stack.pop();
      const store = fiber.memoizedProps && fiber.memoizedProps.store;
      if (store && store.menu && typeof store.dispose === "function") {
        store.dispose();
        return true;
      }
      if (fiber.sibling) {
        stack.push(fiber.sibling);
      }
      if (fiber.child) {
        stack.push(fiber.child);
      }
    }
  } catch {
    // An unexpected shape is left alone. Only the hash after a spec switch is affected.
  }
  return false;
}

/** An id as the inside of a double quoted CSS attribute value. */
function cssString(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

/** The platform's own wording when it could not read an answer. Never shown. */
const RAW_ERROR = /failed to get error from response|^unknown error$/i;

/**
 * The cause of a failed load or render as a plain sentence, or "" when the error carries none
 * a visitor can use (a script load failure arrives as an event with no message). Never the
 * platform's "Failed to get error from response".
 */
export function reduceError(error) {
  let message = "";
  if (typeof error === "string") {
    message = error;
  } else if (error && typeof error.message === "string") {
    message = error.message;
  }
  message = message.trim();
  return message && !RAW_ERROR.test(message) ? message : "";
}

export default class ApiReference extends LightningElement {
  /** Fill the page width with no height cap (the dedicated reference page). */
  @api fullWidth = false;
  /** Open the reference without a click (the dedicated reference page). */
  @api openOnLoad = false;

  selectedSpec = "sapi";
  selectedVersion = DEFAULT_VERSION;
  autoOpened = false;
  isOpen = false;
  isLoading = false;
  errorMessage = "";
  redocPromise;
  styleBaseline;
  renderCount = 0;
  timeoutId;

  hostedUrl = HOSTED_REFERENCE_URL;
  collectionUrl = POSTMAN_COLLECTION;
  collectionFileName = COLLECTION_FILE_NAME;
  /** The Run in Postman link from Portfolio_Setting.Postman_Run_Url, "" while it is not set. */
  postmanRunUrl = "";

  /** Anything but a postman.com https link keeps the button hidden. */
  @wire(getPostmanRunUrl)
  wiredPostmanRunUrl({ data }) {
    this.postmanRunUrl = isPostmanRunUrl(data) ? data.trim() : "";
  }

  get hasPostmanRun() {
    return isPostmanRunUrl(this.postmanRunUrl);
  }

  handleCollectionDownload() {
    trackEvent(EVENTS.POSTMAN_COLLECTION_DOWNLOADED, {
      source: ANALYTICS_SOURCE
    });
  }

  handlePostmanRun() {
    trackEvent(EVENTS.POSTMAN_RUN_CLICKED, { source: ANALYTICS_SOURCE });
  }

  get specButtons() {
    return Object.keys(SPECS).map((key) => {
      const selected = key === this.selectedSpec;
      return {
        value: key,
        label: SPECS[key].label,
        pressed: selected ? "true" : "false",
        cssClass: selected ? "spec-button spec-button_selected" : "spec-button"
      };
    });
  }

  get versionButtons() {
    return Object.keys(VERSIONS).map((key) => {
      const selected = key === this.selectedVersion;
      return {
        value: key,
        label: VERSIONS[key].label,
        pressed: selected ? "true" : "false",
        cssClass: selected ? "spec-button spec-button_selected" : "spec-button"
      };
    });
  }

  get isDeprecatedVersion() {
    return this.selectedVersion === DEPRECATED_VERSION;
  }

  get versionNotice() {
    return V1_NOTICE;
  }

  get hasError() {
    return Boolean(this.errorMessage);
  }

  get cardClass() {
    return this.fullWidth
      ? "reference-card reference-card_full"
      : "reference-card";
  }

  get apiLabHref() {
    return `${basePath || ""}/api-lab`;
  }

  /**
   * On its own page the reference opens by itself, so the button only shows when it is not
   * on screen: before the first open, or after a failure so the visitor can retry.
   */
  get showOpenButton() {
    return !this.fullWidth || !this.isOpen || this.hasError;
  }

  get bodyClass() {
    return this.fullWidth
      ? "reference-body reference-body_full"
      : "reference-body slds-p-around_medium";
  }

  get targetClass() {
    const panel = this.fullWidth
      ? "redoc-panel redoc-panel_full"
      : "redoc-panel";
    return this.isOpen && !this.errorMessage ? panel : `${panel} slds-hide`;
  }

  renderedCallback() {
    // The Redoc target must be in the DOM before the first render, so the automatic
    // open waits for the first renderedCallback and runs once.
    if (this.openOnLoad && !this.autoOpened) {
      this.autoOpened = true;
      this.handleOpen();
    }
  }

  get openDisabled() {
    return this.isLoading;
  }

  get openLabel() {
    return this.isOpen
      ? "Reload interactive reference"
      : "Open interactive reference";
  }

  handleSpecClick(event) {
    const value = event.currentTarget.dataset.spec;
    if (!SPECS[value] || value === this.selectedSpec) {
      return;
    }
    this.selectedSpec = value;
    if (this.isOpen) {
      this.renderReference();
    }
  }

  handleVersionClick(event) {
    const value = event.currentTarget.dataset.version;
    if (!VERSIONS[value] || value === this.selectedVersion) {
      return;
    }
    this.selectedVersion = value;
    if (this.isOpen) {
      this.renderReference();
    }
  }

  handleOpen() {
    if (this.openDisabled) {
      return;
    }
    this.isOpen = true;
    trackEvent(EVENTS.API_REFERENCE_OPENED, { spec: this.selectedSpec });
    this.renderReference();
  }

  connectedCallback() {
    // ?spec=papi or ?spec=sapi picks the spec a shared link opens on.
    const params = new URLSearchParams(window.location.search || "");
    const spec = (params.get("spec") || "").toLowerCase();
    if (SPECS[spec]) {
      this.selectedSpec = spec;
    }
    // ?version=v1 or ?version=v2 picks the version. Anything else is the default, v2.
    const version = (params.get("version") || "").toLowerCase();
    if (VERSIONS[version]) {
      this.selectedVersion = version;
    }
    this.pendingHash = this.sectionHash();
    this.boundHashChange = () => {
      const hash = this.sectionHash();
      if (hash) {
        this.goToSection(hash, true);
      }
    };
    window.addEventListener("hashchange", this.boundHashChange);
  }

  disconnectedCallback() {
    this.clearRenderTimeout();
    announceReference(false);
    if (this.redocObserver) {
      this.redocObserver.disconnect();
      this.redocObserver = undefined;
    }
    if (this.boundHashChange) {
      window.removeEventListener("hashchange", this.boundHashChange);
    }
  }

  /** The Redoc section named by the URL hash, or undefined. */
  sectionHash() {
    let hash = "";
    try {
      hash = decodeURIComponent((window.location.hash || "").slice(1));
    } catch {
      hash = "";
    }
    return SECTION_HASH.test(hash) ? hash : undefined;
  }

  /** The rendered section for a Redoc id. operation/{id} also finds tag/{tag}/operation/{id}. */
  findSection(id) {
    const target = this.template.querySelector(".redoc-target");
    if (!target || !id) {
      return null;
    }
    const exact = target.querySelector(`[id="${cssString(id)}"]`);
    if (exact) {
      return exact;
    }
    if (id.startsWith("operation/")) {
      return target.querySelector(`[id$="/${cssString(id)}"]`);
    }
    return null;
  }

  /**
   * Scrolls a Redoc section to just below the site header (and the pinned spec switch on
   * its own page), and moves focus to it. Redoc cannot do this itself here: it finds
   * sections with document.querySelector, which cannot see inside this component's
   * shadow root, so its menu changed the URL and nothing moved.
   * @param {string} id the Redoc section id
   * @param {boolean} moveFocus whether focus moves to the section
   * @param {number} [nudge] extra pixels to land the section higher, 0 by default
   * @returns {boolean} whether the section was found
   */
  goToSection(id, moveFocus, nudge = 0) {
    const section = this.findSection(id);
    if (!section) {
      return false;
    }
    const panel = this.template.querySelector(".redoc-panel");
    const gap = SECTION_GAP - nudge;
    if (!this.fullWidth && panel && panel.scrollHeight > panel.clientHeight) {
      // Boxed layout: the panel scrolls, not the page.
      panel.scrollTop +=
        section.getBoundingClientRect().top -
        panel.getBoundingClientRect().top -
        gap;
    } else {
      const offset = this.sectionOffset() - nudge;
      window.scrollTo({
        top: Math.max(
          0,
          window.scrollY + section.getBoundingClientRect().top - offset
        ),
        behavior: "auto"
      });
    }
    if (moveFocus) {
      if (!section.hasAttribute("tabindex")) {
        section.setAttribute("tabindex", "-1");
      }
      section.focus({ preventScroll: true });
    }
    return true;
  }

  /** Header, the pinned spec switch on its own page, and a small gap, in pixels. */
  sectionOffset() {
    const toggle = this.fullWidth
      ? this.template.querySelector(".spec-toggle")
      : null;
    return (
      headerOffset(this.template.host) +
      (toggle ? toggle.offsetHeight : 0) +
      SECTION_GAP
    );
  }

  /** A click on a Redoc menu item or an in page link: let Redoc update, then scroll. */
  handleRedocClick(event) {
    this.settleAfterRedoc(event);
  }

  /**
   * Enter or Space on a focused menu row. Redoc opens or follows the row itself. Space would
   * also scroll the page, so it is cancelled here and the row is settled like a click.
   */
  handleRedocKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const target = event.target;
    if (!target || !target.dataset || !target.dataset.itemId) {
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
    }
    this.settleAfterRedoc(event);
  }

  /**
   * Finds the menu row or in page link an event came from and, once Redoc has handled it,
   * scrolls its section below the header.
   * A tag row (one with operations under it) opens and closes with Redoc's own expand. Once
   * open, its intro is scrolled into view and focus stays on the row, so the operations under
   * it are the next Tab stops. Once closed, nothing scrolls: a scroll would let Redoc's scroll
   * tracking mark the tag active again and reopen it. An operation row or a link moves focus
   * to its section.
   */
  settleAfterRedoc(event) {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [];
    let id;
    let row;
    for (const node of path) {
      if (!node || node.nodeType !== 1) {
        continue;
      }
      if (node.dataset && node.dataset.itemId) {
        id = node.dataset.itemId;
        row = node;
        break;
      }
      const href = node.getAttribute && node.getAttribute("href");
      if (href && href.startsWith("#")) {
        id = decodeURIComponent(href.slice(1));
        break;
      }
    }
    if (!id || !SECTION_HASH.test(id)) {
      return;
    }
    const isTagRow = Boolean(row && row.querySelector(":scope > ul"));
    setTimeout(() => {
      if (!isTagRow) {
        this.goToSection(id, true);
      } else if (row.getAttribute("aria-expanded") !== "false") {
        this.goToSection(id, false, TAG_NUDGE);
      }
    }, CLICK_SETTLE_MS);
  }

  /**
   * After a render: pin the switch under the header, pin Redoc's menu under the switch and
   * honour a deep link.
   */
  afterRender() {
    const card = this.template.querySelector("article");
    if (card) {
      const header = headerOffset(this.template.host);
      const toggle = this.fullWidth
        ? this.template.querySelector(".spec-toggle")
        : null;
      card.style.setProperty("--reference-sticky-top", `${header}px`);
      card.style.setProperty(
        "--reference-menu-top",
        `${header + (toggle ? toggle.offsetHeight : 0)}px`
      );
    }
    const hash = this.pendingHash;
    if (!hash) {
      return;
    }
    if (this.goToSection(hash, true)) {
      this.pendingHash = undefined;
      // Redoc also scrolls to the hash once it has drawn; settle after it.
      setTimeout(() => this.goToSection(hash, true), CLICK_SETTLE_MS * 2);
      return;
    }
    // The section is in the other spec: switch once and try again.
    this.pendingHash = undefined;
    const other = Object.keys(SPECS).find((key) => key !== this.selectedSpec);
    if (other && !this.hashSwitched) {
      this.selectedSpec = other;
      this.pendingHash = hash;
      this.hashSwitched = true;
      this.renderReference();
    }
  }

  clearRenderTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  /** Rejects once the render has taken RENDER_TIMEOUT_MS. One timer, cleared on finish. */
  renderTimeout() {
    this.clearRenderTimeout();
    return new Promise((resolve, reject) => {
      this.timeoutId = setTimeout(() => {
        this.timeoutId = undefined;
        reject(new RenderTimeoutError(TIMEOUT_MESSAGE));
      }, RENDER_TIMEOUT_MS);
    });
  }

  /** Loads Redoc_Script once. A failed load is not cached, so a later click retries. */
  loadRedoc() {
    if (!this.redocPromise) {
      this.redocPromise = loadScript(this, REDOC_SCRIPT)
        .then(() => {
          const redoc = window.Redoc;
          if (!redoc || typeof redoc.init !== "function") {
            throw new Error("Redoc_Script loaded but no Redoc.init was found.");
          }
          return redoc;
        })
        .catch((error) => {
          this.redocPromise = undefined;
          throw error;
        });
    }
    return this.redocPromise;
  }

  async renderReference() {
    const renderId = ++this.renderCount;
    this.isLoading = true;
    this.errorMessage = "";
    try {
      await Promise.race([this.renderSpec(), this.renderTimeout()]);
      if (renderId === this.renderCount) {
        this.afterRender();
        announceReference(true);
      }
    } catch (error) {
      if (renderId !== this.renderCount) {
        return;
      }
      announceReference(false);
      this.errorMessage =
        error instanceof RenderTimeoutError
          ? error.message
          : `The interactive reference could not be shown. ${reduceError(
              error
            )}`.trim();
    } finally {
      if (renderId === this.renderCount) {
        this.clearRenderTimeout();
        this.isLoading = false;
      }
    }
  }

  /** Loads Redoc and renders the selected spec. Resolves when Redoc reports done. */
  async renderSpec() {
    const redoc = await this.loadRedoc();
    const target = this.template.querySelector(".redoc-target");
    if (!target) {
      throw new Error("The reference container is not on the page.");
    }
    sectionRoot = () => this.template.querySelector(".redoc-target");
    installSectionLookup();
    if (!this.styleBaseline) {
      // Style tags present before Redoc first renders are the site's own.
      this.styleBaseline = new Set(document.head.querySelectorAll("style"));
    }
    disposePreviousRedoc(target);
    await new Promise((resolve, reject) => {
      try {
        redoc.init(
          VERSIONS[this.selectedVersion].urls[this.selectedSpec],
          // A number, measured now, so Redoc scrolls a section below the header.
          { ...REDOC_OPTIONS, scrollYOffset: this.sectionOffset() },
          target,
          (error) => (error ? reject(error) : resolve())
        );
      } catch (error) {
        reject(error);
      }
    });
    this.adoptRedocStyles(this.styleBaseline);
    this.watchRedocAccessibility(target);
  }

  /**
   * Heading levels and link names are set after Redoc draws, and again when it draws more
   * (an operation opens). Only attributes are written, which the observer does not watch.
   */
  watchRedocAccessibility(target) {
    const apply = () => {
      normaliseHeadingLevels(target, this.fullWidth ? 1 : 2);
      nameSectionLinks(target);
    };
    apply();
    if (this.redocObserver) {
      this.redocObserver.disconnect();
    }
    if (typeof MutationObserver === "function") {
      this.redocObserver = new MutationObserver(apply);
      this.redocObserver.observe(target, { childList: true, subtree: true });
    }
  }

  /**
   * Redoc styles its markup with style tags it adds to document.head, which do not
   * reach inside this component's shadow root. Copy the rules of every style tag
   * added since before the first render into a style element next to the rendered
   * reference. The rules are
   * read from the CSSOM because styled-components inserts them with insertRule and
   * leaves the tag text empty.
   */
  adoptRedocStyles(baseline) {
    const host = this.template.querySelector(".redoc-styles");
    if (!host) {
      return;
    }
    const added = Array.from(document.head.querySelectorAll("style")).filter(
      (style) => !baseline.has(style)
    );
    const text = added
      .map((style) => {
        let rules = "";
        try {
          rules = Array.from((style.sheet && style.sheet.cssRules) || [])
            .map((rule) => rule.cssText)
            .join("\n");
        } catch {
          rules = "";
        }
        return rules || style.textContent || "";
      })
      .join("\n");
    host.textContent = "";
    const element = document.createElement("style");
    element.textContent = [text, REDOC_STYLE_OVERRIDES].join("\n");
    host.appendChild(element);
  }
}
