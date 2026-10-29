/**
 * @description       : The live data marker. Placed once beside a data driven section's
 *                      heading, next to View source. It reads DataSourceController for the
 *                      query definitions named in sourceKeys and for the plain objects named in
 *                      objects, and shows "Live from Salesforce" with a short count line such
 *                      as "10 roles, 54 skills". Pressed, it opens a small panel with one plain
 *                      sentence, the sources with their counts, a link to the full
 *                      data model and, when a source object is drawn in the model, a button
 *                      that opens a modal dialog with the diagram of this section only
 *                      (c-schema-visualizer). The dialog follows lwc/viewSource. The button reports aria-expanded, Escape and Close shut the panel
 *                      and focus returns to the button. A failed or empty read hides the counts
 *                      and the sources, and the marker still says the data is live. Every
 *                      visible string is in WORDING below, so the wording is reviewed in one
 *                      place.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/28/2026
 **/
import { LightningElement, api, wire } from "lwc";
import getSources from "@salesforce/apex/DataSourceController.getSources";
import getObjectSources from "@salesforce/apex/DataSourceController.getObjectSources";

/** Every visible string of the marker. Change the wording here and nowhere else. */
export const WORDING = Object.freeze({
  markerLabel: "Live from Salesforce",
  panelHeading: "Live data",
  explanation:
    "This section is not a stored copy. It is rebuilt from my Salesforce records each time the page loads.",
  sourcesHeading: "Where it comes from",
  modelLinkText: "See the full data model",
  sectionModelButton: "See this section's data model",
  sectionModelHeading: "This section's data model",
  closeButton: "Close",
  countSeparator: ", "
});

/** Where the live data model is shown, for anyone who wants to check. */
export const MODEL_PATH = "/portfolio/business-architecture";

/** Counts shown in the button itself. The panel lists all of them. */
export const SUMMARY_LIMIT = 3;

function splitList(text) {
  if (typeof text !== "string") {
    return [];
  }
  const seen = new Set();
  const list = [];
  text.split(",").forEach((part) => {
    const item = part.trim();
    if (item && !seen.has(item.toLowerCase())) {
      seen.add(item.toLowerCase());
      list.push(item);
    }
  });
  return list;
}

/** "Skills" and 54 read "54 skills". A count of one drops a plural s when it is safe. */
export function countText(label, count) {
  let word = String(label || "").toLowerCase();
  if (count === 1 && word.endsWith("s") && !word.endsWith("ss")) {
    word = word.slice(0, -1);
  }
  return `${count} ${word}`;
}

export default class DataSource extends LightningElement {
  /** Comma separated Query_Definition__mdt developer names. */
  @api sourceKeys;
  /** Comma separated plain object API names, for sections with no definition. */
  @api objects;
  /** True for caches where a row count would mislead. Labels still show. */
  @api hideCounts = false;

  definitionRows = [];
  objectRows = [];
  isOpen = false;
  isModelOpen = false;
  panelAtEnd = false;
  panelPlaced = false;
  focusOnRender;

  @wire(getSources, { names: "$definitionNames" })
  wiredDefinitions({ data, error }) {
    this.definitionRows = data && !error && Array.isArray(data) ? data : [];
  }

  @wire(getObjectSources, { objectNames: "$objectNames" })
  wiredObjects({ data, error }) {
    this.objectRows = data && !error && Array.isArray(data) ? data : [];
  }

  get definitionNames() {
    const names = splitList(this.sourceKeys);
    return names.length ? names : undefined;
  }

  get objectNames() {
    const names = splitList(this.objects);
    return names.length ? names : undefined;
  }

  /** Rows with a usable label, one per label, definitions first. */
  get rows() {
    const seen = new Set();
    const rows = [];
    [...this.definitionRows, ...this.objectRows].forEach((row) => {
      if (!row || !row.label || seen.has(row.label)) {
        return;
      }
      seen.add(row.label);
      const counted =
        !this.hideCounts &&
        row.hasCount === true &&
        Number.isInteger(row.count);
      rows.push({
        key: row.name || row.label,
        label: row.label,
        objectName: row.objectName || "",
        inModel: row.inModel === true,
        counted,
        text: counted ? countText(row.label, row.count) : row.label
      });
    });
    return rows;
  }

  /** The distinct objects of rows the model draws, in row order, comma separated. */
  get modelObjects() {
    const seen = new Set();
    this.rows.forEach((row) => {
      if (row.inModel && row.objectName) {
        seen.add(row.objectName);
      }
    });
    return [...seen].join(",");
  }

  get hasModelObjects() {
    return this.modelObjects !== "";
  }

  get hasRows() {
    return this.rows.length > 0;
  }

  get summary() {
    return this.rows
      .filter((row) => row.counted)
      .slice(0, SUMMARY_LIMIT)
      .map((row) => row.text)
      .join(WORDING.countSeparator);
  }

  get hasSummary() {
    return this.summary !== "";
  }

  get wording() {
    return WORDING;
  }

  get modelPath() {
    return MODEL_PATH;
  }

  get expanded() {
    return this.isOpen ? "true" : "false";
  }

  get buttonLabel() {
    return this.hasSummary
      ? `${WORDING.markerLabel}, ${this.summary}`
      : WORDING.markerLabel;
  }

  get panelClass() {
    return this.panelAtEnd ? "panel panel_end" : "panel";
  }

  handleToggle() {
    if (this.isOpen) {
      this.close(true);
    } else {
      this.isOpen = true;
      this.panelAtEnd = false;
      this.panelPlaced = false;
    }
  }

  /**
   * A panel that would run past the right edge of the window opens from the button's right
   * edge instead, as it does for a marker at the end of a title row. On a phone the panel is
   * in the flow under the button, so it is left alone.
   */
  placePanel() {
    const panel = this.template.querySelector(".panel");
    if (!panel) {
      return;
    }
    this.panelPlaced = true;
    if (window.getComputedStyle(panel).position !== "absolute") {
      return;
    }
    const edge = document.documentElement.clientWidth || window.innerWidth;
    if (panel.getBoundingClientRect().right > edge) {
      this.panelAtEnd = true;
    }
  }

  handleClose() {
    this.close(true);
  }

  handleOpenModel() {
    this.isOpen = false;
    this.isModelOpen = true;
    this.focusOnRender = ".dialog-heading";
  }

  handleCloseModel() {
    // The flag goes false first, so the focusout that close() fires is not pulled back.
    this.isModelOpen = false;
    this.focusOnRender = ".marker-button";
    const dialog = this.template.querySelector("dialog");
    if (dialog && dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
  }

  /** The browser's own Escape on a modal dialog: close it our way so focus returns. */
  handleModelCancel(event) {
    event.preventDefault();
    this.handleCloseModel();
  }

  /** A click on the dialog element itself, outside its body, is a click on the backdrop. */
  handleModelClick(event) {
    if (event.target === event.currentTarget) {
      this.handleCloseModel();
    }
  }

  handleModelKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.handleCloseModel();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const first = this.template.querySelector(".model-close-button");
    const active = this.template.activeElement;
    const heading = this.template.querySelector(".dialog-heading");
    if (event.shiftKey && (active === first || active === heading)) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Brings focus back inside the open dialog if it leaves by a route the keys cannot see. */
  handleModelFocusOut(event) {
    const dialog = this.template.querySelector("dialog");
    const next = event.relatedTarget;
    if (!this.isModelOpen || !dialog || (next && dialog.contains(next))) {
      return;
    }
    const first = this.template.querySelector(".model-close-button");
    if (first) {
      first.focus();
    }
  }

  showModelDialog() {
    const dialog = this.template.querySelector("dialog");
    if (!dialog || dialog.open) {
      return;
    }
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  close(returnFocus) {
    this.isOpen = false;
    if (returnFocus) {
      this.focusOnRender = ".marker-button";
    }
  }

  handleKeydown(event) {
    if (event.key === "Escape" && this.isOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    }
  }

  /** Focus leaving the whole marker closes the panel and leaves focus where it went. */
  handleFocusOut(event) {
    const next = event.relatedTarget;
    if (this.isOpen && next && !this.template.contains(next)) {
      this.close(false);
    }
  }

  renderedCallback() {
    if (this.isOpen && !this.panelPlaced) {
      this.placePanel();
    }
    if (this.isModelOpen) {
      this.showModelDialog();
    }
    if (!this.focusOnRender) {
      return;
    }
    const target = this.template.querySelector(this.focusOnRender);
    this.focusOnRender = undefined;
    if (target) {
      target.focus();
    }
  }
}
