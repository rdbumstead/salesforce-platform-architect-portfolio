/**
 * @description       : Interactive API reference for the API Lab page (plan K10). Shows the
 *                      SAPI or PAPI OpenAPI spec from the SAPI_Spec and PAPI_Spec static
 *                      resources in Redoc. Redoc_Script loads only when the visitor opens the
 *                      reference. Any load or render failure shows a message and the hosted
 *                      reference link instead.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { LightningElement } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import REDOC_SCRIPT from "@salesforce/resourceUrl/Redoc_Script";
import SAPI_SPEC from "@salesforce/resourceUrl/SAPI_Spec";
import PAPI_SPEC from "@salesforce/resourceUrl/PAPI_Spec";

export const HOSTED_REFERENCE_URL =
  "https://rdbumstead.github.io/salesforce-platform-architect-portfolio/api/oas/salesforce-sapi";

export const SPECS = {
  sapi: { label: "System API (SAPI)", url: SAPI_SPEC },
  papi: { label: "Process API (PAPI)", url: PAPI_SPEC }
};

const SYSTEM_FONTS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO_FONTS = 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace';

/**
 * Redoc options. Nothing here reaches outside the site: system fonts instead of the
 * default web fonts, no download button, native scrollbars inside the component, and
 * telemetry off (Redoc 3 sends traces to Redocly unless disableTelemetry is set).
 */
export const REDOC_OPTIONS = {
  disableTelemetry: true,
  hideDownloadButton: true,
  nativeScrollbars: true,
  scrollYOffset: 0,
  expandResponses: "200",
  theme: {
    typography: {
      fontFamily: SYSTEM_FONTS,
      headings: { fontFamily: SYSTEM_FONTS },
      code: { fontFamily: MONO_FONTS }
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
  selectedSpec = "sapi";
  isOpen = false;
  isLoading = false;
  errorMessage = "";
  redocPromise;
  styleBaseline;

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

  get targetClass() {
    return this.isOpen && !this.errorMessage
      ? "redoc-panel"
      : "redoc-panel slds-hide";
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
    this.renderReference();
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
    this.isLoading = true;
    this.errorMessage = "";
    try {
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
    } catch (error) {
      this.errorMessage = `The interactive reference could not be shown. ${reduceError(
        error
      )}`;
    } finally {
      this.isLoading = false;
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
    element.textContent = text;
    host.appendChild(element);
  }
}
