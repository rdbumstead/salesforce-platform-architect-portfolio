/**
 * @description       : The "View source" control. Placed once near
 *                      a showcase component's heading with a fixed source key. It reads the
 *                      component's files from SourceController.getSourceFiles, which serves a
 *                      cache only, and renders nothing when the key is unknown or the cache is
 *                      empty. Pressed, it opens a native modal dialog in the top layer, with
 *                      the page behind it inert, one tab per file, the file in c-code-viewer
 *                      and its GitHub link. Focus moves into the dialog, Tab stays
 *                      inside it, and Escape or Close returns focus to the button. Opening sends
 *                      view_source_opened with the source key, and choosing another file sends
 *                      view_source_file_selected with the key and the file's label.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { LightningElement, api, wire } from "lwc";
import getSourceFiles from "@salesforce/apex/SourceController.getSourceFiles";
import { trackEvent, EVENTS } from "c/analyticsService";

/** Dialog headings for the six fixed keys. Any other key shows the key itself. */
export const COMPONENT_LABELS = Object.freeze({
  skillNetwork: "Skill network",
  schemaVisualizer: "Schema visualizer",
  decisionMatrix: "Decision matrix",
  apiTester: "API Lab",
  resumeBuilder: "Resume builder",
  roadmapViewer: "Roadmap viewer"
});

export default class ViewSource extends LightningElement {
  @api sourceKey;

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

  get hasFiles() {
    return this.files.length > 0;
  }

  get heading() {
    return `Source: ${COMPONENT_LABELS[this.sourceKey] || this.sourceKey}`;
  }

  get tabs() {
    return this.files.map((file, index) => {
      const selected = index === this.selectedIndex;
      return {
        key: file.path,
        index,
        label: file.label,
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
