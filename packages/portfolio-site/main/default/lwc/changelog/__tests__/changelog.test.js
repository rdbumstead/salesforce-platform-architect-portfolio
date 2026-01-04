/**
 * @description       : Unit tests for changelog LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import Changelog from "c/changelog";

describe("c-changelog", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders correctly", async () => {
    const element = createElement("c-changelog", {
      is: Changelog
    });
    document.body.appendChild(element);

    // Wait for initial render
    await Promise.resolve();

    // Verify component renders
    expect(element.shadowRoot).not.toBeNull();
  });

  it("displays commits after loading", async () => {
    const element = createElement("c-changelog", {
      is: Changelog
    });
    document.body.appendChild(element);

    // Wait for DOM
    await Promise.resolve();

    // Fast-forward timers to load data
    jest.advanceTimersByTime(600);

    // Wait for re-render
    await Promise.resolve();

    const items = element.shadowRoot.querySelectorAll("li");
    expect(items.length).toBe(3); // Updated to 3 items
  });
});
