/**
 * @description       : Unit tests for heroBanner LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { createElement } from "@lwc/engine-dom";
import HeroBanner from "c/heroBanner";

describe("c-hero-banner", () => {
  afterEach(() => {
    // The jsdom instance is shared across test cases in a single file so reset the DOM
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("displays the correct greeting", () => {
    const element = createElement("c-hero-banner", {
      is: HeroBanner
    });
    document.body.appendChild(element);

    // Verify h1 text
    const h1 = element.shadowRoot.querySelector("h1");
    expect(h1.textContent).toBe("Hello, I'm Ryan Bumstead.");
  });
});
