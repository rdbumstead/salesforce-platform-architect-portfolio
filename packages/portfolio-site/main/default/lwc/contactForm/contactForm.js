/**
 * @description       : Contact form for the /contact page (ADR-031). It
 *                      sends the message to ContactFormController, which saves a Lead so the
 *                      org's Lead rules run. The send button stays enabled except while a send
 *                      is in flight. A send with a field missing or wrong shows a message under
 *                      each such field and moves focus to the first. The page shows "Thanks,
 *                      check your inbox" inline in a panel that fades in and takes focus, with
 *                      no redirect. A honeypot field and the time since the form appeared
 *                      go with each message for SubmissionGuard. When the address ends in
 *                      #contact, on load or later, the form scrolls into view and its heading
 *                      takes focus, so a footer link needs to know nothing about the page.
 *                      Each submit the server answers sends contact_form_submitted with only
 *                      its outcome: accepted, rate_limited or invalid. Nothing the visitor
 *                      typed goes with it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/23/2026
 **/
import { LightningElement, api } from "lwc";
import submitContact from "@salesforce/apex/ContactFormController.submitContact";
import { trackEvent, EVENTS } from "c/analyticsService";

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

// The message under each field that fails on submit.
export const FIELD_ERRORS = {
  firstName: "Enter your first name.",
  lastName: "Enter your last name.",
  emailMissing: "Enter your email address.",
  email: "Enter a valid email address, like name@example.com.",
  company: `Use ${MAX_COMPANY} characters or fewer.`,
  message: "Write a message."
};

// The order a visitor meets the fields in, so the first invalid one gets focus.
export const FIELD_ORDER = [
  "firstName",
  "lastName",
  "email",
  "company",
  "message"
];

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

// ContactFormController's message when the daily cap is reached. The analytics outcome is
// the only thing that reads it.
export const RATE_LIMITED_TEXT =
  "The form has had a lot of messages today. Try again tomorrow, or reach Ryan on LinkedIn.";

export function errorMessage(error) {
  if (error && error.body && typeof error.body.message === "string") {
    return error.body.message;
  }
  return FALLBACK_ERROR;
}

/**
 * The analytics outcome of a refused submit. No part of the message itself is sent.
 * @param {string} message The message the server returned.
 * @returns {string} rate_limited for the daily cap, invalid for every other refusal.
 */
export function refusedOutcome(message) {
  return message === RATE_LIMITED_TEXT ? "rate_limited" : "invalid";
}

export default class ContactForm extends LightningElement {
  @api heading = "Get in touch";
  @api intro;

  form = emptyForm();
  isSubmitting = false;
  isSent = false;
  serverError = "";
  errors = {};
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

  get firstNameError() {
    return this.errors.firstName || "";
  }
  get lastNameError() {
    return this.errors.lastName || "";
  }
  get emailError() {
    return this.errors.email || "";
  }
  get companyError() {
    return this.errors.company || "";
  }
  get messageError() {
    return this.errors.message || "";
  }
  get firstNameInvalid() {
    return this.errors.firstName ? "true" : undefined;
  }
  get lastNameInvalid() {
    return this.errors.lastName ? "true" : undefined;
  }
  get emailInvalid() {
    return this.errors.email ? "true" : undefined;
  }
  get companyInvalid() {
    return this.errors.company ? "true" : undefined;
  }
  get messageInvalid() {
    return this.errors.message ? "true" : undefined;
  }

  /**
   * The message for each field that fails. A field that passes has no entry. The names and
   * lengths mirror ContactFormController, which stays the authority.
   * @returns {object} field name to message
   */
  validate() {
    const errors = {};
    const first = this.form.firstName.trim();
    const last = this.form.lastName.trim();
    const email = this.form.email.trim();
    if (!first.length || first.length > MAX_FIRST_NAME) {
      errors.firstName = first.length
        ? `Use ${MAX_FIRST_NAME} characters or fewer.`
        : FIELD_ERRORS.firstName;
    }
    if (!last.length || last.length > MAX_LAST_NAME) {
      errors.lastName = last.length
        ? `Use ${MAX_LAST_NAME} characters or fewer.`
        : FIELD_ERRORS.lastName;
    }
    if (!email.length) {
      errors.email = FIELD_ERRORS.emailMissing;
    } else if (email.length > MAX_EMAIL || !EMAIL_PATTERN.test(email)) {
      errors.email = FIELD_ERRORS.email;
    }
    if (this.form.company.trim().length > MAX_COMPANY) {
      errors.company = FIELD_ERRORS.company;
    }
    const message = this.form.message.trim();
    if (!message.length) {
      errors.message = FIELD_ERRORS.message;
    } else if (message.length > MAX_MESSAGE) {
      errors.message = `Use ${MAX_MESSAGE} characters or fewer.`;
    }
    return errors;
  }

  // The button is off only while a send is in flight. Anything else is answered on submit.
  get isSubmitDisabled() {
    return this.isSubmitting;
  }

  get submitLabel() {
    return this.isSubmitting ? "Sending" : "Send message";
  }

  handleInput(event) {
    const field = event.target.name;
    this.form = { ...this.form, [field]: event.target.value };
    this.serverError = "";
    // A message goes as soon as its field is touched.
    if (this.errors[field]) {
      const next = { ...this.errors };
      delete next[field];
      this.errors = next;
    }
  }

  focusFirstInvalid(errors) {
    const name = FIELD_ORDER.find((field) => errors[field]);
    const field = name && this.template.querySelector(`[name="${name}"]`);
    if (field) {
      field.focus();
    }
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (this.isSubmitDisabled) {
      return;
    }
    this.serverError = "";
    const errors = this.validate();
    this.errors = errors;
    if (Object.keys(errors).length) {
      this.focusFirstInvalid(errors);
      return;
    }
    this.isSubmitting = true;
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
      trackEvent(EVENTS.CONTACT_FORM_SUBMITTED, { outcome: "accepted" });
    } catch (error) {
      this.serverError = errorMessage(error);
      trackEvent(EVENTS.CONTACT_FORM_SUBMITTED, {
        outcome: refusedOutcome(this.serverError)
      });
    } finally {
      this.isSubmitting = false;
    }
  }
}
