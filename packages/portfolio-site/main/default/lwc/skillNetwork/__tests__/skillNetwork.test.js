/**
 * @description       : Unit tests for skillNetwork LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SkillNetwork from "c/skillNetwork";

describe("c-skill-network", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders without crashing", () => {
    const element = createElement("c-skill-network", {
      is: SkillNetwork
    });
    document.body.appendChild(element);

    const container = element.shadowRoot.querySelector(".graph-container");
    expect(container).not.toBeNull();
  });
});
