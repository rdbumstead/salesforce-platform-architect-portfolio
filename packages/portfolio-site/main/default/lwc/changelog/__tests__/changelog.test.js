/**
 * @description       : Unit tests for changelog LWC. DeliveryController.getRecentCommits is a
 *                      mocked wire adapter fed with the plan K3 CommitFeed shape.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import Changelog, { ageLabel, formatDate } from "c/changelog";
import getRecentCommits from "@salesforce/apex/DeliveryController.getRecentCommits";

jest.mock(
  "@salesforce/apex/DeliveryController.getRecentCommits",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

const ITEMS = [
  {
    sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    message: "seed: delivery walk",
    authorName: "Ryan Bumstead",
    authorAvatarUrl: "https://avatars.githubusercontent.com/u/1",
    url: "https://github.com/rdbumstead/salesforce-architect-portfolio/commit/a1b2c3d",
    committedAt: "2026-10-21T08:00:00.000Z"
  },
  {
    sha: "ffffeeee0000111122223333444455556666aaaa",
    message: "fix(api): second commit",
    authorName: "Ada Lovelace",
    authorAvatarUrl: null,
    url: "https://github.com/rdbumstead/salesforce-architect-portfolio/commit/ffffeee",
    committedAt: "2026-10-20T23:59:00.000Z"
  }
];

function feed(status, overrides = {}) {
  return {
    items: status === "EMPTY" ? [] : ITEMS,
    fetchedAt: status === "EMPTY" ? null : "2026-10-21T08:05:00.000Z",
    ageMinutes: status === "EMPTY" ? null : 12,
    status,
    ...overrides
  };
}

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

function createComponent() {
  const element = createElement("c-changelog", { is: Changelog });
  document.body.appendChild(element);
  return element;
}

function q(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function qa(element, selector) {
  return element.shadowRoot.querySelectorAll(selector);
}

describe("c-changelog", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("shows a loading line until the wire emits", async () => {
    const element = createComponent();
    await flushPromises();
    expect(q(element, '[data-id="loading"]')).not.toBeNull();
    expect(qa(element, "li")).toHaveLength(0);
  });

  it("FRESH maps every DTO field and shows the age label without warning", async () => {
    const element = createComponent();
    getRecentCommits.emit(feed("FRESH"));
    await flushPromises();

    const rows = qa(element, "li.commit-item");
    expect(rows).toHaveLength(2);
    const first = rows[0];
    expect(first.dataset.sha).toBe(ITEMS[0].sha);
    expect(first.querySelector('[data-id="message"]').textContent).toBe(
      "seed: delivery walk"
    );
    const link = first.querySelector('[data-id="link"]');
    expect(link.textContent).toBe("a1b2c3d");
    expect(link.getAttribute("href")).toBe(ITEMS[0].url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(first.querySelector('[data-id="author"]').textContent).toBe(
      "Ryan Bumstead"
    );
    expect(first.querySelector('[data-id="date"]').textContent).toBe(
      "2026-10-21"
    );
    expect(rows[1].querySelector('[data-id="date"]').textContent).toBe(
      "2026-10-20"
    );

    const age = q(element, '[data-id="age-label"]');
    expect(age.textContent).toBe("Last updated 12 min ago");
    expect(age.classList.contains("age-stale")).toBe(false);
    expect(q(element, '[data-id="status-badge"]')).toBeNull();
    expect(q(element, '[data-id="empty"]')).toBeNull();
    expect(q(element, '[data-id="loading"]')).toBeNull();
  });

  it("STALE shows the commits and the age label in the warning style", async () => {
    const element = createComponent();
    getRecentCommits.emit(feed("STALE", { ageMinutes: 95 }));
    await flushPromises();

    expect(qa(element, "li.commit-item")).toHaveLength(2);
    const age = q(element, '[data-id="age-label"]');
    expect(age.textContent).toBe("Last updated 95 min ago");
    expect(age.classList.contains("age-stale")).toBe(true);
    expect(q(element, '[data-id="status-badge"]')).toBeNull();
  });

  it("EMPTY shows the empty message and no age label", async () => {
    const element = createComponent();
    getRecentCommits.emit(feed("EMPTY"));
    await flushPromises();

    expect(q(element, '[data-id="empty"]').textContent).toBe(
      "No recent updates found."
    );
    expect(qa(element, "li")).toHaveLength(0);
    expect(q(element, '[data-id="age-label"]')).toBeNull();
    expect(q(element, '[data-id="status-badge"]')).toBeNull();
  });

  it("SIMULATED shows a Simulated badge beside the commits", async () => {
    const element = createComponent();
    getRecentCommits.emit(feed("SIMULATED"));
    await flushPromises();

    const badge = q(element, '[data-id="status-badge"]');
    expect(badge.textContent).toBe("Simulated");
    expect(badge.classList.contains("badge-simulated")).toBe(true);
    expect(qa(element, "li.commit-item")).toHaveLength(2);
    expect(q(element, '[data-id="age-label"]').textContent).toBe(
      "Last updated 12 min ago"
    );
  });

  it("DEGRADED shows a Degraded badge beside the commits", async () => {
    const element = createComponent();
    getRecentCommits.emit(feed("DEGRADED"));
    await flushPromises();

    const badge = q(element, '[data-id="status-badge"]');
    expect(badge.textContent).toBe("Degraded");
    expect(badge.classList.contains("badge-degraded")).toBe(true);
    expect(qa(element, "li.commit-item")).toHaveLength(2);
  });

  it("a wire error shows the empty message, never a stack", async () => {
    const element = createComponent();
    getRecentCommits.error({ message: "No access" });
    await flushPromises();

    expect(q(element, '[data-id="empty"]')).not.toBeNull();
    expect(q(element, '[data-id="loading"]')).toBeNull();
    expect(element.shadowRoot.textContent).not.toContain("No access");
  });

  it("formats labels and dates", () => {
    expect(ageLabel(0)).toBe("Last updated 0 min ago");
    expect(ageLabel(null)).toBe("");
    expect(formatDate("not a date")).toBe("");
    expect(formatDate(null)).toBe("");
  });
});
