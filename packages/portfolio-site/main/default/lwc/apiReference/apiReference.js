/**
 * @description       : Interactive API reference for the API Lab page (plan K10). Shows the
 *                      SAPI or PAPI OpenAPI spec from the SAPI_Spec and PAPI_Spec static
 *                      resources in Redoc. Redoc_Script loads only when the visitor opens the
 *                      reference. Any load or render failure shows a message and the hosted
 *                      reference link instead, and so does a render that has not finished 15 s
 *                      after the visitor opened it (Redoc never finishes under the site runtime
 *                      in WebKit, trap 32). Sends api_reference_opened on open (contract L4).
 *                      On its own page (route Api_Reference, api-lab/reference) the builder
 *                      sets fullWidth and openOnLoad: the reference then fills the page width
 *                      with no height cap and opens without a click, the SAPI and PAPI switch
 *                      staying at the top. There the component carries the page's only h1 and
 *                      the Pillar C intro, so the view needs no header of its own, and the
 *                      open button shows only when the reference is not on screen.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { LightningElement, api } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import REDOC_SCRIPT from "@salesforce/resourceUrl/Redoc_Script";
import SAPI_SPEC from "@salesforce/resourceUrl/SAPI_Spec";
import PAPI_SPEC from "@salesforce/resourceUrl/PAPI_Spec";
import { trackEvent, EVENTS } from "c/analyticsService";
import basePath from "@salesforce/community/basePath";

export const HOSTED_REFERENCE_URL =
  "https://rdbumstead.github.io/salesforce-platform-architect-portfolio/api/oas/salesforce-sapi";

/** How long the visitor waits for Redoc before the page gives up (trap 32). */
export const RENDER_TIMEOUT_MS = 15000;
export const TIMEOUT_MESSAGE =
  "The interactive reference could not load in this browser.";

class RenderTimeoutError extends Error {}

export const SPECS = {
  sapi: { label: "System API (SAPI)", url: SAPI_SPEC },
  papi: { label: "Process API (PAPI)", url: PAPI_SPEC }
};

const SYSTEM_FONTS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO_FONTS = 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace';

/**
 * Link and primary colour inside the Redoc panel. The panel is white in both site themes,
 * so it takes the light accent (L1 --pf-accent light, --pf-btn in both themes), 5.17:1
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
 * colour at 90% opacity on a 5% primary tint, 4.3:1 at 13 px (axe color-contrast, log 299).
 * This darker blue at full opacity is 6.6:1 on that tint.
 */
export const REDOC_CONSTRAINT_COLOR = "#1D4ED8";

/**
 * The bottom edge of the sticky or fixed element at the top of the viewport, the site
 * header, so a section scrolled into view lands below it. 0 when nothing is pinned there.
 * The element is found through every open shadow root, because the header sits inside
 * the theme layout component.
 */
export function headerOffset() {
  try {
    return pinnedBottom();
  } catch {
    // A runtime with no elementFromPoint (a test DOM) has no header to allow for.
    return 0;
  }
}

function pinnedBottom() {
  const x = Math.round(window.innerWidth / 2);
  let element = document.elementFromPoint(x, 2);
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
  return 0;
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
    typography: {
      fontFamily: SYSTEM_FONTS,
      headings: { fontFamily: SYSTEM_FONTS },
      code: { fontFamily: MONO_FONTS },
      links: {
        color: REDOC_LINK_COLOR,
        visited: REDOC_LINK_COLOR,
        hover: REDOC_LINK_COLOR,
        // A link inside text needs more than colour (axe link-in-text-block, log 299).
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
 * Rules added after Redoc's own: a link inside Redoc's text, such as the licence link, is
 * underlined, because colour alone does not mark it (axe link-in-text-block, log 299).
 * The :link and :visited forms outrank the site platform's own link rule, specificity
 * 0,2,2, which otherwise takes the underline away.
 */
export const REDOC_STYLE_OVERRIDES =
  ".redoc-target a[href]:link, .redoc-target a[href]:visited { text-decoration: underline; }";

/** Space left between the header and a section scrolled into view. */
const SECTION_GAP = 8;

/** Redoc scrolls on its own after a menu click; the component settles the result after it. */
const CLICK_SETTLE_MS = 150;

/** The attribute Redoc 2.5.4 marks each section with and looks sections up by. */
const SECTION_ATTRIBUTE = "data-section-id";

// The rendered reference Redoc's section lookups should search, set on each render.
let sectionRoot;
let sectionLookupInstalled = false;

/**
 * Redoc looks its sections up with document.querySelector('[data-section-id="..."]'),
 * which cannot see inside this component's shadow root, so its scroll tracking marked the
 * last item active and rewrote the URL hash to it (audit F5). This lets that one kind of
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

/** An id as the inside of a double quoted CSS attribute value. */
function cssString(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

function reduceError(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error.message === "string") {
    return error.message;
  }
  return "Unknown error";
}

export default class ApiReference extends LightningElement {
  /** Fill the page width with no height cap (the dedicated reference page). */
  @api fullWidth = false;
  /** Open the reference without a click (the dedicated reference page). */
  @api openOnLoad = false;

  selectedSpec = "sapi";
  autoOpened = false;
  isOpen = false;
  isLoading = false;
  errorMessage = "";
  redocPromise;
  styleBaseline;
  renderCount = 0;
  timeoutId;

  hostedUrl = HOSTED_REFERENCE_URL;

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
   * shadow root, so its menu changed the URL and nothing moved (audit F5).
   * @returns {boolean} whether the section was found
   */
  goToSection(id, moveFocus) {
    const section = this.findSection(id);
    if (!section) {
      return false;
    }
    const panel = this.template.querySelector(".redoc-panel");
    const gap = SECTION_GAP;
    if (!this.fullWidth && panel && panel.scrollHeight > panel.clientHeight) {
      // Boxed layout: the panel scrolls, not the page.
      panel.scrollTop +=
        section.getBoundingClientRect().top -
        panel.getBoundingClientRect().top -
        gap;
    } else {
      const offset = this.sectionOffset();
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
    return headerOffset() + (toggle ? toggle.offsetHeight : 0) + SECTION_GAP;
  }

  /** A click on a Redoc menu item or an in page link: let Redoc update, then scroll. */
  handleRedocClick(event) {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [];
    let id;
    for (const node of path) {
      if (!node || node.nodeType !== 1) {
        continue;
      }
      if (node.dataset && node.dataset.itemId) {
        id = node.dataset.itemId;
        break;
      }
      const href = node.getAttribute && node.getAttribute("href");
      if (href && href.startsWith("#")) {
        id = decodeURIComponent(href.slice(1));
        break;
      }
    }
    if (id && SECTION_HASH.test(id)) {
      setTimeout(() => this.goToSection(id, true), CLICK_SETTLE_MS);
    }
  }

  /** After a render: pin the switch under the header and honour a deep link. */
  afterRender() {
    const card = this.template.querySelector("article");
    if (card) {
      card.style.setProperty("--reference-sticky-top", `${headerOffset()}px`);
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
      }
    } catch (error) {
      if (renderId !== this.renderCount) {
        return;
      }
      this.errorMessage =
        error instanceof RenderTimeoutError
          ? error.message
          : `The interactive reference could not be shown. ${reduceError(
              error
            )}`;
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
    await new Promise((resolve, reject) => {
      try {
        redoc.init(
          SPECS[this.selectedSpec].url,
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
