/**
 * @description       : Unit tests for codeViewer LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import CodeViewer from "c/codeViewer";

describe("c-code-viewer", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders without crashing", () => {
    const element = createElement("c-code-viewer", {
      is: CodeViewer
    });
    document.body.appendChild(element);

    const card = element.shadowRoot.querySelector("lightning-card");
    expect(card).not.toBeNull();
  });
});
