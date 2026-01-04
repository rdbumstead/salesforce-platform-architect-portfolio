/**
 * @description       : Unit tests for testimonialSubmit LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import TestimonialSubmit from "c/testimonialSubmit";

describe("c-testimonial-submit", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders correctly", async () => {
    const element = createElement("c-testimonial-submit", {
      is: TestimonialSubmit
    });
    document.body.appendChild(element);

    await Promise.resolve();

    // Verify component renders
    const heading = element.shadowRoot.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading.textContent).toContain("Review");
  });

  it("renders relationship combobox", async () => {
    const element = createElement("c-testimonial-submit", {
      is: TestimonialSubmit
    });
    document.body.appendChild(element);

    await Promise.resolve();

    const combobox = element.shadowRoot.querySelector("lightning-combobox");
    expect(combobox).not.toBeNull();
  });

  it("renders submit button", async () => {
    const element = createElement("c-testimonial-submit", {
      is: TestimonialSubmit
    });
    document.body.appendChild(element);

    await Promise.resolve();

    const button = element.shadowRoot.querySelector("lightning-button");
    expect(button).not.toBeNull();
  });
});
