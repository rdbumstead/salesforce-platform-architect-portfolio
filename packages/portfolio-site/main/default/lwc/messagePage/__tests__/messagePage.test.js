import { createElement } from "@lwc/engine-dom";
import MessagePage from "c/messagePage";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

function mount(props = {}) {
  const element = createElement("c-message-page", { is: MessagePage });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

describe("c-message-page", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("draws the eyebrow, one h1 and the message", () => {
    const root = mount({
      eyebrow: "Error 404",
      heading: "That page is not here",
      body: "Try the home page."
    }).shadowRoot;
    expect(root.querySelector(".message-eyebrow").textContent).toBe(
      "Error 404"
    );
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    expect(root.querySelector("h1").textContent).toBe("That page is not here");
    expect(root.querySelector(".message-body").textContent).toBe(
      "Try the home page."
    );
  });

  it("links home under the base path when asked", () => {
    const link = mount({
      heading: "Lost",
      showHome: true
    }).shadowRoot.querySelector(".message-home");
    expect(link.getAttribute("href")).toBe("/portfolio/");
    expect(link.textContent).toBe("Go to the home page");
  });

  it("takes the home link text from the property", () => {
    const link = mount({
      heading: "Lost",
      showHome: "true",
      homeLabel: "Back home"
    }).shadowRoot.querySelector(".message-home");
    expect(link.textContent).toBe("Back home");
  });

  it("draws a Try again button that reloads the page when it has a label", () => {
    const original = window.location;
    const reload = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload }
    });
    try {
      const root = mount({
        heading: "Busy",
        retryLabel: "Try again",
        showHome: true
      }).shadowRoot;
      const button = root.querySelector(".message-retry");
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("button");
      expect(button.textContent.trim()).toBe("Try again");
      expect(root.querySelector(".message-home")).not.toBeNull();
      button.click();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original
      });
    }
  });

  it("draws no Try again button when the label is blank", () => {
    const root = mount({ heading: "Busy", retryLabel: "  " }).shadowRoot;
    expect(root.querySelector(".message-retry")).toBeNull();
    expect(root.querySelector(".message-actions")).toBeNull();
  });

  it("shows no home link and no empty paragraphs by default", () => {
    const root = mount({ heading: "Busy" }).shadowRoot;
    expect(root.querySelector(".message-home")).toBeNull();
    expect(root.querySelector(".message-eyebrow")).toBeNull();
    expect(root.querySelector(".message-body")).toBeNull();
  });
});
