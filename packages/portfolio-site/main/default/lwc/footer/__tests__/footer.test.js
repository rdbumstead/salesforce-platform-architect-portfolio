/**
 * @description       : Unit tests for footer LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { createElement } from "@lwc/engine-dom";
import Footer from "c/footer";

describe("c-footer", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("displays the copyright year", () => {
    const element = createElement("c-footer", {
      is: Footer
    });
    document.body.appendChild(element);

    const p = element.shadowRoot.querySelector("p");
    expect(p.textContent).toContain("Ryan Bumstead");
    expect(p.textContent).toContain(String(new Date().getFullYear()));
  });

  it("links to GitHub and LinkedIn in a new tab", () => {
    const element = createElement("c-footer", {
      is: Footer
    });
    document.body.appendChild(element);

    const links = Array.from(
      element.shadowRoot.querySelectorAll(".links a")
    ).map((a) => ({
      text: a.textContent.trim(),
      href: a.getAttribute("href"),
      target: a.getAttribute("target")
    }));
    expect(links).toEqual([
      { text: "GitHub", href: "https://github.com/rdbumstead", target: "_blank" },
      {
        text: "LinkedIn",
        href: "https://linkedin.com/in/ryanbumstead",
        target: "_blank"
      }
    ]);
  });

  it("hides the deploy badge when the image fails to load", () => {
    const element = createElement("c-footer", {
      is: Footer
    });
    document.body.appendChild(element);

    const badge = element.shadowRoot.querySelector(".badge-container img");
    expect(badge).not.toBeNull();
    badge.dispatchEvent(new CustomEvent("error"));
    expect(badge.style.display).toBe("none");
  });
});
