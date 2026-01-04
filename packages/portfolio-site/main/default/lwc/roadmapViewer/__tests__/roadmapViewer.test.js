/**
 * @description       : Unit tests for roadmapViewer LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import RoadmapViewer from "c/roadmapViewer";

describe("c-roadmap-viewer", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders draft roadmap items", async () => {
    const element = createElement("c-roadmap-viewer", {
      is: RoadmapViewer
    });
    document.body.appendChild(element);

    await Promise.resolve();

    // Draft data has columns, check for headers or content
    const columns = element.shadowRoot.querySelectorAll(".slds-col");
    expect(columns.length).toBeGreaterThan(0);
    // Check for specific draft content if possible, or just basic render
    const badges = element.shadowRoot.querySelectorAll("lightning-badge");
    expect(badges.length).toBeGreaterThan(0);
  });
});
