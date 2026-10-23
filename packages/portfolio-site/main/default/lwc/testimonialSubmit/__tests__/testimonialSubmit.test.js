/**
 * @description       : Unit tests for the testimonialSubmit sentence builder.
 *                      getFragments is a mocked wire adapter fed with fragments read from the
 *                      Testimonial_Fragment__mdt records in source, and submitTestimonial is a
 *                      mocked imperative call. The drift tests read the controller source so the
 *                      form limits and relationships cannot fall out of step with the server.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import TestimonialSubmit, {
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  RELATIONSHIPS,
  errorMessage,
  composeSentence
} from "c/testimonialSubmit";
import getFragments from "@salesforce/apex/TestimonialController.getFragments";
import submitTestimonial from "@salesforce/apex/TestimonialController.submitTestimonial";

jest.mock(
  "@salesforce/apex/TestimonialController.getFragments",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/TestimonialController.submitTestimonial",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const DEFAULT_DIR = join(__dirname, "..", "..", "..");
const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

// The fragment records in source, shaped as getFragments returns them.
function sourceFragments() {
  const dir = join(DEFAULT_DIR, "customMetadata");
  return readdirSync(dir)
    .filter((f) => f.startsWith("Testimonial_Fragment."))
    .map((file) => {
      const xml = readFileSync(join(dir, file), "utf8");
      const value = (field) => {
        const match = xml.match(
          new RegExp(`<field>${field}</field>\\s*<value[^>]*>([^<]*)</value>`)
        );
        return match
          ? match[1].replace(/&apos;/g, "'").replace(/&amp;/g, "&")
          : null;
      };
      return {
        id: file
          .replace("Testimonial_Fragment.", "")
          .replace(".md-meta.xml", ""),
        vibe: value("Vibe__c"),
        slot: value("Slot__c"),
        text: value("Text__c"),
        sortOrder: Number(value("Sort_Order__c")),
        audience: value("Audience__c")
      };
    })
    .sort((a, b) =>
      `${a.vibe}${a.slot}${1000 + a.sortOrder}`.localeCompare(
        `${b.vibe}${b.slot}${1000 + b.sortOrder}`
      )
    );
}
const FRAGMENTS = sourceFragments();

function createComponent() {
  const element = createElement("c-testimonial-submit", {
    is: TestimonialSubmit
  });
  document.body.appendChild(element);
  return element;
}

function q(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function optionValues(element, name) {
  return [
    ...element.shadowRoot.querySelectorAll(`[name="${name}"] option`)
  ].map((o) => o.value);
}

function optionTexts(element, name) {
  return [...element.shadowRoot.querySelectorAll(`[name="${name}"] option`)]
    .map((o) => o.textContent.trim())
    .slice(1);
}

async function setField(element, name, value) {
  const field = q(element, `[name="${name}"]`);
  field.value = value;
  field.dispatchEvent(
    new CustomEvent(field.tagName === "SELECT" ? "change" : "input")
  );
  await flushPromises();
}

async function ready() {
  const element = createComponent();
  getFragments.emit(FRAGMENTS);
  await flushPromises();
  return element;
}

async function fillValid(element) {
  await setField(element, "authorName", "  Ada Lovelace  ");
  await setField(element, "authorTitle", "  CTO  ");
  await setField(element, "relationship", "Peer");
  await setField(element, "strength", "Professional_Strength_01");
  await setField(element, "outcome", "Professional_Outcome_01");
}

async function submit(element) {
  q(element, "form").dispatchEvent(
    new CustomEvent("submit", { cancelable: true })
  );
  await flushPromises();
}

describe("c-testimonial-submit", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("holds the sentence in one fieldset whose legend reads it, each blank labelled", async () => {
    const element = await ready();
    const fieldset = q(element, "fieldset");
    expect(
      fieldset.querySelector("legend").textContent.replace(/\s+/g, " ").trim()
    ).toBe(
      "Your sentence: I'm a [relationship], and Ryan [strength]. The result? [outcome]"
    );
    // The test renderer suffixes template ids, so the for values are matched by prefix.
    const labels = [...fieldset.querySelectorAll("label")].map((l) => [
      l.getAttribute("for").replace(/-\d+$/, ""),
      l.textContent.trim()
    ]);
    expect(labels).toEqual([
      ["relationship", "I'm a"],
      ["strength", "and Ryan"],
      ["outcome", "The result?"]
    ]);
    for (const [id] of labels) {
      expect(fieldset.querySelector(`select[name="${id}"]`)).not.toBeNull();
    }
  });

  it("previews the finished sentence in a polite live region", async () => {
    const element = await ready();
    const preview = q(element, '[data-id="preview"]');
    expect(preview.getAttribute("aria-live")).toBe("polite");
    expect(preview.textContent.trim()).toBe(
      "Pick all three blanks to see your sentence."
    );
    await fillValid(element);
    expect(preview.textContent.trim()).toBe(
      "Your sentence: I'm a peer, and Ryan explains the complex simply. The result? We launched on time."
    );
  });

  it("Professional shows only Professional fragments and Casual only Casual", async () => {
    const element = await ready();
    const professional = FRAGMENTS.filter(
      (f) => f.vibe === "Professional" && f.slot === "Strength"
    ).map((f) => f.text);
    expect(optionTexts(element, "strength")).toEqual(professional);

    q(element, '[data-id="vibe-toggle"]').click();
    await flushPromises();
    const casual = FRAGMENTS.filter(
      (f) => f.vibe === "Casual" && f.slot === "Strength"
    ).map((f) => f.text);
    expect(optionTexts(element, "strength")).toEqual(casual);
    expect(optionTexts(element, "strength")).toContain("is an absolute beast");
  });

  it("switching the vibe clears the two phrase blanks", async () => {
    const element = await ready();
    await fillValid(element);
    q(element, '[data-id="vibe-toggle"]').click();
    await flushPromises();
    expect(q(element, '[name="strength"]').value).toBe("");
    expect(q(element, '[name="outcome"]').value).toBe("");
    expect(q(element, '[name="relationship"]').value).toBe("Peer");
    expect(q(element, '[data-id="submit"]').disabled).toBe(true);
  });

  it("a Recruiter or a Fan sees only Anyone outcomes", async () => {
    const element = await ready();
    const anyone = FRAGMENTS.filter(
      (f) =>
        f.vibe === "Professional" &&
        f.slot === "Outcome" &&
        f.audience === "Anyone"
    ).map((f) => f.text);
    await setField(element, "relationship", "Peer");
    expect(optionTexts(element, "outcome")).toHaveLength(8);
    await setField(element, "relationship", "Recruiter");
    expect(optionTexts(element, "outcome")).toEqual(anyone);
    await setField(element, "relationship", "Fan");
    expect(optionTexts(element, "outcome")).toEqual(anyone);
  });

  it("drops a worked together outcome when the relationship changes to Recruiter", async () => {
    const element = await ready();
    await fillValid(element);
    await setField(element, "relationship", "Recruiter");
    expect(q(element, '[name="outcome"]').value).toBe("");
    await setField(element, "outcome", "Professional_Outcome_07");
    await setField(element, "relationship", "Fan");
    expect(q(element, '[name="outcome"]').value).toBe(
      "Professional_Outcome_07"
    );
  });

  it("keeps submit disabled until every required choice is valid", async () => {
    const element = await ready();
    const button = q(element, '[data-id="submit"]');
    expect(button.disabled).toBe(true);
    await setField(element, "authorName", "Ada");
    await setField(element, "relationship", "Peer");
    await setField(element, "strength", "Professional_Strength_01");
    expect(button.disabled).toBe(true);
    await setField(element, "outcome", "Professional_Outcome_01");
    expect(button.disabled).toBe(false);

    await setField(element, "authorName", "x".repeat(MAX_NAME_LENGTH + 1));
    expect(button.disabled).toBe(true);
    await setField(element, "authorName", "Ada");
    await setField(element, "authorTitle", "t".repeat(101));
    expect(button.disabled).toBe(true);
    await setField(element, "authorTitle", "");
    await setField(element, "note", "n".repeat(MAX_NOTE_LENGTH + 1));
    expect(button.disabled).toBe(true);
    await setField(element, "note", "");
    await setField(element, "relationship", "");
    expect(button.disabled).toBe(true);

    await submit(element);
    expect(submitTestimonial).not.toHaveBeenCalled();
  });

  it("sets the native length limits and the relationship values", async () => {
    const element = await ready();
    expect(q(element, '[name="authorName"]').maxLength).toBe(80);
    expect(q(element, '[name="authorTitle"]').maxLength).toBe(100);
    expect(q(element, '[name="note"]').maxLength).toBe(255);
    expect(optionValues(element, "relationship")).toEqual([
      "",
      "Manager",
      "Peer",
      "Client",
      "Recruiter",
      "Fan"
    ]);
  });

  it("sends the exact trimmed arguments, then shows success and resets", async () => {
    submitTestimonial.mockResolvedValue("a0B000000000001AAA");
    const element = await ready();
    await fillValid(element);
    await setField(element, "note", "  Calm and clear.  ");

    await submit(element);
    await flushPromises();

    expect(submitTestimonial).toHaveBeenCalledTimes(1);
    const args = submitTestimonial.mock.calls[0][0];
    expect(args).toEqual({
      authorName: "Ada Lovelace",
      authorTitle: "CTO",
      relationship: "Peer",
      vibeMode: "Professional",
      strengthId: "Professional_Strength_01",
      outcomeId: "Professional_Outcome_01",
      note: "Calm and clear.",
      website: null,
      elapsedMs: expect.any(Number)
    });
    expect(q(element, '[data-id="success"]').textContent.trim()).toBe(
      "Thank you. Your review was received and will appear once it is approved."
    );
    expect(q(element, '[data-id="error"]')).toBeNull();
    expect(q(element, '[name="authorName"]').value).toBe("");
    expect(q(element, '[name="note"]').value).toBe("");
    expect(q(element, '[name="relationship"]').value).toBe("");
    expect(
      q(element, '[data-id="vibe-toggle"]').getAttribute("aria-checked")
    ).toBe("false");
    expect(q(element, '[data-id="submit"]').disabled).toBe(true);
  });

  it("sends a blank title and note as null, and a Casual vibe when switched", async () => {
    submitTestimonial.mockResolvedValue("a0B000000000002AAA");
    const element = await ready();
    q(element, '[data-id="vibe-toggle"]').click();
    await flushPromises();
    await setField(element, "authorName", "Grace");
    await setField(element, "authorTitle", "   ");
    await setField(element, "relationship", "Fan");
    await setField(element, "strength", "Casual_Strength_09");
    await setField(element, "outcome", "Casual_Outcome_05");

    await submit(element);
    await flushPromises();

    const args = submitTestimonial.mock.calls[0][0];
    expect(args.authorTitle).toBeNull();
    expect(args.note).toBeNull();
    expect(args.vibeMode).toBe("Casual");
  });

  it("sends the honeypot when something filled it", async () => {
    submitTestimonial.mockResolvedValue(null);
    const element = await ready();
    await fillValid(element);
    await setField(element, "website", "https://spam.example");
    await submit(element);
    expect(submitTestimonial.mock.calls[0][0].website).toBe(
      "https://spam.example"
    );
  });

  it("hides the honeypot from people and assistive technology", async () => {
    const element = await ready();
    const trap = q(element, ".trap");
    expect(trap.getAttribute("aria-hidden")).toBe("true");
    expect(trap.querySelector("input").getAttribute("tabindex")).toBe("-1");
  });

  it("shows the server's rate-limit message and keeps the input", async () => {
    submitTestimonial.mockRejectedValue({
      body: { message: "Too many submissions. Try again in a minute." }
    });
    const element = await ready();
    await fillValid(element);

    await submit(element);
    await flushPromises();

    const error = q(element, '[data-id="error"]');
    expect(error.textContent.trim()).toBe(
      "Too many submissions. Try again in a minute."
    );
    expect(error.getAttribute("role")).toBe("alert");
    expect(q(element, '[data-id="success"]')).toBeNull();
    expect(q(element, '[name="authorName"]').value).toBe("  Ada Lovelace  ");
    expect(q(element, '[data-id="submit"]').disabled).toBe(false);
  });

  it("says so and keeps submit off when the fragments cannot load", async () => {
    const element = createComponent();
    getFragments.error();
    await flushPromises();
    expect(q(element, '[data-id="load-error"]').textContent.trim()).toMatch(
      /could not load/
    );
    expect(q(element, '[data-id="submit"]').disabled).toBe(true);
  });

  it("falls back to a readable message when the error has no body", () => {
    expect(errorMessage(new Error("network"))).toBe(
      "Your testimonial could not be saved. Try again later."
    );
    expect(errorMessage({ body: [{ message: "a" }, { message: "b" }] })).toBe(
      "a, b"
    );
  });

  it("the vibe switch toggles between Professional and Casual", async () => {
    const element = await ready();
    const toggle = q(element, '[data-id="vibe-toggle"]');
    expect(toggle.getAttribute("role")).toBe("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    toggle.click();
    await flushPromises();
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(q(element, ".vibe-value").textContent).toBe("Casual");
    expect(q(element, ".vibe-field .field-hint").textContent).toBe(
      "Casual shows the fun phrases."
    );
    toggle.click();
    await flushPromises();
    expect(q(element, ".vibe-value").textContent).toBe("Professional");
  });

  it("composes the sentence the server stores", () => {
    expect(composeSentence("Fan", "is an absolute beast", "We stan.")).toBe(
      "I'm a fan or visitor, and Ryan is an absolute beast. The result? We stan."
    );
  });

  it("mirrors the limits and relationships in TestimonialController", () => {
    const source = readFileSync(
      join(DEFAULT_DIR, "classes", "TestimonialController.cls"),
      "utf8"
    );
    expect(source).toMatch(
      new RegExp(`MAX_AUTHOR_NAME_LENGTH = ${MAX_NAME_LENGTH};`)
    );
    expect(source).toMatch(new RegExp(`MAX_NOTE_LENGTH = ${MAX_NOTE_LENGTH};`));
    const block = source.match(/RELATIONSHIPS = new Set<String>\{([^}]*)\}/)[1];
    const serverValues = block.match(/'([^']+)'/g).map((v) => v.slice(1, -1));
    expect(serverValues).toEqual(RELATIONSHIPS);
  });

  it("uses the fragment lists from the content drafts", () => {
    expect(FRAGMENTS).toHaveLength(36);
    const count = (vibe, slot) =>
      FRAGMENTS.filter((f) => f.vibe === vibe && f.slot === slot).length;
    expect(count("Professional", "Strength")).toBe(10);
    expect(count("Professional", "Outcome")).toBe(8);
    expect(count("Casual", "Strength")).toBe(10);
    expect(count("Casual", "Outcome")).toBe(8);
    for (const f of FRAGMENTS) {
      expect(f.text).not.toMatch(/\b(they|them|their|he|him|his)\b/i);
    }
  });
});
