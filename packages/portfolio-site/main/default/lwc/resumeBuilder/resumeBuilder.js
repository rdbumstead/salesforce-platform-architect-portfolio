/**
 * @description       : Resume builder for the portfolio site. Reads the resume for the chosen
 *                      persona from ResumeController.getResume, previews it on white paper in
 *                      both themes, and exports the same content as a text PDF or as plain ATS
 *                      text copied to the clipboard. The preview and the PDF read one layout spec
 *                      (resumeLayout.js). jsPDF and the two Inter TTF files load only on the first
 *                      download. When the fonts cannot be fetched the PDF is still written, in
 *                      the spec's fallback font.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import getResume from "@salesforce/apex/ResumeController.getResume";
import JSPDF_LIBRARY from "@salesforce/resourceUrl/jsPDF_Library";
import PORTFOLIO_FONTS from "@salesforce/resourceUrl/Portfolio_Fonts";
import { trackEvent, EVENTS } from "c/analyticsService";
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

/**
 * Base64 of an ArrayBuffer, in chunks so a large file does not overflow the argument list.
 * @param {ArrayBuffer} buffer the font file
 * @returns {string} base64 text for jsPDF's virtual file system
 */
export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(index, index + chunk)
    );
  }
  return btoa(binary);
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
  fontPromise;

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

  /**
   * The Inter files as base64 by style, or null when they cannot be fetched. A failed fetch is
   * tried again on the next click.
   */
  ensureFonts() {
    if (!this.fontPromise) {
      const files = RESUME_LAYOUT.font.files;
      const styles = Object.keys(files);
      this.fontPromise = Promise.all(
        styles.map((style) =>
          fetch(`${PORTFOLIO_FONTS}/${files[style]}`).then((response) => {
            if (!response.ok) {
              throw new Error(
                `Font ${files[style]} returned ${response.status}`
              );
            }
            return response.arrayBuffer();
          })
        )
      )
        .then((buffers) =>
          styles.map((style, index) => ({
            style,
            file: files[style],
            data: toBase64(buffers[index])
          }))
        )
        .catch(() => {
          this.fontPromise = undefined;
          return null;
        });
    }
    return this.fontPromise;
  }

  /**
   * Registers the fonts on the document and returns the family to write with, or the
   * fallback family when there are no fonts or jsPDF refuses them.
   */
  registerFonts(doc, fonts) {
    if (!fonts) {
      return RESUME_LAYOUT.font.fallback;
    }
    try {
      fonts.forEach((font) => {
        doc.addFileToVFS(font.file, font.data);
        doc.addFont(font.file, RESUME_LAYOUT.font.family, font.style);
      });
      return RESUME_LAYOUT.font.family;
    } catch {
      return RESUME_LAYOUT.font.fallback;
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
      const [, fonts] = await Promise.all([
        this.ensureJsPdf(),
        this.ensureFonts()
      ]);
      // jsPDF 3.x UMD build registers its exports on the jspdf global.
      const jsPdfNamespace = window.jspdf;
      if (!jsPdfNamespace || typeof jsPdfNamespace.jsPDF !== "function") {
        throw new Error("jsPDF did not load.");
      }
      const doc = new jsPdfNamespace.jsPDF({
        unit: RESUME_LAYOUT.page.unit,
        format: RESUME_LAYOUT.page.format,
        compress: true
      });
      const family = this.registerFonts(doc, fonts);
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
