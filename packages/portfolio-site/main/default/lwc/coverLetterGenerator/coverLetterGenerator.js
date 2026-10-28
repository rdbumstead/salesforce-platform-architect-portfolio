/**
 * @description       : Cover letter page (Pillar D). Calls ApiLabController.generateCoverLetter,
 *                      which writes the letter in process. The provider
 *                      badge and the show-your-work panel are filled only from the response,
 *                      never from a literal, so the page cannot claim a provider on its own.
 *                      While the letter is written the page shows the seconds so far and one
 *                      of a few plain status lines chosen by those seconds alone (a one second
 *                      timer drives the count, and no line names a provider or says a step is
 *                      done), over a skeleton letter. The letter fades in when it arrives, and
 *                      only the fade is animation, so it is off under reduced motion in CSS.
 *                      Sends ai_generation_completed on a result and ai_complete_failure on
 *                      an error. The letter shows with its word count on one sheet of paper,
 *                      white in both themes, at a printed page's width and centred, with the
 *                      paper, ink and type the PDF reads (c/documentPdf), so it matches the
 *                      resume preview. Above every letter, whichever provider wrote it, the sheet
 *                      carries the owner's header from ResumeController.getHeader: name, title
 *                      and the same links as the resume (c/profileLinks), Contact last. The
 *                      header is the page's, never part of the letter text, so no provider can
 *                      change it, and a failed read leaves it out. Download PDF writes the same
 *                      header and the letter as selectable text, and Copy text copies the letter
 *                      alone. Each sends its event with the provider and nothing else. The
 *                      fields are native controls, and the job description field is the tour's
 *                      stop D anchor.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
import generateCoverLetter from "@salesforce/apex/ApiLabController.generateCoverLetter";
import getHeader from "@salesforce/apex/ResumeController.getHeader";
import { headerLinks } from "c/profileLinks";
import { trackEvent, EVENTS } from "c/analyticsService";
import { onShowMe, revealAnchor } from "c/tourShowMe";
import { createPdfLoader, previewStyle } from "c/documentPdf";
import { LETTER_LAYOUT, letterFileName, writeLetterPdf } from "./letterFormat";

/** The sheet's paper, ink and type, from the layout the PDF reads. */
const SHEET_STYLE = previewStyle(LETTER_LAYOUT);

export const MAX_COMPANY_LENGTH = 120;
export const MAX_TITLE_LENGTH = 120;
// A long posting runs to about 6,000 characters, so 12,000 leaves room. ApiLabController and
// PortfolioGroundingService hold the same limit.
export const MAX_DESCRIPTION_LENGTH = 12000;
/** The tour stop whose task line points at this page's job description field. */
export const TOUR_STOP = "D";
/** Provider value the API returns when the local template wrote the letter. */
const LOCAL_PROVIDER = "Local";
/** An attempt that failed faster than this never reached the model. */
export const UNREACHABLE_MS = 1000;
const OUTCOME_FAILED = "failed";

/** ai_generation_completed outcome values. */
export const OUTCOME_LIVE = "live";
export const OUTCOME_TEMPLATE_UNREACHABLE = "template_unreachable";
export const OUTCOME_TEMPLATE_SLOW = "template_slow";

/** ai_complete_failure message_kind values. */
export const KIND_RATE_LIMITED = "rate_limited";
export const KIND_NO_PROVIDER = "no_provider";
export const KIND_INVALID_INPUT = "invalid_input";
export const KIND_OTHER = "other";

/** Status lines while the letter is written, each from this many seconds on. */
export const STATUS_STEPS = [
  { from: 0, text: "Sending your job description." },
  { from: 8, text: "The model is reading the job and the portfolio records." },
  { from: 20, text: "Drafting the letter." },
  { from: 50, text: "Still writing. A longer wait is normal for this model." },
  { from: 80, text: "Still writing. This one is taking longer than most." }
];

/** How often the elapsed count is refreshed, in milliseconds. */
export const TICK_MS = 1000;

/**
 * The status line for a number of elapsed seconds.
 * @param {number} seconds whole seconds since the request started
 * @returns {string} the last line whose start has passed
 */
export function statusLineFor(seconds) {
  let line = STATUS_STEPS[0].text;
  STATUS_STEPS.forEach((step) => {
    if (seconds >= step.from) {
      line = step.text;
    }
  });
  return line;
}

/**
 * The model attempt that failed before the template served: the last failed attempt
 * that is not the template itself, or null.
 */
function failedModelAttempt(result) {
  const failed = (result?.attempts || []).filter(
    (attempt) =>
      attempt.outcome === OUTCOME_FAILED && attempt.provider !== LOCAL_PROVIDER
  );
  return failed.length ? failed[failed.length - 1] : null;
}

/** True when the template served because the model attempt failed in under 1 s. */
export function modelUnreachable(result) {
  if (result?.provider !== LOCAL_PROVIDER) {
    return false;
  }
  const attempt = failedModelAttempt(result);
  return (
    attempt !== null &&
    typeof attempt.ms === "number" &&
    attempt.ms < UNREACHABLE_MS
  );
}

/** Words in a letter, counted on whitespace. 0 for no text. */
export function countWords(text) {
  const trimmed = (text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Sorts an error message into a message_kind without sending the message itself. */
export function messageKind(message) {
  const text = (message || "").toLowerCase();
  if (text.includes("too many")) {
    return KIND_RATE_LIMITED;
  }
  if (text.includes("no ai provider")) {
    return KIND_NO_PROVIDER;
  }
  if (text.includes("required") || text.includes("at most")) {
    return KIND_INVALID_INPUT;
  }
  return KIND_OTHER;
}

export default class CoverLetterGenerator extends LightningElement {
  companyName = "";
  jobTitle = "";
  jobDescription = "";
  descriptionCut = false;
  isLoading = false;
  error = null;
  result = null;
  showWork = false;
  elapsedSeconds = 0;
  timerId;
  header = null;
  /** The company the shown letter was written for, kept for the PDF's file name. */
  letterCompany = "";
  isExporting = false;
  exportMessage = "";
  exportError = "";
  sheetStyle = SHEET_STYLE;
  pdfLoader = createPdfLoader(this, LETTER_LAYOUT);

  @wire(getHeader)
  wiredHeader({ data }) {
    // A failed read leaves the header out. The letter never depends on it.
    this.header = data || null;
  }

  /** The owner's header over the letter, or null when the read gave nothing to show. */
  get letterHeader() {
    if (!this.header) {
      return null;
    }
    const name = (this.header.name || "").trim();
    const title = (this.header.title || "").trim();
    const links = headerLinks(this.header).map((link) => ({
      ...link,
      key: link.label
    }));
    if (!name && !title && links.length === 0) {
      return null;
    }
    return { name, title, links, hasLinks: links.length > 0 };
  }

  maxCompanyLength = MAX_COMPANY_LENGTH;
  maxTitleLength = MAX_TITLE_LENGTH;
  maxDescriptionLength = MAX_DESCRIPTION_LENGTH;

  handleInputChange(event) {
    const field = event.target.dataset.field;
    this[field] = event.target.value;
    if (field === "jobDescription" && this.descriptionCut) {
      this.descriptionCut =
        this.jobDescription.length >= MAX_DESCRIPTION_LENGTH;
    }
  }

  /**
   * The browser drops whatever a paste puts past maxlength, with no sign. This works out
   * whether this paste overflows, so the field can say the end was left out.
   */
  handleDescriptionPaste(event) {
    const pasted = event.clipboardData?.getData("text") || "";
    const field = event.target;
    const selected = (field.selectionEnd || 0) - (field.selectionStart || 0);
    const after = (field.value || "").length - selected + pasted.length;
    this.descriptionCut = after > MAX_DESCRIPTION_LENGTH;
  }

  get descriptionCountText() {
    const used = (this.jobDescription || "").length.toLocaleString("en-US");
    return `${used} of ${MAX_DESCRIPTION_LENGTH.toLocaleString("en-US")} characters`;
  }

  get descriptionCutText() {
    return this.descriptionCut
      ? `The pasted text was longer than ${MAX_DESCRIPTION_LENGTH.toLocaleString("en-US")} characters, so the end was left out.`
      : "";
  }

  get isGenerateDisabled() {
    return (
      !this.companyName?.trim() || !this.jobTitle?.trim() || this.isLoading
    );
  }

  connectedCallback() {
    // The tour's stop D points at the job description field.
    this.stopShowMe = onShowMe(TOUR_STOP, () => revealAnchor(this.template));
  }

  disconnectedCallback() {
    this.stopTimer();
    if (this.stopShowMe) {
      this.stopShowMe();
      this.stopShowMe = undefined;
    }
  }

  startTimer() {
    this.stopTimer();
    const startedAt = Date.now();
    this.elapsedSeconds = 0;
    this.timerId = setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    }, TICK_MS);
  }

  stopTimer() {
    if (this.timerId !== undefined) {
      clearInterval(this.timerId);
      this.timerId = undefined;
    }
  }

  get elapsedText() {
    return `Writing, ${this.elapsedSeconds} s`;
  }

  get statusLine() {
    return statusLineFor(this.elapsedSeconds);
  }

  get hasResult() {
    return this.result !== null;
  }

  get providerLabel() {
    if (!this.result?.provider) {
      return "";
    }
    return this.result.model
      ? `${this.result.provider} (${this.result.model})`
      : this.result.provider;
  }

  get wordCountText() {
    const words = countWords(this.result?.content);
    return words === 1 ? "1 word" : `${words} words`;
  }

  get exportDisabled() {
    return !this.result?.content || this.isExporting;
  }

  get downloadLabel() {
    return this.isExporting ? "Creating PDF..." : "Download PDF";
  }

  /** The header the PDF writes, the same name, title and links the sheet shows. */
  get pdfHeader() {
    const header = this.letterHeader;
    return header
      ? { name: header.name, title: header.title, links: header.links }
      : null;
  }

  clearExportStatus() {
    this.exportMessage = "";
    this.exportError = "";
  }

  async handleDownload() {
    if (this.exportDisabled) {
      return;
    }
    this.isExporting = true;
    this.clearExportStatus();
    try {
      const { doc, family } = await this.pdfLoader.createDocument();
      writeLetterPdf(
        doc,
        { header: this.pdfHeader, content: this.result.content },
        { family }
      );
      doc.save(letterFileName(this.letterHeader?.name, this.letterCompany));
      this.exportMessage = "PDF downloaded.";
      trackEvent(EVENTS.COVER_LETTER_DOWNLOADED, {
        provider: this.result?.provider
      });
    } catch {
      this.exportError =
        "The PDF could not be created. Copy the text instead, or try again.";
    } finally {
      this.isExporting = false;
    }
  }

  async handleCopyText() {
    if (this.exportDisabled) {
      return;
    }
    this.clearExportStatus();
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error("No clipboard");
      }
      await navigator.clipboard.writeText(this.result.content);
      this.exportMessage = "Letter text copied to the clipboard.";
      trackEvent(EVENTS.COVER_LETTER_COPIED, {
        provider: this.result?.provider
      });
    } catch {
      this.exportError =
        "The text could not be copied. Select the letter and copy it instead.";
    }
  }

  get isLocalTemplate() {
    return this.result?.provider === LOCAL_PROVIDER;
  }

  get fallbackReason() {
    return modelUnreachable(this.result)
      ? "The AI model could not be reached, so the template letter was used."
      : "The AI model was busy or too slow, so the template letter was used.";
  }

  get fallbackText() {
    return this.result?.fallbackOccurred ? "Yes" : "No";
  }

  get latencyText() {
    return this.formatMs(this.result?.latencyMs);
  }

  get generationText() {
    return this.formatMs(this.result?.generationMs);
  }

  get attemptRows() {
    return (this.result?.attempts || []).map((attempt, index) => ({
      key: `${index}-${attempt.provider}`,
      text: `${attempt.provider}: ${attempt.outcome}${
        attempt.ms === null || attempt.ms === undefined
          ? ""
          : `, ${attempt.ms} ms`
      }${attempt.detail ? ` (${attempt.detail})` : ""}`
    }));
  }

  get hasAttempts() {
    return this.attemptRows.length > 0;
  }

  get hasPrompt() {
    return Boolean(this.result?.promptShown);
  }

  get workExpanded() {
    return this.showWork ? "true" : "false";
  }

  get showWorkLabel() {
    return this.showWork ? "Hide your work" : "Show your work";
  }

  formatMs(value) {
    return value === null || value === undefined
      ? "Not reported"
      : `${value} ms`;
  }

  trackResult(result) {
    let outcome = OUTCOME_LIVE;
    if (result?.provider === LOCAL_PROVIDER) {
      outcome = modelUnreachable(result)
        ? OUTCOME_TEMPLATE_UNREACHABLE
        : OUTCOME_TEMPLATE_SLOW;
    }
    trackEvent(EVENTS.AI_GENERATION_COMPLETED, {
      provider: result?.provider,
      model: result?.model,
      fallback: Boolean(result?.fallbackOccurred),
      latency_ms: result?.latencyMs,
      outcome
    });
  }

  toggleWork() {
    this.showWork = !this.showWork;
  }

  async handleGenerate() {
    if (this.isGenerateDisabled) {
      return;
    }
    this.isLoading = true;
    this.error = null;
    this.result = null;
    this.showWork = false;
    this.clearExportStatus();
    this.letterCompany = this.companyName.trim();
    this.startTimer();
    try {
      this.result = await generateCoverLetter({
        companyName: this.companyName.trim(),
        jobTitle: this.jobTitle.trim(),
        jobDescription: this.jobDescription
      });
      this.trackResult(this.result);
    } catch (error) {
      this.error =
        error?.body?.message ||
        error?.message ||
        "The cover letter could not be written. Try again later.";
      trackEvent(EVENTS.AI_COMPLETE_FAILURE, {
        message_kind: messageKind(this.error)
      });
    } finally {
      this.stopTimer();
      this.isLoading = false;
    }
  }
}
