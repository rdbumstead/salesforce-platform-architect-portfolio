/**
 * @description       : Resume builder for the portfolio site. Reads the resume for the chosen
 *                      persona from ResumeController.getResume (plan K1), previews it, and
 *                      exports the same content as a text PDF (jsPDF, loaded on first download)
 *                      or as plain ATS text copied to the clipboard.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import getResume from "@salesforce/apex/ResumeController.getResume";
import JSPDF_LIBRARY from "@salesforce/resourceUrl/jsPDF_Library";
import {
  buildViewModel,
  buildLines,
  toAtsText,
  writePdf,
  pdfFileName
} from "./resumeFormat";

const DEFAULT_PERSONA = "Architect";

const PERSONA_OPTIONS = [
  { label: "Technical Architect", value: "Architect" },
  { label: "Salesforce Developer", value: "Developer" },
  { label: "System Admin", value: "Admin" }
];

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

  jsPdfPromise;

  personaOptions = PERSONA_OPTIONS;

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

  handlePersonaChange(event) {
    const value = event.detail.value;
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

  exportLines() {
    return buildLines(this.model);
  }

  ensureJsPdf() {
    if (!this.jsPdfPromise) {
      this.jsPdfPromise = loadScript(this, JSPDF_LIBRARY).catch((error) => {
        // Let the next click try again after a failed load.
        this.jsPdfPromise = undefined;
        throw error;
      });
    }
    return this.jsPdfPromise;
  }

  async handleDownload() {
    if (this.exportDisabled) {
      return;
    }
    this.isGenerating = true;
    this.exportMessage = "";
    this.exportError = "";
    try {
      await this.ensureJsPdf();
      // jsPDF 3.x UMD build registers its exports on the jspdf global.
      const jsPdfNamespace = window.jspdf;
      if (!jsPdfNamespace || typeof jsPdfNamespace.jsPDF !== "function") {
        throw new Error("jsPDF did not load.");
      }
      const doc = new jsPdfNamespace.jsPDF({ unit: "pt", format: "letter" });
      writePdf(doc, this.exportLines());
      doc.save(pdfFileName(this.model, this.selectedPersona));
      this.exportMessage = "PDF downloaded.";
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
    const text = toAtsText(this.exportLines());
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error("Clipboard access is not available in this browser.");
      }
      await navigator.clipboard.writeText(text);
      this.exportMessage = "ATS text copied to the clipboard.";
    } catch (error) {
      this.exportError = `The text could not be copied. ${reduceError(error)}`;
    }
  }
}
