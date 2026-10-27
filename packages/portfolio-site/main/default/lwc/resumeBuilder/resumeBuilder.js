/**
 * @description       : Resume builder for the portfolio site. Reads the resume for the chosen
 *                      persona from ResumeController.getResume, previews it on white paper in
 *                      both themes, and exports the same content as a text PDF or as plain ATS
 *                      text copied to the clipboard. The preview and the PDF read one layout spec
 *                      (resumeLayout.js). jsPDF and the two Inter TTF files load only on the first
 *                      download, through c/documentPdf, which the cover letter shares. When the
 *                      fonts cannot be fetched the PDF is still written, in the spec's fallback
 *                      font.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
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

const DEFAULT_PERSONA = "Architect";

const PERSONA_OPTIONS = [
  { label: "Platform Architect", value: "Architect" },
  { label: "Salesforce Developer", value: "Developer" },
  { label: "System Admin", value: "Admin" }
];

const PAPER_STYLE = previewStyle(RESUME_LAYOUT);

function reduceError(error) {
  if (!error) {
    return "";
  }
  if (Array.isArray(error.body)) {
    return error.body.map((entry) => entry.message).join(", ");
  }
  if (error.body && typeof error.body.message === "string") {
    return error.body.message;
  }
  if (typeof error.message === "string") {
    return error.message;
  }
  return "Unknown error";
}

export default class ResumeBuilder extends LightningElement {
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
    if (data !== undefined) {
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
      this.exportError = `The PDF could not be created. ${reduceError(error)}`;
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
      this.exportError = `The text could not be copied. ${reduceError(error)}`;
    }
  }
}
