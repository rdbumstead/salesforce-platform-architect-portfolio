/**
 * @description       : Unit tests for the testimonialWall LWC (Round 7 B2).
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
    sentence: "I'm a peer, and Ryan speaks fluent Flow. The result? We stan.",
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

  it("renders nothing until there is an approved testimonial", async () => {
    const element = createComponent();
    await flushPromises();
    expect(element.shadowRoot.children.length).toBe(0);
    getApprovedTestimonials.emit([]);
    await flushPromises();
    expect(q(element, "section")).toBeNull();
  });

  it("renders nothing when the read fails", async () => {
    const element = createComponent();
    getApprovedTestimonials.error();
    await flushPromises();
    expect(q(element, "section")).toBeNull();
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
});
