/**
 * @description       : Unit tests for resumeBuilder LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ResumeBuilder from "c/resumeBuilder";

describe("c-resume-builder", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("updates persona on selection", async () => {
    const element = createElement("c-resume-builder", {
      is: ResumeBuilder
    });
    document.body.appendChild(element);

    const combobox = element.shadowRoot.querySelector("lightning-combobox");
    combobox.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Developer" } })
    );

    await Promise.resolve();

    // Check if header text updated (mock logic)
    const header = element.shadowRoot.querySelector("p.slds-text-body_small");
    expect(header.textContent).toContain("Developer");
  });
});
