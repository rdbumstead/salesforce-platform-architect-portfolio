/**
 * @description       : Cover letter page (Pillar D). Calls ApiLabController.generateCoverLetter,
 *                      which posts to /papi/v1/ai/generate (PD-D3 b). The provider badge and the
 *                      show-your-work panel are filled only from the response, never from a
 *                      literal, so the page cannot claim a provider on its own. No timer drives
 *                      the progress line.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement } from "lwc";
import generateCoverLetter from "@salesforce/apex/ApiLabController.generateCoverLetter";

export const MAX_COMPANY_LENGTH = 120;
export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 4000;
/** Provider value the API returns when the local template wrote the letter. */
const LOCAL_PROVIDER = "Local";

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
      }`
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
    } catch (error) {
      this.error =
        error?.body?.message ||
        error?.message ||
        "The cover letter could not be written. Try again later.";
    } finally {
      this.isLoading = false;
    }
  }
}
