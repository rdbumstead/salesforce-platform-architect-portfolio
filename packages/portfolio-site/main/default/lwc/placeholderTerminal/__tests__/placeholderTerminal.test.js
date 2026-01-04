/**
 * @description       : Unit tests for placeholderTerminal LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { createElement } from "@lwc/engine-dom";
import PlaceholderTerminal from "c/placeholderTerminal";

describe("c-placeholder-terminal", () => {
  afterEach(() => {
    // The jsdom instance is shared across test cases in a single file so reset the DOM
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    // Clear sessionStorage to avoid state pollution
    sessionStorage.clear();
    jest.clearAllMocks();
  });

  it("renders the terminal container in light DOM", () => {
    // Arrange
    const element = createElement("c-placeholder-terminal", {
      is: PlaceholderTerminal
    });

    // Act
    document.body.appendChild(element);

    // Assert
    // In Light DOM, we query the element directly, not shadowRoot
    const container = element.querySelector(".terminal-container");
    expect(container).not.toBeNull();
  });
  it("skips animation for Lighthouse/Bots", async () => {
    // Arrange
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      configurable: true
    });

    const element = createElement("c-placeholder-terminal", {
      is: PlaceholderTerminal
    });

    // Act
    document.body.appendChild(element);

    // Wait for any microtasks (renderedCallback)
    await Promise.resolve();

    // Assert
    // If skipped, CTA container should be visible immediately (showCta = true)
    // We can check if the CTA container class contains "visible" or if displayedLogs is full
    const cta = element.querySelector(".cta-container");
    expect(cta.className).toContain("visible");
  });

  it("runs animation for normal users", async () => {
    // Arrange
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      configurable: true
    });

    const element = createElement("c-placeholder-terminal", {
      is: PlaceholderTerminal
    });

    // Act
    document.body.appendChild(element);

    // Wait for microtasks
    await Promise.resolve();

    // Assert
    // Should NOT be visible yet (animation takes time)
    const cta = element.querySelector(".cta-container");
    // Initial state might have class but opacity is controlled by 'visible' class
    expect(cta.className).not.toContain("visible");
  });
});
