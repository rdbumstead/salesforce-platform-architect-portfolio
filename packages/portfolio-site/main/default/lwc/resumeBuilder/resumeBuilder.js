/**
 * @description       : Resume builder for the portfolio site. Reads the resume for the chosen
 *                      persona from ResumeController.getResume, previews it on white paper in
 *                      both themes, and exports the same content as a text PDF or as plain ATS
 *                      text copied to the clipboard. The preview and the PDF read one layout spec
 *                      (resumeLayout.js). jsPDF and the two Inter TTF files load only on the first
 *                      download, through c/documentPdf, which the cover letter shares. When the
 *                      fonts cannot be fetched the PDF is still written, in the spec's fallback
 *                      font. A failed load says what happened in a plain sentence and never
 *                      shows the empty state, which is kept for a persona with no content.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
import getResume from "@salesforce/apex/ResumeController.getResume";
import { trackEvent, EVENTS } from "c/analyticsService";
import { createPdfLoader } from "c/documentPdf";
import {
  buildViewModel,
  buildLines,
  toAtsText,
  writePdf,
  pdfFileName
} from "./resumeFormat";
import { RESUME_LAYOUT, previewStyle } from "./resumeLayout";
import { watchMedia } from "c/mediaWatch";

const ACTIONS_IN_BODY_QUERY = "(max-width: 1023px)";

const DEFAULT_PERSONA = "Architect";

const PERSONA_OPTIONS = [
  { label: "Platform Architect", value: "Architect" },
  { label: "Salesforce Developer", value: "Developer" },
  { label: "System Admin", value: "Admin" }
];

const PAPER_STYLE = previewStyle(RESUME_LAYOUT);

/** Shown when a failed request carries no message a visitor can use. */
export const NO_ANSWER_MESSAGE =
  "The server did not send an answer. Check your connection and try again.";

/** Shown when the call returned without a resume, which only a failed request does. */
export const NO_RESUME_MESSAGE =
  "The server sent back no resume. Try again in a moment.";

// The platform's own text when a request fails before a reply can be read.
const RAW_PLATFORM_MESSAGE = /failed to get error from response/i;

/**
 * A plain sentence for an error: the controller's message when it sent one, otherwise a
 * sentence that says what happened in place of the platform's raw text.
 * @param {object} error the wire or call error
 * @param {string} fallback the sentence for an error with no usable message
 * @returns {string} the message to show
 */
export function reduceError(error, fallback = NO_ANSWER_MESSAGE) {
  if (!error) {
    return "";
  }
  let message = "";
  if (Array.isArray(error.body)) {
    message = error.body
      .map((entry) => entry && entry.message)
      .filter((text) => text)
      .join(", ");
  } else if (error.body && typeof error.body.message === "string") {
    message = error.body.message;
  } else if (typeof error.message === "string") {
    message = error.message;
  }
  message = message.trim();
  if (!message || RAW_PLATFORM_MESSAGE.test(message)) {
    return fallback;
  }
  return message;
}

export default class ResumeBuilder extends LightningElement {
  // At 1023 px and narrower the card title row has no room for View source and the marker,
  // so they move to the top of the card body.
  actionsInBody = false;

  get actionsInHeader() {
    return !this.actionsInBody;
  }

  watchActionsPlacement() {
    this.stopActionsWatch = watchMedia(ACTIONS_IN_BODY_QUERY, (matches) => {
      this.actionsInBody = matches;
    });
  }

  stopActionsPlacement() {
    if (this.stopActionsWatch) {
      this.stopActionsWatch();
      this.stopActionsWatch = undefined;
    }
  }

  connectedCallback() {
    this.watchActionsPlacement();
  }

  disconnectedCallback() {
    this.stopActionsPlacement();
  }

  selectedPersona = DEFAULT_PERSONA;
  includeHeader = true;
  includeSkills = true;

  resume;
  errorMessage = "";
  isLoading = true;
  isGenerating = false;
  exportMessage = "";
  exportError = "";

  pdfLoader = createPdfLoader(this, RESUME_LAYOUT);

  personaOptions = PERSONA_OPTIONS;
  paperStyle = PAPER_STYLE;

  @wire(getResume, { persona: "$selectedPersona" })
  wiredResume({ data, error }) {
    if (data === null) {
      // getResume always answers with a resume, so no resume means the request failed. Say
      // so, rather than show the empty state as if the persona had no content.
      this.resume = undefined;
      this.errorMessage = NO_RESUME_MESSAGE;
      this.isLoading = false;
    } else if (data !== undefined) {
      this.resume = data;
      this.errorMessage = "";
      this.isLoading = false;
    } else if (error) {
      this.resume = undefined;
      this.errorMessage = reduceError(error);
      this.isLoading = false;
    }
  }

  get model() {
    return buildViewModel(this.resume, {
      includeHeader: this.includeHeader,
      includeSkills: this.includeSkills
    });
  }

  get hasError() {
    return !this.isLoading && Boolean(this.errorMessage);
  }

  get isEmpty() {
    if (this.isLoading || this.errorMessage) {
      return false;
    }
    const model = this.model;
    return !model || model.isEmpty;
  }

  get hasContent() {
    if (this.isLoading || this.errorMessage) {
      return false;
    }
    const model = this.model;
    return Boolean(model) && !model.isEmpty;
  }

  get exportDisabled() {
    return !this.hasContent || this.isGenerating;
  }

  get downloadLabel() {
    return this.isGenerating ? "Creating PDF..." : "Download PDF";
  }

  /** The persona options with the chosen one marked, for the native select. */
  get personaChoices() {
    return this.personaOptions.map((option) => ({
      ...option,
      selected: option.value === this.selectedPersona
    }));
  }

  handlePersonaChange(event) {
    const value = event.target.value;
    if (!value || value === this.selectedPersona) {
      return;
    }
    this.isLoading = true;
    this.errorMessage = "";
    this.exportMessage = "";
    this.exportError = "";
    this.selectedPersona = value;
  }

  handleToggle(event) {
    const field = event.target.dataset.field;
    if (field === "includeHeader" || field === "includeSkills") {
      this[field] = event.target.checked;
    }
  }

  async handleDownload() {
    if (this.exportDisabled) {
      return;
    }
    this.isGenerating = true;
    this.exportMessage = "";
    this.exportError = "";
    try {
      const { doc, family } = await this.pdfLoader.createDocument();
      writePdf(doc, this.model, { family });
      doc.save(pdfFileName(this.model, this.selectedPersona));
      this.exportMessage = "PDF downloaded.";
      trackEvent(EVENTS.RESUME_DOWNLOADED, {
        persona: this.selectedPersona,
        format: "pdf"
      });
    } catch (error) {
      this.exportError = `The PDF could not be created. ${reduceError(
        error,
        "Try again."
      )}`;
    } finally {
      this.isGenerating = false;
    }
  }

  async handleCopyText() {
    if (this.exportDisabled) {
      return;
    }
    this.exportMessage = "";
    this.exportError = "";
    const text = toAtsText(buildLines(this.model));
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error("Clipboard access is not available in this browser.");
      }
      await navigator.clipboard.writeText(text);
      this.exportMessage = "ATS text copied to the clipboard.";
      trackEvent(EVENTS.RESUME_DOWNLOADED, {
        persona: this.selectedPersona,
        format: "ats"
      });
    } catch (error) {
      this.exportError = `The text could not be copied. ${reduceError(
        error,
        "Try again."
      )}`;
    }
  }
}
