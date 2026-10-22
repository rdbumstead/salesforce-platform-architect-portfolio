/**
 * @description       : Displays source code highlighted with Prism from the Prism_JS static
 *                      resource. Prism loads once per component. If it fails to load, or has no
 *                      grammar for the language, the code shows as escaped plain text.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, api } from "lwc";
import { loadScript, loadStyle } from "lightning/platformResourceLoader";
import PRISM_JS from "@salesforce/resourceUrl/Prism_JS";

// The Prism_JS bundle holds markup, css, clike and javascript only. Apex and Java
// fall back to clike, which covers their keywords, strings and comments.
const FALLBACK_GRAMMAR = "clike";

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default class CodeViewer extends LightningElement {
  @api title = "Source Code";
  @api language = "apex";

  @api
  get code() {
    return this._code;
  }
  set code(value) {
    this._code = value === null || value === undefined ? "" : String(value);
    this.paint();
  }

  _code = "";
  isLoading = true;
  prism;
  prismRequested = false;
  renderedHtml;
  renderedTarget;
  copyMessage = "";

  connectedCallback() {
    this.loadPrism();
  }

  loadPrism() {
    if (this.prismRequested) {
      return;
    }
    this.prismRequested = true;
    Promise.all([
      loadStyle(this, PRISM_JS + "/prism.css"),
      loadScript(this, PRISM_JS + "/prism.js")
    ])
      .then(() => {
        this.prism = window.Prism;
      })
      .catch(() => {
        this.prism = undefined;
      })
      .finally(() => {
        this.isLoading = false;
        this.paint();
      });
  }

  get languageClass() {
    return `language-${this.language || "none"}`;
  }

  get highlightedHtml() {
    const prism = this.prism;
    if (prism && prism.languages && typeof prism.highlight === "function") {
      const name = this.language;
      const grammar =
        prism.languages[name] || prism.languages[FALLBACK_GRAMMAR];
      if (grammar) {
        try {
          return prism.highlight(this._code, grammar, name);
        } catch {
          return escapeHtml(this._code);
        }
      }
    }
    return escapeHtml(this._code);
  }

  renderedCallback() {
    this.paint();
  }

  /**
   * Writes the highlighted (or escaped) code into the manual DOM node. Called after
   * each render, after Prism settles and when the code changes, because none of
   * those paths is guaranteed to re-render the template.
   */
  paint() {
    if (!this.template) {
      return;
    }
    const target = this.template.querySelector("code.code-block");
    if (!target) {
      return;
    }
    const html = this.highlightedHtml;
    if (html !== this.renderedHtml || target !== this.renderedTarget) {
      // Prism encodes the source before wrapping tokens, and the fallback path
      // escapes it, so only markup built from escaped text reaches innerHTML.
      // eslint-disable-next-line @lwc/lwc/no-inner-html
      target.innerHTML = html;
      this.renderedHtml = html;
      this.renderedTarget = target;
    }
  }

  async handleCopy() {
    this.copyMessage = "";
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error("Clipboard access is not available.");
      }
      await navigator.clipboard.writeText(this._code);
      this.copyMessage = "Copied to the clipboard.";
    } catch {
      this.copyMessage = "The code could not be copied.";
    }
  }
}
