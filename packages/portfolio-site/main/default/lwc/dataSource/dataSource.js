/**
 * @description       : The live data marker. Placed once beside a data driven section's
 *                      heading, next to View source. It reads DataSourceController for the
 *                      query definitions named in sourceKeys and for the plain objects named in
 *                      objects, and shows "Live from Salesforce" with a short count line such
 *                      as "10 roles, 54 skills". Pressed, it opens a small panel with one plain
 *                      sentence, the sources with their counts and a link to the live data
 *                      model. The button reports aria-expanded, Escape and Close shut the panel
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
  modelLinkText: "See the live data model",
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

  definitionRows = [];
  objectRows = [];
  isOpen = false;
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
      const counted = row.hasCount === true && Number.isInteger(row.count);
      rows.push({
        key: row.name || row.label,
        label: row.label,
        description: row.description || "",
        counted,
        text: counted ? countText(row.label, row.count) : row.label
      });
    });
    return rows;
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

  handleToggle() {
    if (this.isOpen) {
      this.close(true);
    } else {
      this.isOpen = true;
    }
  }

  handleClose() {
    this.close(true);
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
