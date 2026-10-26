/**
 * @description       : Unit tests for pillarAWalkthrough.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { createElement } from "@lwc/engine-dom";
import PillarAWalkthrough, { WALKTHROUGH_STEPS } from "c/pillarAWalkthrough";

function build() {
  const element = createElement("c-pillar-a-walkthrough", {
    is: PillarAWalkthrough
  });
  document.body.appendChild(element);
  return element;
}

describe("c-pillar-a-walkthrough", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("draws a heading before the steps and labels the section by it", () => {
    const element = build();
    const heading = element.shadowRoot.querySelector("h2.walkthrough-heading");
    const section = element.shadowRoot.querySelector("section");
    expect(heading.textContent.trim()).toBe("The walkthrough");
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(
      section.compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_CONTAINED_BY
    ).toBeTruthy();
  });

  it("lists all eight steps in order as an ordered list", () => {
    const element = build();
    const items = element.shadowRoot.querySelectorAll("ol.steps > li");
    expect(items).toHaveLength(8);
    expect(WALKTHROUGH_STEPS).toHaveLength(8);
    items.forEach((li, i) => {
      expect(li.textContent.trim()).toBe(WALKTHROUGH_STEPS[i]);
    });
  });

  it("starts at the employer form and ends at the partner's account", () => {
    expect(WALKTHROUGH_STEPS[0]).toContain("Employer Form");
    expect(WALKTHROUGH_STEPS[7]).toContain("partner's account");
  });
});
