/**
 * @description       : Displays source code highlighted through c/prismHighlighter (Round 7
 *                      contract P1), which loads the Prism_JS static resource once per page. A
 *                      language with no grammar is highlighted with clike. If Prism fails to
 *                      load, the code shows as escaped plain text.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, api } from "lwc";
import { loadPrism, highlight } from "c/prismHighlighter";

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
    loadPrism(this).then((prism) => {
      this.prism = prism;
      this.isLoading = false;
      this.paint();
    });
  }

  get languageClass() {
    return `language-${this.language || "none"}`;
  }

  get highlightedHtml() {
    return highlight(this.prism, this._code, this.language);
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
      // c/prismHighlighter returns markup built only from escaped text.
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
