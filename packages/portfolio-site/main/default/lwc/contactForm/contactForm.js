/**
 * @description       : Contact form for the home page (ADR-031). It
 *                      sends the message to ContactFormController, which saves a Lead so the
 *                      org's Lead rules run. The page shows "Thanks, check your inbox" inline,
 *                      with no redirect. A honeypot field and the time since the form appeared
 *                      go with each message for SubmissionGuard. When the address ends in
 *                      #contact, on load or later, the form scrolls into view and its heading
 *                      takes focus, so a footer link needs to know nothing about the page.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { LightningElement, api } from "lwc";
import submitContact from "@salesforce/apex/ContactFormController.submitContact";

// Limits mirror ContactFormController. The server stays the authority.
export const MAX_FIRST_NAME = 40;
export const MAX_LAST_NAME = 80;
export const MAX_EMAIL = 80;
export const MAX_COMPANY = 255;
export const MAX_MESSAGE = 2000;
export const CONTACT_HASH = "#contact";
export const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

const FALLBACK_ERROR = "Your message could not be sent. Try again later.";
const PRIVACY_NOTE =
  "Your details go only to Ryan, are used only to reply, and are never shared.";

function emptyForm() {
  return {
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    message: "",
    website: ""
  };
}

export function errorMessage(error) {
  if (error && error.body && typeof error.body.message === "string") {
    return error.body.message;
  }
  return FALLBACK_ERROR;
}

export default class ContactForm extends LightningElement {
  @api heading = "Get in touch";
  @api intro;

  form = emptyForm();
  isSubmitting = false;
  isSent = false;
  serverError = "";
  startedAt = Date.now();

  maxFirstName = MAX_FIRST_NAME;
  maxLastName = MAX_LAST_NAME;
  maxEmail = MAX_EMAIL;
  maxCompany = MAX_COMPANY;
  maxMessage = MAX_MESSAGE;
  privacyNote = PRIVACY_NOTE;
  successTitle = "Thanks, check your inbox.";
  successDetail =
    "Ryan reads every message and replies within two business days.";

  boundHashChange = () => this.revealIfTargeted();

  connectedCallback() {
    this.startedAt = Date.now();
    window.addEventListener("hashchange", this.boundHashChange);
    this.hashChecked = false;
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this.boundHashChange);
  }

  renderedCallback() {
    if (!this.hashChecked) {
      this.hashChecked = true;
      this.revealIfTargeted();
    }
    if (this.focusSuccess) {
      this.focusSuccess = false;
      const success = this.template.querySelector('[data-id="success"]');
      if (success) {
        success.focus();
      }
    }
  }

  revealIfTargeted() {
    if (window.location.hash !== CONTACT_HASH) {
      return;
    }
    const heading = this.template.querySelector('[data-id="heading"]');
    if (!heading) {
      return;
    }
    if (typeof heading.scrollIntoView === "function") {
      heading.scrollIntoView({ block: "start" });
    }
    heading.focus();
  }

  get showForm() {
    return !this.isSent;
  }

  get messageCount() {
    return `${this.form.message.length} of ${MAX_MESSAGE} characters`;
  }

  get isValid() {
    const first = this.form.firstName.trim();
    const last = this.form.lastName.trim();
    const email = this.form.email.trim();
    const company = this.form.company.trim();
    const message = this.form.message.trim();
    return (
      first.length > 0 &&
      first.length <= MAX_FIRST_NAME &&
      last.length > 0 &&
      last.length <= MAX_LAST_NAME &&
      email.length <= MAX_EMAIL &&
      EMAIL_PATTERN.test(email) &&
      company.length <= MAX_COMPANY &&
      message.length > 0 &&
      message.length <= MAX_MESSAGE
    );
  }

  get isSubmitDisabled() {
    return !this.isValid || this.isSubmitting;
  }

  get submitLabel() {
    return this.isSubmitting ? "Sending" : "Send message";
  }

  handleInput(event) {
    const field = event.target.name;
    this.form = { ...this.form, [field]: event.target.value };
    this.serverError = "";
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (this.isSubmitDisabled) {
      return;
    }
    this.isSubmitting = true;
    this.serverError = "";
    const first = this.form.firstName.trim();
    const company = this.form.company.trim();
    try {
      await submitContact({
        firstName: first,
        lastName: this.form.lastName.trim(),
        email: this.form.email.trim(),
        company: company.length ? company : null,
        message: this.form.message.trim(),
        website: this.form.website.length ? this.form.website : null,
        elapsedMs: Date.now() - this.startedAt
      });
      this.form = emptyForm();
      this.isSent = true;
      // The form and its submit button leave the page, so focus moves to the thanks.
      this.focusSuccess = true;
    } catch (error) {
      this.serverError = errorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }
}
