/**
 * @description       : Unit tests for homeTestimonials: the quotes once the server sends
 *                      them, up to three in the order sent, each in its tone, and the link to
 *                      every testimonial. Until then nothing at all, since the credentials strip
 *                      is gone.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
import { createElement } from "@lwc/engine-dom";
import HomeTestimonials from "c/homeTestimonials";
import getHomeTestimonials from "@salesforce/apex/TestimonialController.getHomeTestimonials";

jest.mock(
  "@salesforce/apex/TestimonialController.getHomeTestimonials",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

const QUOTES = [
  {
    key: "a1",
    authorName: "Ada",
    authorTitle: "CTO",
    relationship: "Manager",
    vibe: "Professional",
    sentence: "  I'm a manager, and Ryan ships. The result? It works.  ",
    note: "A private note",
    professional: true
  },
  {
    key: "b2",
    authorName: "Bo",
    authorTitle: null,
    relationship: "Peer",
    vibe: "Casual",
    sentence: "I'm a peer, and Ryan is fun.",
    professional: false
  },
  {
    key: "c3",
    authorName: "Cy",
    authorTitle: "Lead",
    relationship: "Fan",
    vibe: "Professional",
    sentence: "I'm a fan or visitor, and Ryan explains well.",
    professional: false
  }
];

function render() {
  const element = createElement("c-home-testimonials", {
    is: HomeTestimonials
  });
  document.body.appendChild(element);
  return element;
}

function flush() {
  return Promise.resolve();
}

function text(node) {
  return node.textContent.replace(/\s+/g, " ").trim();
}

describe("c-home-testimonials", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("reads getHomeTestimonials, which takes no parameters", () => {
    render();
    expect(getHomeTestimonials.getLastConfig()).toEqual({});
  });

  it("renders nothing before the wire returns", () => {
    const element = render();
    expect(element.shadowRoot.querySelector("section")).toBeNull();
  });

  it("renders nothing while the server sends no quotes, a null or an error", async () => {
    const element = render();
    const section = () => element.shadowRoot.querySelector("section");
    getHomeTestimonials.emit([]);
    await flush();
    expect(section()).toBeNull();

    getHomeTestimonials.emit(QUOTES);
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-id="quotes"]')
    ).not.toBeNull();

    getHomeTestimonials.emit(null);
    await flush();
    expect(section()).toBeNull();

    getHomeTestimonials.emit(QUOTES);
    await flush();
    getHomeTestimonials.error();
    await flush();
    expect(section()).toBeNull();
  });

  it("no longer holds the credentials strip, the Trailhead link or the references line", async () => {
    const element = render();
    getHomeTestimonials.emit([]);
    await flush();
    const root = element.shadowRoot;
    expect(root.querySelector('[data-id="credentials"]')).toBeNull();
    expect(root.querySelector('[data-id="trailhead-link"]')).toBeNull();
    expect(root.textContent).not.toMatch(/References available on request/);
  });

  it("shows no numbered eyebrow over the quotes heading", async () => {
    const element = render();
    getHomeTestimonials.emit(QUOTES);
    await flush();
    expect(element.shadowRoot.querySelector(".section-label")).toBeNull();
    expect(text(element.shadowRoot.querySelector("h2"))).toBe(
      "What people say."
    );
  });

  it("shows the quotes in the order sent, trimmed, with author and byline", async () => {
    const element = render();
    getHomeTestimonials.emit(QUOTES);
    await flush();
    const root = element.shadowRoot;
    const section = root.querySelector("section");
    const heading = root.querySelector("h2");
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(text(heading)).toBe("What people say.");
    expect(text(root.querySelector(".section-intro"))).toBe(
      "A few quotes from the testimonial wall."
    );
    const cards = root.querySelectorAll('[data-id="quote"]');
    expect(cards).toHaveLength(3);
    expect(text(cards[0].querySelector("blockquote"))).toBe(
      "I'm a manager, and Ryan ships. The result? It works."
    );
    expect(text(cards[0].querySelector(".author"))).toBe("Ada");
    expect(text(cards[0].querySelector(".detail"))).toBe("CTO, Manager");
    expect(text(cards[1].querySelector(".detail"))).toBe("Peer");
    expect(text(cards[2].querySelector(".detail"))).toBe(
      "Lead, Fan or visitor"
    );
  });

  it("never shows the reviewer's note on the home page", async () => {
    const element = render();
    getHomeTestimonials.emit(QUOTES);
    await flush();
    expect(element.shadowRoot.textContent).not.toContain("A private note");
  });

  it("keeps each quote's tone in its class and its tag, not in colour alone", async () => {
    const element = render();
    getHomeTestimonials.emit(QUOTES);
    await flush();
    const cards = element.shadowRoot.querySelectorAll('[data-id="quote"]');
    expect(cards[0].className).toBe("card card-professional");
    expect(text(cards[0].querySelector(".tone"))).toBe("Professional");
    expect(cards[1].className).toBe("card card-casual");
    expect(text(cards[1].querySelector(".tone"))).toBe("Casual");
  });

  it("shows at most three quotes and drops one with no sentence", async () => {
    const element = render();
    getHomeTestimonials.emit([
      { ...QUOTES[0], key: "x", sentence: "   " },
      ...QUOTES,
      { ...QUOTES[1], key: "d4", authorName: "Di" }
    ]);
    await flush();
    const cards = element.shadowRoot.querySelectorAll('[data-id="quote"]');
    expect(cards).toHaveLength(3);
    expect(text(cards[0].querySelector(".author"))).toBe("Ada");
    expect(element.shadowRoot.textContent).not.toContain("Di");
  });

  it("links to every testimonial on the site's own path", async () => {
    const element = render();
    getHomeTestimonials.emit(QUOTES);
    await flush();
    const link = element.shadowRoot.querySelector('[data-id="wall-link"]');
    expect(link.getAttribute("href")).toBe("/portfolio/testimonials");
    expect(link.getAttribute("target")).toBeNull();
    expect(text(link)).toBe("Read every testimonial →");
  });

  it("shows one card per quote, up to three, with no big number", async () => {
    const element = render();
    getHomeTestimonials.emit(QUOTES);
    await flush();
    const root = element.shadowRoot;
    expect(root.querySelectorAll(".card")).toHaveLength(
      Math.min(QUOTES.length, 3)
    );
    expect(root.querySelector(".metric-number")).toBeNull();
  });

  it("has one secondary button and no primary button", async () => {
    const element = render();
    getHomeTestimonials.emit(QUOTES);
    await flush();
    const root = element.shadowRoot;
    expect(root.querySelectorAll(".btn")).toHaveLength(1);
    expect(root.querySelectorAll(".btn-primary")).toHaveLength(0);
    expect(
      root
        .querySelector('[data-id="wall-link"]')
        .classList.contains("btn-secondary")
    ).toBe(true);
  });
});
