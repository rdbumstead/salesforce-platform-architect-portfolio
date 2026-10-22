/**
 * @description       : Unit tests for changelog LWC. DeliveryController.getRecentCommits is a
 *                      mocked wire adapter fed with the plan K3 CommitFeed shape.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import Changelog, { STATUS_NOTES, ageLabel, formatDate } from "c/changelog";
import getRecentCommits from "@salesforce/apex/DeliveryController.getRecentCommits";
import { trackEvent } from "c/analyticsService";

jest.mock(
  "@salesforce/apex/DeliveryController.getRecentCommits",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: {
      ROADMAP_VIEWED: "roadmap_viewed",
      CHANGELOG_COMMIT_CLICKED: "changelog_commit_clicked"
    }
  }),
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

  it("renders the outage switch off, labelled, and reads with simulate false", async () => {
    const element = createComponent();
    await flushPromises();

    const input = q(element, '[data-id="simulate-switch"]');
    expect(input.type).toBe("checkbox");
    expect(input.getAttribute("role")).toBe("switch");
    expect(input.checked).toBe(false);
    expect(input.closest("label").textContent.trim()).toBe(
      "Simulate an outage"
    );
    expect(getRecentCommits.getLastConfig()).toEqual({ simulate: false });
  });

  it("turning the switch on re-reads with simulate true and shows SIMULATED", async () => {
    const element = createComponent();
    getRecentCommits.emit(feed("FRESH"));
    await flushPromises();

    const input = q(element, '[data-id="simulate-switch"]');
    input.checked = true;
    input.dispatchEvent(new CustomEvent("change"));
    await flushPromises();
    expect(getRecentCommits.getLastConfig()).toEqual({ simulate: true });

    getRecentCommits.emit(feed("SIMULATED"));
    await flushPromises();
    expect(q(element, '[data-id="status-badge"]').textContent).toBe(
      "Simulated"
    );
    expect(element.shadowRoot.querySelectorAll("li.commit-item")).toHaveLength(
      2
    );
    expect(q(element, '[data-id="status-note"]').textContent.trim()).toBe(
      STATUS_NOTES.SIMULATED
    );

    input.checked = false;
    input.dispatchEvent(new CustomEvent("change"));
    await flushPromises();
    expect(getRecentCommits.getLastConfig()).toEqual({ simulate: false });
  });

  it("DEGRADED explains itself in a live region, FRESH says nothing", async () => {
    const element = createComponent();
    getRecentCommits.emit(feed("DEGRADED"));
    await flushPromises();

    const note = q(element, '[data-id="status-note"]');
    expect(note.getAttribute("aria-live")).toBe("polite");
    expect(note.textContent.trim()).toBe(STATUS_NOTES.DEGRADED);

    getRecentCommits.emit(feed("FRESH"));
    await flushPromises();
    expect(note.textContent.trim()).toBe("");
  });

  it("sends changelog_commit_clicked with the sha when a commit link is clicked", async () => {
    const element = createComponent();
    getRecentCommits.emit(feed("FRESH"));
    await flushPromises();
    expect(trackEvent).not.toHaveBeenCalled();

    const link = qa(element, '[data-id="link"]')[1];
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("changelog_commit_clicked", {
      sha: ITEMS[1].sha
    });
  });

  it("styles only with design tokens, never a hex colour", () => {
    const css = readFileSync(join(__dirname, "..", "changelog.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toMatch(
      /\.simulate-input\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/
    );
  });

  it("formats labels and dates", () => {
    expect(ageLabel(0)).toBe("Last updated 0 min ago");
    expect(ageLabel(null)).toBe("");
    expect(formatDate("not a date")).toBe("");
    expect(formatDate(null)).toBe("");
  });
});
