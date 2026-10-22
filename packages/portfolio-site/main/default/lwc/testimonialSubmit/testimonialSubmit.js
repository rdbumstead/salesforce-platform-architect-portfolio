/**
 * @description       : Testimonial form for the public site. Mirrors the limits of
 *                      TestimonialController.submitTestimonial (plan K2), keeps submit disabled
 *                      until the input is valid, and shows the server's own message when a
 *                      submission is refused. Every review is stored unapproved (decision V1 a).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { LightningElement } from "lwc";
import submitTestimonial from "@salesforce/apex/TestimonialController.submitTestimonial";

// Limits mirror TestimonialController (MAX_AUTHOR_NAME_LENGTH, MAX_CONTEXT_LENGTH and the
// Author_Title__c field length). The server stays the authority.
export const MAX_NAME_LENGTH = 80;
export const MAX_TITLE_LENGTH = 100;
export const MAX_CONTEXT_LENGTH = 255;
export const RELATIONSHIPS = ["Manager", "Peer", "Client", "Recruiter", "Fan"];
export const VIBE_PROFESSIONAL = "Professional";
export const VIBE_CASUAL = "Casual";

const SUCCESS_MESSAGE =
  "Thank you. Your review was received and will appear once it is approved.";
const FALLBACK_ERROR = "Your testimonial could not be saved. Try again later.";

const RELATIONSHIP_LABELS = {
  Manager: "Manager",
  Peer: "Peer",
  Client: "Client",
  Recruiter: "Recruiter",
  Fan: "Fan or visitor"
};

function emptyForm() {
  return {
    authorName: "",
    authorTitle: "",
    relationship: "",
    context: "",
    vibeMode: VIBE_PROFESSIONAL
  };
}

export function errorMessage(error) {
  if (error && error.body && typeof error.body.message === "string") {
    return error.body.message;
  }
  if (error && Array.isArray(error.body) && error.body.length) {
    return error.body.map((entry) => entry.message).join(", ");
  }
  return FALLBACK_ERROR;
}

export default class TestimonialSubmit extends LightningElement {
  form = emptyForm();
  isSubmitting = false;
  successMessage = "";
  serverError = "";

  maxNameLength = MAX_NAME_LENGTH;
  maxTitleLength = MAX_TITLE_LENGTH;
  maxContextLength = MAX_CONTEXT_LENGTH;

  get relationshipOptions() {
    return RELATIONSHIPS.map((value) => ({
      value,
      label: RELATIONSHIP_LABELS[value],
      selected: value === this.form.relationship
    }));
  }

  get noRelationship() {
    return !this.form.relationship;
  }

  get isCasual() {
    return this.form.vibeMode === VIBE_CASUAL;
  }

  get vibeChecked() {
    return this.isCasual ? "true" : "false";
  }

  get vibeLabel() {
    return this.form.vibeMode;
  }

  get contextCount() {
    return `${this.form.context.length} of ${MAX_CONTEXT_LENGTH} characters`;
  }

  get isValid() {
    const name = this.form.authorName.trim();
    const title = this.form.authorTitle.trim();
    const context = this.form.context.trim();
    return (
      name.length > 0 &&
      name.length <= MAX_NAME_LENGTH &&
      title.length <= MAX_TITLE_LENGTH &&
      RELATIONSHIPS.includes(this.form.relationship) &&
      context.length > 0 &&
      context.length <= MAX_CONTEXT_LENGTH
    );
  }

  get isSubmitDisabled() {
    return !this.isValid || this.isSubmitting;
  }

  get submitLabel() {
    return this.isSubmitting ? "Sending" : "Submit Review";
  }

  handleInput(event) {
    const field = event.target.name;
    this.form = { ...this.form, [field]: event.target.value };
    this.successMessage = "";
    this.serverError = "";
  }

  handleVibeToggle() {
    this.form = {
      ...this.form,
      vibeMode: this.isCasual ? VIBE_PROFESSIONAL : VIBE_CASUAL
    };
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (this.isSubmitDisabled) {
      return;
    }
    this.isSubmitting = true;
    this.successMessage = "";
    this.serverError = "";
    const title = this.form.authorTitle.trim();
    try {
      await submitTestimonial({
        authorName: this.form.authorName.trim(),
        authorTitle: title.length ? title : null,
        relationship: this.form.relationship,
        vibeMode: this.form.vibeMode,
        context: this.form.context.trim()
      });
      this.form = emptyForm();
      // A textarea takes no value binding in a template, so it is cleared here.
      const contextField = this.template.querySelector("textarea");
      if (contextField) {
        contextField.value = "";
      }
      this.successMessage = SUCCESS_MESSAGE;
    } catch (error) {
      this.serverError = errorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }
}
