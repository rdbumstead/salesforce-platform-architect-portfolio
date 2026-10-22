/**
 * @description       : Cover letter page (Pillar D). Calls ApiLabController.generateCoverLetter,
 *                      which writes the letter in process (Round 4 decision 2 a). The provider
 *                      badge and the show-your-work panel are filled only from the response,
 *                      never from a literal, so the page cannot claim a provider on its own. No
 *                      timer drives the progress line. Sends ai_generation_completed on a
 *                      result and ai_complete_failure on an error (contract L4).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement } from "lwc";
import generateCoverLetter from "@salesforce/apex/ApiLabController.generateCoverLetter";
import { trackEvent, EVENTS } from "c/analyticsService";

export const MAX_COMPANY_LENGTH = 120;
export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 4000;
/** Provider value the API returns when the local template wrote the letter. */
const LOCAL_PROVIDER = "Local";
/** An attempt that failed faster than this never reached the model (log 129). */
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
  isLoading = false;
  error = null;
  result = null;
  showWork = false;

  maxCompanyLength = MAX_COMPANY_LENGTH;
  maxTitleLength = MAX_TITLE_LENGTH;
  maxDescriptionLength = MAX_DESCRIPTION_LENGTH;

  handleInputChange(event) {
    const field = event.target.dataset.field;
    this[field] = event.target.value;
  }

  get isGenerateDisabled() {
    return (
      !this.companyName?.trim() || !this.jobTitle?.trim() || this.isLoading
    );
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
      this.isLoading = false;
    }
  }
}
