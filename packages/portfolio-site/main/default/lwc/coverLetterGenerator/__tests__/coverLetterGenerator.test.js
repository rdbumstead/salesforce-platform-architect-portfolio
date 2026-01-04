/**
 * @description       : Unit tests for coverLetterGenerator LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import CoverLetterGenerator from "c/coverLetterGenerator";

describe("c-cover-letter-generator", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders input fields", () => {
    const element = createElement("c-cover-letter-generator", {
      is: CoverLetterGenerator
    });
    document.body.appendChild(element);

    const inputs = element.shadowRoot.querySelectorAll("lightning-input");
    expect(inputs.length).toBeGreaterThan(0);
  });
});
