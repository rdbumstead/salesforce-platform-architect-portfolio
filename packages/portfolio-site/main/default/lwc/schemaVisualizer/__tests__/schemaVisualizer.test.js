/**
 * @description       : Unit tests for schemaVisualizer LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SchemaVisualizer from "c/schemaVisualizer";

describe("c-schema-visualizer", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("removes loading spinner after render logic", async () => {
    jest.useFakeTimers();
    const element = createElement("c-schema-visualizer", {
      is: SchemaVisualizer
    });
    document.body.appendChild(element);

    // Fast-forward time
    jest.runAllTimers();

    await Promise.resolve();

    const spinner = element.shadowRoot.querySelector("lightning-spinner");
    expect(spinner).toBeNull();

    const chart = element.shadowRoot.querySelector(".mock-chart");
    expect(chart).not.toBeNull();
  });
});
