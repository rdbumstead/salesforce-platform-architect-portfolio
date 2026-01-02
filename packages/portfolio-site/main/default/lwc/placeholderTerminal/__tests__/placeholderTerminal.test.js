import { createElement } from "@lwc/engine-dom";
import PlaceholderTerminal from "c/placeholderTerminal";

describe("c-placeholder-terminal", () => {
  afterEach(() => {
    // The jsdom instance is shared across test cases in a single file so reset the DOM
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
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
});
