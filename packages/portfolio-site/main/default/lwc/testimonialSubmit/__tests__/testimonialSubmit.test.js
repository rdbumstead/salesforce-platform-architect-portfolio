/**
 * @description       : Unit tests for testimonialSubmit LWC. TestimonialController.submitTestimonial
 *                      is mocked as an imperative Apex call. The drift test reads the controller
 *                      source so the form limits cannot fall out of step with the server.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import TestimonialSubmit, {
  MAX_NAME_LENGTH,
  MAX_CONTEXT_LENGTH,
  RELATIONSHIPS,
  errorMessage
} from "c/testimonialSubmit";
import submitTestimonial from "@salesforce/apex/TestimonialController.submitTestimonial";

jest.mock(
  "@salesforce/apex/TestimonialController.submitTestimonial",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

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

async function setField(element, name, value) {
  const field = q(element, `[name="${name}"]`);
  field.value = value;
  field.dispatchEvent(
    new CustomEvent(field.tagName === "SELECT" ? "change" : "input")
  );
  await flushPromises();
}

async function fillValid(element) {
  await setField(element, "authorName", "  Ada Lovelace  ");
  await setField(element, "authorTitle", "  CTO  ");
  await setField(element, "relationship", "Peer");
  await setField(element, "context", "  Clear designs and calm delivery.  ");
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

  it("keeps submit disabled until every required field is valid", async () => {
    const element = createComponent();
    await flushPromises();
    const button = q(element, '[data-id="submit"]');
    expect(button.disabled).toBe(true);

    await setField(element, "authorName", "Ada");
    await setField(element, "relationship", "Peer");
    expect(button.disabled).toBe(true);

    await setField(element, "context", "   ");
    expect(button.disabled).toBe(true);

    await setField(element, "context", "Great work");
    expect(button.disabled).toBe(false);

    await setField(element, "authorName", "x".repeat(MAX_NAME_LENGTH + 1));
    expect(button.disabled).toBe(true);
    await setField(element, "authorName", "x".repeat(MAX_NAME_LENGTH));
    expect(button.disabled).toBe(false);

    await setField(element, "context", "y".repeat(MAX_CONTEXT_LENGTH + 1));
    expect(button.disabled).toBe(true);
    await setField(element, "context", "y".repeat(MAX_CONTEXT_LENGTH));
    expect(button.disabled).toBe(false);

    await setField(element, "authorTitle", "t".repeat(101));
    expect(button.disabled).toBe(true);
    await setField(element, "authorTitle", "");
    await setField(element, "relationship", "");
    expect(button.disabled).toBe(true);

    await submit(element);
    expect(submitTestimonial).not.toHaveBeenCalled();
  });

  it("sets the native length limits to the server limits", async () => {
    const element = createComponent();
    await flushPromises();
    expect(q(element, '[name="authorName"]').maxLength).toBe(80);
    expect(q(element, '[name="authorTitle"]').maxLength).toBe(100);
    expect(q(element, '[name="context"]').maxLength).toBe(255);
    const values = [
      ...element.shadowRoot.querySelectorAll('[name="relationship"] option')
    ].map((o) => o.value);
    expect(values).toEqual([
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
    const element = createComponent();
    await flushPromises();
    await fillValid(element);
    q(element, '[data-id="vibe-toggle"]').click();
    await flushPromises();

    await submit(element);
    await flushPromises();

    expect(submitTestimonial).toHaveBeenCalledTimes(1);
    expect(submitTestimonial).toHaveBeenCalledWith({
      authorName: "Ada Lovelace",
      authorTitle: "CTO",
      relationship: "Peer",
      vibeMode: "Casual",
      context: "Clear designs and calm delivery."
    });

    expect(q(element, '[data-id="success"]').textContent.trim()).toBe(
      "Thank you. Your review was received and will appear once it is approved."
    );
    expect(q(element, '[data-id="error"]')).toBeNull();
    expect(q(element, '[name="authorName"]').value).toBe("");
    expect(q(element, '[name="authorTitle"]').value).toBe("");
    expect(q(element, '[name="context"]').value).toBe("");
    expect(q(element, '[name="relationship"]').value).toBe("");
    expect(
      q(element, '[data-id="vibe-toggle"]').getAttribute("aria-checked")
    ).toBe("false");
    expect(q(element, ".vibe-value").textContent).toBe("Professional");
    expect(q(element, '[data-id="submit"]').disabled).toBe(true);
  });

  it("sends a blank title as null and Professional by default", async () => {
    submitTestimonial.mockResolvedValue("a0B000000000002AAA");
    const element = createComponent();
    await flushPromises();
    await setField(element, "authorName", "Grace");
    await setField(element, "authorTitle", "   ");
    await setField(element, "relationship", "Fan");
    await setField(element, "context", "Fun site");

    await submit(element);
    await flushPromises();

    expect(submitTestimonial).toHaveBeenCalledWith({
      authorName: "Grace",
      authorTitle: null,
      relationship: "Fan",
      vibeMode: "Professional",
      context: "Fun site"
    });
  });

  it("shows the server's rate-limit message and keeps the input", async () => {
    submitTestimonial.mockRejectedValue({
      body: { message: "Too many submissions. Try again in a minute." }
    });
    const element = createComponent();
    await flushPromises();
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

  it("shows any server validation message as sent", async () => {
    submitTestimonial.mockRejectedValue({
      body: { message: "Your name can be at most 80 characters." }
    });
    const element = createComponent();
    await flushPromises();
    await fillValid(element);
    await submit(element);
    await flushPromises();
    expect(q(element, '[data-id="error"]').textContent.trim()).toBe(
      "Your name can be at most 80 characters."
    );
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
    const element = createComponent();
    await flushPromises();
    const toggle = q(element, '[data-id="vibe-toggle"]');
    expect(toggle.getAttribute("role")).toBe("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    toggle.click();
    await flushPromises();
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(q(element, ".vibe-value").textContent).toBe("Casual");
    toggle.click();
    await flushPromises();
    expect(q(element, ".vibe-value").textContent).toBe("Professional");
  });

  it("mirrors the limits and relationships in TestimonialController", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "..", "classes", "TestimonialController.cls"),
      "utf8"
    );
    expect(source).toMatch(
      new RegExp(`MAX_AUTHOR_NAME_LENGTH = ${MAX_NAME_LENGTH};`)
    );
    expect(source).toMatch(
      new RegExp(`MAX_CONTEXT_LENGTH = ${MAX_CONTEXT_LENGTH};`)
    );
    const block = source.match(/RELATIONSHIPS = new Set<String>\{([^}]*)\}/)[1];
    const serverValues = block.match(/'([^']+)'/g).map((v) => v.slice(1, -1));
    expect(serverValues).toEqual(RELATIONSHIPS);
  });
});
