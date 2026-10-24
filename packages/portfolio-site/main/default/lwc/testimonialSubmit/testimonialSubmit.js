/**
 * @description       : Testimonial form for the public site, rebuilt as an accessible sentence
 *                      builder (ADR-005). The sentence reads "I'm a [relationship],
 *                      and Ryan [strength]. The result? [outcome]". One fieldset holds it, its
 *                      legend reads the sentence, and each blank is a labelled select. A polite
 *                      live region previews the finished sentence. The vibe switch chooses the
 *                      fragment set, and a Recruiter or a Fan or visitor sees only the outcomes
 *                      anyone could say. Fragments come from Testimonial_Fragment__mdt through
 *                      TestimonialController.getFragments. The server checks every choice again
 *                      and stores each review unapproved. Each submit the server answers sends
 *                      testimonial_submitted with the vibe and the outcome (accepted,
 *                      rate_limited or invalid) and nothing the visitor typed or chose.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
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

const SUCCESS_MESSAGE =
  "Thank you. Your review was received and will appear once it is approved.";
const FALLBACK_ERROR = "Your testimonial could not be saved. Try again later.";
const LOAD_ERROR =
  "The sentence builder could not load. Try again later, or reach Ryan on LinkedIn.";
const PREVIEW_PROMPT = "Pick all three blanks to see your sentence.";
// TestimonialController's message when one address sends too many reviews in a minute. The
// analytics outcome is the only thing that reads it.
export const RATE_LIMITED_TEXT = "Too many submissions. Try again in a minute.";

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
  successMessage = "";
  serverError = "";
  startedAt = Date.now();

  maxNameLength = MAX_NAME_LENGTH;
  maxTitleLength = MAX_TITLE_LENGTH;
  maxNoteLength = MAX_NOTE_LENGTH;

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

  get vibeChecked() {
    return this.isCasual ? "true" : "false";
  }

  get vibeLabel() {
    return this.form.vibeMode;
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

  get isValid() {
    const name = this.form.authorName.trim();
    const title = this.form.authorTitle.trim();
    const note = this.form.note.trim();
    return (
      !this.loadError &&
      name.length > 0 &&
      name.length <= MAX_NAME_LENGTH &&
      title.length <= MAX_TITLE_LENGTH &&
      RELATIONSHIPS.includes(this.form.relationship) &&
      this.strengthOptions.some((o) => o.value === this.form.strength) &&
      this.outcomeOptions.some((o) => o.value === this.form.outcome) &&
      note.length <= MAX_NOTE_LENGTH
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
    let next = { ...this.form, [field]: event.target.value };
    if (field === "relationship") {
      next = this.keepAllowedOutcome(next);
    }
    this.form = next;
    this.successMessage = "";
    this.serverError = "";
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
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (this.isSubmitDisabled) {
      return;
    }
    this.isSubmitting = true;
    this.successMessage = "";
    this.serverError = "";
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
      // A textarea takes no value binding in a template, so it is cleared here.
      const noteField = this.template.querySelector("textarea");
      if (noteField) {
        noteField.value = "";
      }
      this.successMessage = SUCCESS_MESSAGE;
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
