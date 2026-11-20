/**
 * @description       : Unit tests for the testimonialWall LWC.
 *                      getApprovedTestimonials is a mocked wire adapter.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { createElement } from "@lwc/engine-dom";
import TestimonialWall from "c/testimonialWall";
import getApprovedTestimonials from "@salesforce/apex/TestimonialController.getApprovedTestimonials";

jest.mock(
  "@salesforce/apex/TestimonialController.getApprovedTestimonials",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

const ITEMS = [
  {
    key: "a1",
    authorName: "Pro Manager",
    authorTitle: "Director",
    relationship: "Manager",
    vibe: "Professional",
    sentence:
      "I'm a manager, and Ryan explains the complex simply. The result? We launched on time.",
    note: "Calm and clear.",
    professional: true
  },
  {
    key: "b2",
    authorName: "Fun Peer",
    authorTitle: null,
    relationship: "Peer",
    vibe: "Casual",
    sentence:
      "I'm a peer, and Ryan speaks fluent Flow. The result? Instant fan.",
    note: null,
    professional: false
  },
  {
    key: "c3",
    authorName: "A Visitor",
    authorTitle: null,
    relationship: "Fan",
    vibe: "Professional",
    sentence:
      "I'm a fan or visitor, and Ryan explains the complex simply. The result? Every conversation left me sharper.",
    note: null,
    professional: false
  }
];

function createComponent() {
  const element = createElement("c-testimonial-wall", { is: TestimonialWall });
  document.body.appendChild(element);
  return element;
}

function q(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function cards(element) {
  return [...element.shadowRoot.querySelectorAll('[data-id="card"]')];
}

describe("c-testimonial-wall", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders nothing until the read answers, then says there are no reviews yet", async () => {
    const element = createComponent();
    await flushPromises();
    expect(element.shadowRoot.children.length).toBe(0);
    expect(element.classList.contains("is-empty")).toBe(true);
    getApprovedTestimonials.emit([]);
    await flushPromises();
    expect(q(element, ".wall-filter, .filter")).toBeNull();
    expect(q(element, '[data-id="no-reviews"]').textContent).toContain(
      "no reviews yet"
    );
    expect(element.classList.contains("is-empty")).toBe(false);
  });

  it("says there are no reviews yet when the read fails too", async () => {
    const element = createComponent();
    getApprovedTestimonials.error();
    await flushPromises();
    expect(q(element, '[data-id="no-reviews"]')).not.toBeNull();
    expect(q(element, "ul")).toBeNull();
  });

  it("drops the empty line once a testimonial is approved", async () => {
    const element = createComponent();
    getApprovedTestimonials.emit([]);
    await flushPromises();
    getApprovedTestimonials.emit(ITEMS);
    await flushPromises();
    expect(q(element, '[data-id="no-reviews"]')).toBeNull();
    expect(cards(element)).toHaveLength(3);
  });

  it("hides the host until the read answers, so it takes no gap", async () => {
    const element = createComponent();
    expect(element.classList.contains("is-empty")).toBe(true);
    getApprovedTestimonials.emit(ITEMS);
    await flushPromises();
    expect(element.classList.contains("is-empty")).toBe(false);
  });

  it("draws the filter as shared toggles and the tone as the shared pill", async () => {
    const element = createComponent();
    getApprovedTestimonials.emit(ITEMS);
    await flushPromises();
    const buttons = [...element.shadowRoot.querySelectorAll(".filter button")];
    expect(buttons.length).toBe(2);
    buttons.forEach((button) => {
      expect(button.classList.contains("nc-toggle")).toBe(true);
    });
    expect(q(element, ".tone").classList.contains("pill")).toBe(true);
    expect(q(element, "h2").classList.contains("section-heading")).toBe(true);
  });

  it("shows every approved testimonial by default, each in its tone", async () => {
    const element = createComponent();
    getApprovedTestimonials.emit(ITEMS);
    await flushPromises();
    expect(q(element, "h2").textContent).toBe("What people say");
    const shown = cards(element);
    expect(shown).toHaveLength(3);
    expect(shown[0].className).toContain("card-professional");
    expect(shown[1].className).toContain("card-casual");
    expect(shown[0].querySelector(".tone").textContent).toBe("Professional");
    expect(shown[1].querySelector(".tone").textContent).toBe("Casual");
    expect(shown[0].querySelector("blockquote").textContent).toContain(
      "Calm and clear."
    );
    expect(shown[0].querySelector(".detail").textContent).toBe(
      "Director, Manager"
    );
    expect(shown[2].querySelector(".detail").textContent).toBe(
      "Fan or visitor"
    );
    expect(q(element, '[data-id="count"]').textContent).toBe(
      "Showing all 3 testimonials."
    );
  });

  it("the Professional filter keeps the API feed's professional rows", async () => {
    const element = createComponent();
    getApprovedTestimonials.emit(ITEMS);
    await flushPromises();
    const all = q(element, '[data-id="filter-all"]');
    const pro = q(element, '[data-id="filter-professional"]');
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(pro.getAttribute("aria-pressed")).toBe("false");

    pro.click();
    await flushPromises();
    expect(pro.getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");
    expect(
      cards(element).map((c) => c.querySelector(".author").textContent)
    ).toEqual(["Pro Manager"]);
    const count = q(element, '[data-id="count"]');
    expect(count.getAttribute("aria-live")).toBe("polite");
    expect(count.textContent).toBe("Showing 1 professional testimonial.");

    all.click();
    await flushPromises();
    expect(cards(element)).toHaveLength(3);
  });

  it("explains an empty Professional view", async () => {
    const element = createComponent();
    getApprovedTestimonials.emit([ITEMS[1]]);
    await flushPromises();
    q(element, '[data-id="filter-professional"]').click();
    await flushPromises();
    expect(cards(element)).toHaveLength(0);
    expect(q(element, '[data-id="empty"]').textContent).toContain("Choose All");
    expect(q(element, '[data-id="count"]').textContent).toBe(
      "Showing 0 professional testimonials."
    );
  });

  it("groups the filter buttons with a name", async () => {
    const element = createComponent();
    getApprovedTestimonials.emit(ITEMS);
    await flushPromises();
    const group = q(element, '[role="group"]');
    expect(group.getAttribute("aria-label")).toBe("Show testimonials");
  });

  describe("analytics", () => {
    beforeEach(() => {
      window.gtag = jest.fn();
    });

    afterEach(() => {
      delete window.gtag;
    });

    it("sends testimonials_filtered with the new filter on each switch", async () => {
      const element = createComponent();
      getApprovedTestimonials.emit(ITEMS);
      await flushPromises();

      q(element, '[data-id="filter-professional"]').click();
      await flushPromises();
      q(element, '[data-id="filter-all"]').click();
      await flushPromises();

      expect(window.gtag.mock.calls).toEqual([
        ["event", "testimonials_filtered", { filter: "professional" }],
        ["event", "testimonials_filtered", { filter: "all" }]
      ]);
    });

    it("sends nothing for the filter already shown", async () => {
      const element = createComponent();
      getApprovedTestimonials.emit(ITEMS);
      await flushPromises();
      q(element, '[data-id="filter-all"]').click();
      await flushPromises();
      expect(window.gtag).not.toHaveBeenCalled();
      expect(
        q(element, '[data-id="filter-all"]').getAttribute("aria-pressed")
      ).toBe("true");
    });
  });
});

describe("c-testimonial-wall live data marker", () => {
  it("places the live data marker with the sources the section reads", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const html = readFileSync(
      join(__dirname, "..", "testimonialWall.html"),
      "utf8"
    );
    const marker = html.match(/<c-data-source\s([^>]*)>\s*<\/c-data-source>/);
    expect(marker).not.toBeNull();
    expect(marker[1]).toMatch(/source-keys="TestimonialController_Approved"/);
    expect(marker[1]).not.toMatch(/objects=/);
    expect(marker[1]).not.toMatch(/hide-counts/);
  });
});
