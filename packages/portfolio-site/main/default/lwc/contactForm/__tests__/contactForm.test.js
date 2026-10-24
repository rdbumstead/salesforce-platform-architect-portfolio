/**
 * @description       : Unit tests for the contactForm LWC.
 *                      ContactFormController.submitContact is a mocked imperative call. The drift
 *                      test reads the controller source so the form limits stay in step.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import ContactForm, {
  MAX_FIRST_NAME,
  MAX_LAST_NAME,
  MAX_EMAIL,
  MAX_COMPANY,
  MAX_MESSAGE,
  RATE_LIMITED_TEXT,
  errorMessage,
  refusedOutcome
} from "c/contactForm";
import submitContact from "@salesforce/apex/ContactFormController.submitContact";

jest.mock(
  "@salesforce/apex/ContactFormController.submitContact",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

function createComponent(props = {}) {
  const element = createElement("c-contact-form", { is: ContactForm });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

function q(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

async function setField(element, name, value) {
  const field = q(element, `[name="${name}"]`);
  field.value = value;
  field.dispatchEvent(new CustomEvent("input"));
  await flushPromises();
}

async function fillValid(element) {
  await setField(element, "firstName", "  Ada ");
  await setField(element, "lastName", " Lovelace ");
  await setField(element, "email", " ada@example.com ");
  await setField(element, "message", "  Hello Ryan  ");
}

async function submit(element) {
  q(element, "form").dispatchEvent(
    new CustomEvent("submit", { cancelable: true })
  );
  await flushPromises();
}

describe("c-contact-form", () => {
  const originalHash = window.location.hash;

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
    window.location.hash = originalHash;
  });

  it("shows the default heading inside a wrapper with id contact", async () => {
    const element = createComponent();
    await flushPromises();
    const wrapper = q(element, ".contact-heading-wrap");
    // The template id is "contact". The test renderer suffixes template ids.
    expect(wrapper.id).toMatch(/^contact/);
    expect(wrapper.querySelector("h2").textContent.trim()).toBe("Get in touch");
  });

  it("takes a heading and an intro", async () => {
    const element = createComponent({
      heading: "Write to Ryan",
      intro: "Questions welcome."
    });
    await flushPromises();
    expect(q(element, "h2").textContent.trim()).toBe("Write to Ryan");
    expect(q(element, ".contact-intro").textContent).toBe("Questions welcome.");
  });

  it("labels every field and shows the privacy note", async () => {
    const element = createComponent();
    await flushPromises();
    for (const id of ["firstName", "lastName", "email", "company", "message"]) {
      const label = element.shadowRoot.querySelector(`label[for^="${id}"]`);
      expect(label).not.toBeNull();
    }
    expect(q(element, '[data-id="privacy"]').textContent).toBe(
      "Your details go only to Ryan, are used only to reply, and are never shared."
    );
  });

  it("sets the native limits to the server limits", async () => {
    const element = createComponent();
    await flushPromises();
    expect(q(element, '[name="firstName"]').maxLength).toBe(MAX_FIRST_NAME);
    expect(q(element, '[name="lastName"]').maxLength).toBe(MAX_LAST_NAME);
    expect(q(element, '[name="email"]').maxLength).toBe(MAX_EMAIL);
    expect(q(element, '[name="company"]').maxLength).toBe(MAX_COMPANY);
    expect(q(element, '[name="message"]').maxLength).toBe(MAX_MESSAGE);
  });

  it("keeps send disabled until the required fields are valid", async () => {
    const element = createComponent();
    await flushPromises();
    const button = q(element, '[data-id="submit"]');
    expect(button.disabled).toBe(true);
    await fillValid(element);
    expect(button.disabled).toBe(false);
    await setField(element, "email", "not-an-email");
    expect(button.disabled).toBe(true);
    await setField(element, "email", "ada@example.com");
    await setField(element, "firstName", " ");
    expect(button.disabled).toBe(true);
    await setField(element, "firstName", "Ada");
    await setField(element, "message", "x".repeat(MAX_MESSAGE + 1));
    expect(button.disabled).toBe(true);
    await submit(element);
    expect(submitContact).not.toHaveBeenCalled();
  });

  it("sends trimmed values with the time and the honeypot, then thanks inline", async () => {
    submitContact.mockResolvedValue({ received: true });
    const element = createComponent();
    await flushPromises();
    await fillValid(element);

    await submit(element);
    await flushPromises();

    expect(submitContact).toHaveBeenCalledWith({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      company: null,
      message: "Hello Ryan",
      website: null,
      elapsedMs: expect.any(Number)
    });
    const success = q(element, '[data-id="success"]');
    expect(success.textContent).toContain("Thanks, check your inbox.");
    expect(q(element, '[data-id="status"]').getAttribute("aria-live")).toBe(
      "polite"
    );
    expect(q(element, "form")).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(success);
  });

  it("sends a company and a filled honeypot as typed", async () => {
    submitContact.mockResolvedValue({ received: true });
    const element = createComponent();
    await flushPromises();
    await fillValid(element);
    await setField(element, "company", " Acme ");
    await setField(element, "website", "https://spam.example");
    await submit(element);
    const args = submitContact.mock.calls[0][0];
    expect(args.company).toBe("Acme");
    expect(args.website).toBe("https://spam.example");
  });

  it("hides the honeypot from people and assistive technology", async () => {
    const element = createComponent();
    await flushPromises();
    const trap = q(element, ".trap");
    expect(trap.getAttribute("aria-hidden")).toBe("true");
    expect(trap.querySelector("input").getAttribute("tabindex")).toBe("-1");
  });

  it("shows the server's message and keeps the input", async () => {
    submitContact.mockRejectedValue({
      body: { message: "Enter a valid email address, like name@example.com." }
    });
    const element = createComponent();
    await flushPromises();
    await fillValid(element);
    await submit(element);
    await flushPromises();
    const error = q(element, '[data-id="error"]');
    expect(error.textContent.trim()).toBe(
      "Enter a valid email address, like name@example.com."
    );
    expect(error.getAttribute("role")).toBe("alert");
    expect(q(element, '[name="lastName"]').value).toBe(" Lovelace ");
    expect(errorMessage(new Error("x"))).toBe(
      "Your message could not be sent. Try again later."
    );
  });

  it("focuses its heading when the address ends in #contact on load", async () => {
    window.location.hash = "#contact";
    const scroll = jest.fn();
    Element.prototype.scrollIntoView = scroll;
    const element = createComponent();
    await flushPromises();
    const heading = q(element, '[data-id="heading"]');
    expect(element.shadowRoot.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(scroll).toHaveBeenCalled();
  });

  it("focuses its heading on a later hashchange to #contact", async () => {
    window.location.hash = "";
    const element = createComponent();
    await flushPromises();
    expect(element.shadowRoot.activeElement).toBeNull();
    window.location.hash = "#contact";
    window.dispatchEvent(new CustomEvent("hashchange"));
    await flushPromises();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="heading"]')
    );
  });

  it("stops listening for hashchange when removed", async () => {
    const remove = jest.spyOn(window, "removeEventListener");
    const element = createComponent();
    await flushPromises();
    document.body.removeChild(element);
    expect(remove).toHaveBeenCalledWith("hashchange", expect.any(Function));
    remove.mockRestore();
  });

  it("mirrors the limits in ContactFormController", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "..", "classes", "ContactFormController.cls"),
      "utf8"
    );
    expect(source).toMatch(new RegExp(`MAX_FIRST_NAME = ${MAX_FIRST_NAME};`));
    expect(source).toMatch(new RegExp(`MAX_LAST_NAME = ${MAX_LAST_NAME};`));
    expect(source).toMatch(new RegExp(`MAX_EMAIL = ${MAX_EMAIL};`));
    expect(source).toMatch(new RegExp(`MAX_COMPANY = ${MAX_COMPANY};`));
    expect(source).toMatch(new RegExp(`MAX_MESSAGE = ${MAX_MESSAGE};`));
  });

  it("mirrors the daily cap message in ContactFormController", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "..", "classes", "ContactFormController.cls"),
      "utf8"
    );
    expect(source).toContain(`RATE_LIMITED_MESSAGE = '${RATE_LIMITED_TEXT}';`);
  });

  describe("analytics", () => {
    beforeEach(() => {
      window.gtag = jest.fn();
    });

    afterEach(() => {
      delete window.gtag;
    });

    function sentParams() {
      return window.gtag.mock.calls
        .filter((call) => call[1] === "contact_form_submitted")
        .map((call) => call[2]);
    }

    it("sends accepted, and nothing the visitor typed, on a saved message", async () => {
      submitContact.mockResolvedValue({ received: true });
      const element = createComponent();
      await flushPromises();
      await fillValid(element);
      await setField(element, "company", "Analytical Engines");
      await submit(element);
      await flushPromises();

      expect(sentParams()).toEqual([{ outcome: "accepted" }]);
      const everything = JSON.stringify(window.gtag.mock.calls);
      for (const typed of [
        "Ada",
        "Lovelace",
        "ada@example.com",
        "Hello",
        "Analytical"
      ]) {
        expect(everything).not.toContain(typed);
      }
    });

    it("sends rate_limited when the daily cap is reached", async () => {
      submitContact.mockRejectedValue({ body: { message: RATE_LIMITED_TEXT } });
      const element = createComponent();
      await flushPromises();
      await fillValid(element);
      await submit(element);
      await flushPromises();
      expect(sentParams()).toEqual([{ outcome: "rate_limited" }]);
    });

    it("sends invalid for any other refusal, without the message", async () => {
      submitContact.mockRejectedValue({
        body: { message: "Enter a valid email address, like name@example.com." }
      });
      const element = createComponent();
      await flushPromises();
      await fillValid(element);
      await submit(element);
      await flushPromises();
      expect(sentParams()).toEqual([{ outcome: "invalid" }]);
      expect(refusedOutcome("anything else")).toBe("invalid");
    });

    it("sends nothing while the form is not valid", async () => {
      const element = createComponent();
      await flushPromises();
      await submit(element);
      await flushPromises();
      expect(submitContact).not.toHaveBeenCalled();
      expect(sentParams()).toEqual([]);
    });
  });
});
