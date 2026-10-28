/**
 * @description       : Testimonial form for the public site, rebuilt as an accessible sentence
 *                      builder (ADR-005). The sentence reads "I'm a [relationship],
 *                      and Ryan [strength]. The result? [outcome]". One fieldset holds it, its
 *                      legend reads the sentence, and each blank is a labelled select. A polite
 *                      live region previews the finished sentence. The vibe switch chooses the
 *                      fragment set. Its label never changes ("Casual vibe"), the switch itself
 *                      reports on or off, and a separate polite line says which phrases are
 *                      showing. A Recruiter or a Fan or visitor sees only the outcomes anyone
 *                      could say. Fragments come from Testimonial_Fragment__mdt through
 *                      TestimonialController.getFragments. The submit button stays enabled
 *                      except while a send is in flight. A send with something missing or too
 *                      long shows a message under each field that needs one and moves focus to
 *                      the first of them. The server checks every choice again and stores each
 *                      review unapproved. A saved review replaces the form with a short thank
 *                      you panel that fades in and takes focus. Each submit the server answers
 *                      sends testimonial_submitted with the vibe and the outcome (accepted,
 *                      rate_limited or invalid) and nothing the visitor typed or chose.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/03/2026
 **/
import { LightningElement, wire } from "lwc";
import getFragments from "@salesforce/apex/TestimonialController.getFragments";
import submitTestimonial from "@salesforce/apex/TestimonialController.submitTestimonial";
import { trackEvent, EVENTS } from "c/analyticsService";

// Limits mirror TestimonialController (MAX_AUTHOR_NAME_LENGTH, MAX_NOTE_LENGTH and the
// Author_Title__c field length). The server stays the authority.
export const MAX_NAME_LENGTH = 80;
export const MAX_TITLE_LENGTH = 100;
export const MAX_NOTE_LENGTH = 255;
export const RELATIONSHIPS = ["Manager", "Peer", "Client", "Recruiter", "Fan"];
export const ANYONE_ONLY = ["Recruiter", "Fan"];
export const VIBE_PROFESSIONAL = "Professional";
export const VIBE_CASUAL = "Casual";
export const AUDIENCE_ANYONE = "Anyone";

export const SUCCESS_TITLE = "Thank you.";
export const SUCCESS_MESSAGE =
  "Your review was received and will appear once it is approved.";
const FALLBACK_ERROR = "Your testimonial could not be saved. Try again later.";
const LOAD_ERROR =
  "The sentence builder could not load. Try again later, or reach Ryan on LinkedIn.";
const PREVIEW_PROMPT = "Pick all three blanks to see your sentence.";
// TestimonialController's message when one address sends too many reviews in a minute. The
// analytics outcome is the only thing that reads it.
export const RATE_LIMITED_TEXT = "Too many submissions. Try again in a minute.";

// The message under each field that fails on submit.
export const FIELD_ERRORS = {
  authorName: "Enter your name.",
  authorNameLong: `Use ${MAX_NAME_LENGTH} characters or fewer.`,
  authorTitle: `Use ${MAX_TITLE_LENGTH} characters or fewer.`,
  relationship: "Choose how you know Ryan.",
  strength: "Choose a strength.",
  outcome: "Choose a result.",
  note: `Use ${MAX_NOTE_LENGTH} characters or fewer.`
};

// The order a visitor meets the fields in, so the first invalid one gets focus.
export const FIELD_ORDER = [
  "authorName",
  "authorTitle",
  "relationship",
  "strength",
  "outcome",
  "note"
];

const RELATIONSHIP_LABELS = {
  Manager: "Manager",
  Peer: "Peer",
  Client: "Client",
  Recruiter: "Recruiter",
  Fan: "Fan or visitor"
};
const SENTENCE_WORDS = {
  Manager: "manager",
  Peer: "peer",
  Client: "client",
  Recruiter: "recruiter",
  Fan: "fan or visitor"
};

function emptyForm() {
  return {
    authorName: "",
    authorTitle: "",
    relationship: "",
    strength: "",
    outcome: "",
    note: "",
    website: "",
    vibeMode: VIBE_PROFESSIONAL
  };
}

function without(errors, ...names) {
  const next = { ...errors };
  names.forEach((name) => delete next[name]);
  return next;
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

export function composeSentence(relationship, strengthText, outcomeText) {
  return `I'm a ${SENTENCE_WORDS[relationship]}, and Ryan ${strengthText}. The result? ${outcomeText}`;
}

export default class TestimonialSubmit extends LightningElement {
  form = emptyForm();
  fragments = [];
  loadError = "";
  isSubmitting = false;
  isSent = false;
  serverError = "";
  errors = {};
  vibeAnnouncement = "";
  startedAt = Date.now();

  maxNameLength = MAX_NAME_LENGTH;
  maxTitleLength = MAX_TITLE_LENGTH;
  maxNoteLength = MAX_NOTE_LENGTH;
  successTitle = SUCCESS_TITLE;
  successMessage = SUCCESS_MESSAGE;

  connectedCallback() {
    this.startedAt = Date.now();
  }

  // When the option list changes under a select, the browser can leave a new option showing
  // while the form state is empty. Keep each select showing exactly the state.
  renderedCallback() {
    for (const name of ["relationship", "strength", "outcome"]) {
      const select = this.template.querySelector(`select[name="${name}"]`);
      if (select && select.value !== this.form[name]) {
        select.value = this.form[name];
      }
    }
    if (this.focusSuccess) {
      this.focusSuccess = false;
      const success = this.template.querySelector('[data-id="success"]');
      if (success) {
        success.focus();
      }
    }
  }

  @wire(getFragments)
  wiredFragments({ data, error }) {
    if (data) {
      this.fragments = data;
      this.loadError = "";
    } else if (error) {
      this.fragments = [];
      this.loadError = LOAD_ERROR;
    }
  }

  get relationshipOptions() {
    return RELATIONSHIPS.map((value) => ({
      value,
      label: RELATIONSHIP_LABELS[value],
      selected: value === this.form.relationship
    }));
  }

  fragmentsFor(slot) {
    const anyoneOnly = ANYONE_ONLY.includes(this.form.relationship);
    return this.fragments.filter(
      (f) =>
        f.vibe === this.form.vibeMode &&
        f.slot === slot &&
        (slot !== "Outcome" || !anyoneOnly || f.audience === AUDIENCE_ANYONE)
    );
  }

  get strengthOptions() {
    return this.fragmentsFor("Strength").map((f) => ({
      value: f.id,
      label: f.text,
      selected: f.id === this.form.strength
    }));
  }

  get outcomeOptions() {
    return this.fragmentsFor("Outcome").map((f) => ({
      value: f.id,
      label: f.text,
      selected: f.id === this.form.outcome
    }));
  }

  get noRelationship() {
    return !this.form.relationship;
  }

  get noStrength() {
    return !this.form.strength;
  }

  get noOutcome() {
    return !this.form.outcome;
  }

  get isCasual() {
    return this.form.vibeMode === VIBE_CASUAL;
  }

  get showForm() {
    return !this.isSent;
  }

  get vibeChecked() {
    return this.isCasual ? "true" : "false";
  }

  // The switch keeps one label. Its on or off state is the switch's own.
  get vibeLabel() {
    return "Casual vibe";
  }

  // The visible word beside the switch. It is hidden from assistive technology, which hears
  // the switch state and the announcement instead.
  get vibeValue() {
    return this.isCasual ? "On" : "Off";
  }

  get vibeHint() {
    return this.isCasual
      ? "Casual shows the fun phrases."
      : "Professional shows formal phrases.";
  }

  get noteCount() {
    return `${this.form.note.length} of ${MAX_NOTE_LENGTH} characters`;
  }

  textOf(id) {
    const match = this.fragments.find((f) => f.id === id);
    return match ? match.text : "";
  }

  get previewText() {
    const { relationship, strength, outcome } = this.form;
    if (!relationship || !strength || !outcome) {
      return PREVIEW_PROMPT;
    }
    return `Your sentence: ${composeSentence(
      relationship,
      this.textOf(strength),
      this.textOf(outcome)
    )}`;
  }

  get authorNameError() {
    return this.errors.authorName || "";
  }
  get authorTitleError() {
    return this.errors.authorTitle || "";
  }
  get relationshipError() {
    return this.errors.relationship || "";
  }
  get strengthError() {
    return this.errors.strength || "";
  }
  get outcomeError() {
    return this.errors.outcome || "";
  }
  get noteError() {
    return this.errors.note || "";
  }
  get authorNameInvalid() {
    return this.errors.authorName ? "true" : undefined;
  }
  get authorTitleInvalid() {
    return this.errors.authorTitle ? "true" : undefined;
  }
  get relationshipInvalid() {
    return this.errors.relationship ? "true" : undefined;
  }
  get strengthInvalid() {
    return this.errors.strength ? "true" : undefined;
  }
  get outcomeInvalid() {
    return this.errors.outcome ? "true" : undefined;
  }
  get noteInvalid() {
    return this.errors.note ? "true" : undefined;
  }

  /**
   * The message for each field that fails. A field that passes has no entry.
   * @returns {object} field name to message
   */
  validate() {
    const errors = {};
    const name = this.form.authorName.trim();
    if (!name.length) {
      errors.authorName = FIELD_ERRORS.authorName;
    } else if (name.length > MAX_NAME_LENGTH) {
      errors.authorName = FIELD_ERRORS.authorNameLong;
    }
    if (this.form.authorTitle.trim().length > MAX_TITLE_LENGTH) {
      errors.authorTitle = FIELD_ERRORS.authorTitle;
    }
    if (!RELATIONSHIPS.includes(this.form.relationship)) {
      errors.relationship = FIELD_ERRORS.relationship;
    }
    if (!this.strengthOptions.some((o) => o.value === this.form.strength)) {
      errors.strength = FIELD_ERRORS.strength;
    }
    if (!this.outcomeOptions.some((o) => o.value === this.form.outcome)) {
      errors.outcome = FIELD_ERRORS.outcome;
    }
    if (this.form.note.trim().length > MAX_NOTE_LENGTH) {
      errors.note = FIELD_ERRORS.note;
    }
    return errors;
  }

  // The button is off only while a send is in flight. Anything else is answered on submit.
  get isSubmitDisabled() {
    return this.isSubmitting;
  }

  get submitLabel() {
    return this.isSubmitting ? "Sending" : "Submit Review";
  }

  handleInput(event) {
    const field = event.target.name;
    let next = { ...this.form, [field]: event.target.value };
    if (field === "relationship") {
      next = this.keepAllowedOutcome(next);
    }
    this.form = next;
    this.serverError = "";
    // A message goes as soon as its field is touched. A new relationship may change which
    // results are allowed, so a result message goes with it.
    this.errors =
      field === "relationship"
        ? without(this.errors, field, "outcome")
        : without(this.errors, field);
  }

  // A recruiter or a visitor cannot keep an outcome only a colleague could choose.
  keepAllowedOutcome(next) {
    const outcome = this.fragments.find((f) => f.id === next.outcome);
    const anyoneOnly = ANYONE_ONLY.includes(next.relationship);
    if (outcome && anyoneOnly && outcome.audience !== AUDIENCE_ANYONE) {
      return { ...next, outcome: "" };
    }
    return next;
  }

  handleVibeToggle() {
    // Each vibe has its own fragments, so the two phrase blanks start again.
    this.form = {
      ...this.form,
      vibeMode: this.isCasual ? VIBE_PROFESSIONAL : VIBE_CASUAL,
      strength: "",
      outcome: ""
    };
    this.errors = without(this.errors, "strength", "outcome");
    this.vibeAnnouncement = this.isCasual
      ? "Casual phrases are showing."
      : "Professional phrases are showing.";
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
    if (this.loadError) {
      // The alert above the sentence already says why. Nothing can be sent.
      return;
    }
    const errors = this.validate();
    this.errors = errors;
    if (Object.keys(errors).length) {
      this.focusFirstInvalid(errors);
      return;
    }
    this.isSubmitting = true;
    const vibe = this.form.vibeMode;
    const title = this.form.authorTitle.trim();
    const note = this.form.note.trim();
    try {
      await submitTestimonial({
        authorName: this.form.authorName.trim(),
        authorTitle: title.length ? title : null,
        relationship: this.form.relationship,
        vibeMode: this.form.vibeMode,
        strengthId: this.form.strength,
        outcomeId: this.form.outcome,
        note: note.length ? note : null,
        website: this.form.website.length ? this.form.website : null,
        elapsedMs: Date.now() - this.startedAt
      });
      this.form = emptyForm();
      this.vibeAnnouncement = "";
      this.isSent = true;
      // The form leaves the page, so focus moves to the thanks once it has rendered.
      this.focusSuccess = true;
      trackEvent(EVENTS.TESTIMONIAL_SUBMITTED, { vibe, outcome: "accepted" });
    } catch (error) {
      this.serverError = errorMessage(error);
      trackEvent(EVENTS.TESTIMONIAL_SUBMITTED, {
        vibe,
        outcome:
          this.serverError === RATE_LIMITED_TEXT ? "rate_limited" : "invalid"
      });
    } finally {
      this.isSubmitting = false;
    }
  }
}
