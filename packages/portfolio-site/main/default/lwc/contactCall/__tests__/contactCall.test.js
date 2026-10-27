/**
 * @description       : Unit tests for contactCall: the one line prompt, the link to
 *                      /contact, and the redirect of an old #contact address on load and on
 *                      hashchange.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ContactCall, { contactHref } from "c/contactCall";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

const realLocation = window.location;
let replace;

function render() {
  const element = createElement("c-contact-call", { is: ContactCall });
  document.body.appendChild(element);
  return element;
}

function setHash(hash) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { hash, pathname: "/portfolio/", replace }
  });
}

describe("c-contact-call", () => {
  beforeEach(() => {
    replace = jest.fn();
    setHash("");
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation
    });
  });

  it("shows the heading, one sentence and a real link to /contact", () => {
    const element = render();
    const root = element.shadowRoot;
    expect(root.querySelector("h2").textContent).toBe("Get in touch");
    expect(root.querySelectorAll("p")).toHaveLength(2);
    expect(root.querySelector("p").textContent).toBe(
      "Questions about a project, a role or this site?"
    );
    expect(root.querySelector('[data-id="contact-note"]').textContent).toBe(
      "References available on request."
    );
    const link = root.querySelector('[data-id="contact-link"]');
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/portfolio/contact");
    expect(link.textContent).toBe("Contact Ryan");
    expect(link.getAttribute("target")).toBeNull();
    expect(root.querySelector("form")).toBeNull();
  });

  it("hides the note when the page builder leaves it blank", async () => {
    const element = createElement("c-contact-call", { is: ContactCall });
    element.note = "  ";
    document.body.appendChild(element);
    await Promise.resolve();
    expect(
      element.shadowRoot.querySelector('[data-id="contact-note"]')
    ).toBeNull();
    element.note = "Write any time.";
    await Promise.resolve();
    expect(
      element.shadowRoot.querySelector('[data-id="contact-note"]').textContent
    ).toBe("Write any time.");
  });

  it("names its section by the heading", () => {
    const element = render();
    const section = element.shadowRoot.querySelector("section");
    const heading = element.shadowRoot.querySelector("h2");
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
  });

  it("takes its words from the page builder", async () => {
    const element = createElement("c-contact-call", { is: ContactCall });
    element.heading = "Say hello";
    element.text = "Write any time.";
    element.linkLabel = "Write to Ryan";
    document.body.appendChild(element);
    await Promise.resolve();
    expect(element.shadowRoot.querySelector("h2").textContent).toBe(
      "Say hello"
    );
    expect(
      element.shadowRoot.querySelector('[data-id="contact-link"]').textContent
    ).toBe("Write to Ryan");
  });

  it("sends an old #contact address on to /contact on load", () => {
    setHash("#contact");
    render();
    expect(replace).toHaveBeenCalledWith("/portfolio/contact");
  });

  it("stays put without the old hash", () => {
    setHash("#other");
    render();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends the visitor on when the hash changes to #contact later", () => {
    render();
    expect(replace).not.toHaveBeenCalled();
    setHash("#contact");
    window.dispatchEvent(new CustomEvent("hashchange"));
    expect(replace).toHaveBeenCalledWith("/portfolio/contact");
  });

  it("stops listening for hash changes when removed", () => {
    const element = render();
    document.body.removeChild(element);
    setHash("#contact");
    window.dispatchEvent(new CustomEvent("hashchange"));
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not throw when the location call is blocked", () => {
    replace = jest.fn(() => {
      throw new Error("blocked");
    });
    setHash("#contact");
    expect(() => render()).not.toThrow();
  });

  it("builds the contact href under the base path", () => {
    expect(contactHref()).toBe("/portfolio/contact");
  });
});
