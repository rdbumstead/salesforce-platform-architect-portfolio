/**
 * @description       : The "View source" control. Placed once near
 *                      a showcase component's heading with a fixed source key. It reads the
 *                      component's files from SourceController.getSourceFiles, which serves a
 *                      cache only, and renders nothing when the key is unknown or the cache is
 *                      empty. Pressed, it opens a native modal dialog in the top layer, with
 *                      the page behind it inert, one tab per file, the file in c-code-viewer
 *                      and its GitHub link. Each tab shows the file label and, under it, a
 *                      type tag worked out from the file's path by describeFile: LWC HTML,
 *                      LWC JavaScript, LWC API module (a JavaScript file with no HTML
 *                      template beside it), LWC CSS, Apex class or Apex trigger. A line
 *                      above the code names the component (c-footer), the API module import
 *                      (c/graphEngine) or the Apex class. Tabs keep the order the cache
 *                      gives them, so files of one component share a name. The panel also
 *                      links "How it's built" to the matching Technical Guide section for
 *                      the keys in GUIDE_SECTIONS. Focus moves into the dialog, Tab stays
 *                      inside it, and Escape or Close returns focus to the button. Opening sends
 *                      view_source_opened with the source key, and choosing another file sends
 *                      view_source_file_selected with the key and the file's label.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/23/2026
 **/
import { LightningElement, api, wire } from "lwc";
import getSourceFiles from "@salesforce/apex/SourceController.getSourceFiles";
import { trackEvent, EVENTS } from "c/analyticsService";

/** Dialog headings for the fixed keys. Any other key shows the key itself. */
export const COMPONENT_LABELS = Object.freeze({
  skillNetwork: "Skill network",
  schemaVisualizer: "Schema visualizer",
  decisionMatrix: "Decision matrix",
  apiTester: "API Lab",
  resumeBuilder: "Resume builder",
  roadmapViewer: "Roadmap viewer",
  footer: "Footer",
  coverLetterGenerator: "Cover letter generator",
  siteAnalytics: "Site analytics"
});

/** Technical Guide section ids, one per source key. A key not listed gets no guide link. */
export const GUIDE_SECTIONS = Object.freeze({
  skillNetwork: "2-1-c-skill-network-visualization",
  resumeBuilder: "2-2-c-resume-builder-resume-generation",
  schemaVisualizer: "2-4-c-schema-visualizer-dynamic-erd-visualizer",
  footer: "2-6-c-footer-glass-box-telemetry",
  siteAnalytics: "2-8-analytics-instrumentation-ga4",
  decisionMatrix: "2-10-project-asset-gallery-and-decision-matrix",
  apiTester: "2-15-api-lab-and-api-reference",
  roadmapViewer: "1-2-jira-integration-roadmap",
  coverLetterGenerator: "2-22-the-cover-letter-page-and-pdf"
});

const LWC_PATH = /\/lwc\/([^/]+)\/([^/]+)$/;

/** resumeBuilder becomes resume-builder. */
function toKebab(folder) {
  return folder.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Works out what a file is from its repository path. allPaths is every path in the dialog,
 * used to tell LWC JavaScript from an API module (no HTML template in its folder).
 * Returns { tag, name, line }, all empty for a path that is none of the known kinds.
 */
export function describeFile(path, allPaths = []) {
  const none = { tag: "", name: "", line: "" };
  if (typeof path !== "string" || !path) {
    return none;
  }
  const lwc = LWC_PATH.exec(path);
  if (lwc) {
    const folder = lwc[1];
    const file = lwc[2];
    const component = `c-${toKebab(folder)}`;
    const entry = (tag) => ({
      tag,
      name: component,
      line: `Component ${component}`
    });
    if (file.endsWith(".html")) {
      return entry("LWC · HTML");
    }
    if (file.endsWith(".css")) {
      return entry("LWC · CSS");
    }
    if (file.endsWith(".js")) {
      const hasTemplate = (allPaths || []).some((other) => {
        const match = LWC_PATH.exec(other || "");
        return match && match[1] === folder && match[2].endsWith(".html");
      });
      if (hasTemplate) {
        return entry("LWC · JavaScript");
      }
      const specifier = `c/${folder}`;
      return {
        tag: "LWC · API module",
        name: specifier,
        line: `API module ${specifier}`
      };
    }
    return none;
  }
  const base = path.split("/").pop();
  if (base.endsWith(".cls")) {
    const name = base.slice(0, -4);
    return { tag: "Apex class", name, line: `Apex class ${name}` };
  }
  if (base.endsWith(".trigger")) {
    const name = base.slice(0, -8);
    return { tag: "Apex trigger", name, line: `Apex trigger ${name}` };
  }
  return none;
}

export default class ViewSource extends LightningElement {
  @api sourceKey;
  /** Text on the opening button. Blank gives "View source". */
  @api label;

  files = [];
  isOpen = false;
  selectedIndex = 0;
  focusOnRender;

  @wire(getSourceFiles, { sourceKey: "$sourceKey" })
  wiredFiles({ data, error }) {
    if (data && !error) {
      this.files = data.filter(
        (file) => file && typeof file.content === "string"
      );
    } else {
      this.files = [];
    }
    if (!this.files.length) {
      this.isOpen = false;
    }
  }

  get buttonLabel() {
    return (this.label || "").trim() || "View source";
  }

  get hasFiles() {
    return this.files.length > 0;
  }

  get heading() {
    return `Source: ${COMPONENT_LABELS[this.sourceKey] || this.sourceKey}`;
  }

  get allPaths() {
    return this.files.map((file) => file.path);
  }

  get selectedLine() {
    return this.selected
      ? describeFile(this.selected.path, this.allPaths).line
      : "";
  }

  get guideHref() {
    const id = GUIDE_SECTIONS[this.sourceKey];
    return id ? `/portfolio/docs?doc=technical-guide#${id}` : "";
  }

  get tabs() {
    return this.files.map((file, index) => {
      const selected = index === this.selectedIndex;
      return {
        key: file.path,
        index,
        label: file.label,
        tag: describeFile(file.path, this.allPaths).tag,
        selected: selected ? "true" : "false",
        tabIndex: selected ? "0" : "-1",
        className: selected ? "tab tab_selected" : "tab"
      };
    });
  }

  get selected() {
    return this.files[this.selectedIndex] || this.files[0];
  }

  get selectedLabel() {
    return this.selected ? this.selected.label : "";
  }

  get githubLabel() {
    return `Open ${this.selectedLabel} on GitHub (opens in a new tab)`;
  }

  get panelLabel() {
    return `${this.selectedLabel} source`;
  }

  get hasGithubLink() {
    return Boolean(this.selected && this.selected.htmlUrl);
  }

  get isTruncated() {
    return Boolean(this.selected && this.selected.truncated);
  }

  handleOpen() {
    this.selectedIndex = 0;
    this.isOpen = true;
    this.focusOnRender = ".dialog-heading";
    trackEvent(EVENTS.VIEW_SOURCE_OPENED, { source_key: this.sourceKey });
  }

  handleClose() {
    // isOpen goes false first, so the focusout that close() fires is not pulled back.
    this.isOpen = false;
    this.focusOnRender = ".view-source-button";
    const dialog = this.template.querySelector("dialog");
    if (dialog && dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
  }

  /** The browser's own Escape on a modal dialog: close it our way so focus returns. */
  handleCancel(event) {
    event.preventDefault();
    this.handleClose();
  }

  /** A click on the dialog element itself, outside its body, is a click on the backdrop. */
  handleDialogClick(event) {
    if (event.target === event.currentTarget) {
      this.handleClose();
    }
  }

  /**
   * Shows the dialog in the browser's top layer, above the sticky header and every
   * stacking context of the page, with the page behind it inert.
   */
  showDialog() {
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

  renderedCallback() {
    if (this.isOpen) {
      this.showDialog();
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

  selectTab(index, moveFocus) {
    const count = this.files.length;
    if (!count) {
      return;
    }
    const previous = this.selectedIndex;
    this.selectedIndex = (index + count) % count;
    if (moveFocus) {
      this.focusOnRender = `.tab[data-index="${this.selectedIndex}"]`;
    }
    if (this.selectedIndex !== previous) {
      trackEvent(EVENTS.VIEW_SOURCE_FILE_SELECTED, {
        source_key: this.sourceKey,
        file_label: this.selectedLabel
      });
    }
  }

  handleTabClick(event) {
    this.selectTab(Number(event.currentTarget.dataset.index), false);
  }

  /** Arrow keys, Home and End move between tabs (the ARIA tabs pattern). */
  handleTabKeydown(event) {
    const current = this.selectedIndex;
    const moves = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: this.files.length - 1
    };
    if (event.key in moves) {
      event.preventDefault();
      this.selectTab(moves[event.key], true);
    }
  }

  /**
   * Catches focus leaving the open dialog by any route the key handler cannot see, such as
   * WebKit's Tab moving from the last stop to the page itself (no related target), and
   * brings it back to the first stop.
   */
  handleDialogFocusOut(event) {
    const dialog = this.template.querySelector("dialog");
    const next = event.relatedTarget;
    if (!this.isOpen || !dialog || (next && dialog.contains(next))) {
      return;
    }
    const first = this.template.querySelector(".close-button");
    if (first) {
      first.focus();
    }
  }

  /** Escape closes. Tab and Shift+Tab wrap between the first and last stops. */
  handleDialogKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.handleClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const first = this.template.querySelector(".close-button");
    const last = this.template.querySelector(".github-link") || first;
    const active = this.template.activeElement;
    const heading = this.template.querySelector(".dialog-heading");
    if (event.shiftKey && (active === first || active === heading)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
