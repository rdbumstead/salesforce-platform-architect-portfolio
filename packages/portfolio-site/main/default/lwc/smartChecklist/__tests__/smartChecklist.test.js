/**
 * @description       : Unit tests for smartChecklist LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SmartChecklist from "c/smartChecklist";

describe("c-smart-checklist", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("displays items", () => {
    const element = createElement("c-smart-checklist", {
      is: SmartChecklist
    });
    document.body.appendChild(element);

    const items = element.shadowRoot.querySelectorAll("li");
    expect(items.length).toBeGreaterThan(0);
  });
});
