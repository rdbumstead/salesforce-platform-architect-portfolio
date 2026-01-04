/**
 * @description       : Unit tests for footer LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { createElement } from "@lwc/engine-dom";
import Footer from "c/footer";

describe("c-footer", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("displays the copyright year", () => {
    const element = createElement("c-footer", {
      is: Footer
    });
    document.body.appendChild(element);

    const p = element.shadowRoot.querySelector("p");
    expect(p.textContent).toContain("Ryan Bumstead");
  });
});
