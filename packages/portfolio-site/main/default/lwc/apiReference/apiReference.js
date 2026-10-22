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
 * Redoc 2.5.4 options. System fonts instead of the default web fonts, no download
 * button, native scrollbars inside the component, and search off because Redoc runs
 * search in a web worker built from a blob URL, which Lightning Web Security may block.
 * The 2.5.4 bundle has no telemetry, so no telemetry option is needed.
 */
export const REDOC_OPTIONS = {
  disableSearch: true,
  hideDownloadButton: true,
  nativeScrollbars: true,
  scrollYOffset: 0,
  expandResponses: "200",
  theme: {
    colors: {
      // No lightened or darkened shades: Redoc's lightened primary was 2.41:1 on white.
      tonalOffset: 0,
      primary: {
        main: REDOC_LINK_COLOR,
        light: REDOC_LINK_COLOR,
        dark: REDOC_LINK_COLOR
      }
    },
    typography: {
      fontFamily: SYSTEM_FONTS,
      headings: { fontFamily: SYSTEM_FONTS },
      code: { fontFamily: MONO_FONTS },
      links: {
        color: REDOC_LINK_COLOR,
        visited: REDOC_LINK_COLOR,
        hover: REDOC_LINK_COLOR
      }
    }
  }
};

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

  disconnectedCallback() {
    this.clearRenderTimeout();
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
    if (!this.styleBaseline) {
      // Style tags present before Redoc first renders are the site's own.
      this.styleBaseline = new Set(document.head.querySelectorAll("style"));
    }
    await new Promise((resolve, reject) => {
      try {
        redoc.init(
          SPECS[this.selectedSpec].url,
          REDOC_OPTIONS,
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
    element.textContent = text;
    host.appendChild(element);
  }
}
