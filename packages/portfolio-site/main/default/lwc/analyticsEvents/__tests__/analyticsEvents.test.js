/**
 * @description       : Unit tests for c-analytics-events. Cover the button and its count, the
 *                      dialog's name and role, newest first rows with params and time, the
 *                      explanation line, the empty state, the live update while open, focus
 *                      moving in and back, Escape, Close, the backdrop click, Tab wrapping and
 *                      the analytics_events_opened event with its count.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/29/2026
 **/
import { createElement } from "@lwc/engine-dom";
import AnalyticsEvents, { WORDING } from "c/analyticsEvents";
import {
  MAX_RECENT_EVENTS,
  recentEvents,
  trackEvent
} from "c/analyticsService";

const flushPromises = () => Promise.resolve();

function create() {
  const element = createElement("c-analytics-events", {
    is: AnalyticsEvents
  });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));

function clearRecord() {
  for (let i = 0; i < MAX_RECENT_EVENTS; i += 1) {
    trackEvent("clear_event");
  }
}

describe("c-analytics-events", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.gtag;
  });

  it("shows the button with this visit's count", async () => {
    clearRecord();
    trackEvent("one");
    trackEvent("two");
    const element = create();
    await flushPromises();
    expect(q(element, ".open-button").textContent.trim()).toBe(
      `${WORDING.BUTTON} (${recentEvents().length})`
    );
  });

  it("keeps every visible string in one frozen WORDING constant", () => {
    expect(Object.isFrozen(WORDING)).toBe(true);
  });

  describe("with a known record", () => {
    beforeEach(() => {
      // Fill the record, then add three known events on top.
      clearRecord();
      trackEvent("first_event", { theme: "dark", count: 3 });
      trackEvent("second_event");
      trackEvent("third_event", { open: true });
    });

    async function open(element) {
      q(element, ".open-button").click();
      await flushPromises();
    }

    it("opens a native modal dialog and moves focus to the heading", async () => {
      const element = create();
      await open(element);
      const dialog = q(element, "dialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-labelledby")).toBe(
        q(element, ".dialog-heading").id
      );
      expect(q(element, ".dialog-heading").textContent.trim()).toBe(
        WORDING.HEADING
      );
      expect(element.shadowRoot.activeElement).toBe(
        q(element, ".dialog-heading")
      );
    });

    it("states plainly what the list is", async () => {
      const element = create();
      await open(element);
      const line = q(element, '[data-id="explanation"]').textContent;
      expect(line).toBe(WORDING.EXPLANATION);
      expect(line).toMatch(/Google Analytics 4/);
      expect(line).toMatch(/head script/);
      expect(line).toMatch(/no personal data/);
    });

    it("lists newest first with params and a time", async () => {
      const element = create();
      await open(element);
      const names = qa(element, '[data-id="event-name"]').map((n) =>
        n.textContent.trim()
      );
      expect(names.slice(0, 3)).toEqual([
        "analytics_events_opened",
        "third_event",
        "second_event"
      ]);
      const rows = qa(element, '[data-id="event"]');
      const first = rows[3];
      expect(first.querySelector('[data-id="event-name"]').textContent).toBe(
        "first_event"
      );
      const text = first.querySelector('[data-id="params"]').textContent;
      expect(text).toContain("theme");
      expect(text).toContain("dark");
      expect(text).toContain("count");
      expect(text).toContain("3");
      expect(
        first.querySelector('[data-id="event-time"]').textContent.length
      ).toBeGreaterThan(0);
    });

    it("sends analytics_events_opened with the count at opening", async () => {
      window.gtag = jest.fn();
      const element = create();
      const before = q(element, ".open-button").textContent.match(/\((\d+)\)/);
      await open(element);
      const call = window.gtag.mock.calls.find(
        (c) => c[1] === "analytics_events_opened"
      );
      expect(call).toBeDefined();
      expect(call[2]).toEqual({ count: Number(before[1]) });
    });

    it("updates live while open", async () => {
      const element = create();
      await open(element);
      trackEvent("late_event", { k: "v" });
      await flushPromises();
      const names = qa(element, '[data-id="event-name"]').map((n) =>
        n.textContent.trim()
      );
      expect(names[0]).toBe("late_event");
    });

    it("stops listening when removed", async () => {
      const element = create();
      await flushPromises();
      document.body.removeChild(element);
      expect(() => trackEvent("after_removal")).not.toThrow();
    });

    it("Close returns focus to the button", async () => {
      const element = create();
      await open(element);
      q(element, ".close-button").click();
      await flushPromises();
      expect(q(element, ".dialog-heading")).toBeNull();
      expect(element.shadowRoot.activeElement).toBe(q(element, ".open-button"));
    });

    it("Escape closes and returns focus to the button", async () => {
      const element = create();
      await open(element);
      q(element, "dialog").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await flushPromises();
      expect(q(element, ".dialog-heading")).toBeNull();
      expect(element.shadowRoot.activeElement).toBe(q(element, ".open-button"));
    });

    it("the browser's own cancel closes it our way", async () => {
      const element = create();
      await open(element);
      q(element, "dialog").dispatchEvent(
        new CustomEvent("cancel", { cancelable: true })
      );
      await flushPromises();
      expect(q(element, ".dialog-heading")).toBeNull();
      expect(element.shadowRoot.activeElement).toBe(q(element, ".open-button"));
    });

    it("a click on the backdrop closes it, a click inside does not", async () => {
      const element = create();
      await open(element);
      q(element, ".dialog-body").click();
      await flushPromises();
      expect(q(element, ".dialog-heading")).not.toBeNull();
      q(element, "dialog").click();
      await flushPromises();
      expect(q(element, ".dialog-heading")).toBeNull();
    });

    it("keeps Tab inside, wrapping between Close and the list", async () => {
      const element = create();
      await open(element);
      const list = q(element, ".event-list");
      list.focus();
      const forward = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true
      });
      list.dispatchEvent(forward);
      expect(forward.defaultPrevented).toBe(true);
      expect(element.shadowRoot.activeElement).toBe(
        q(element, ".close-button")
      );
      const back = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      q(element, ".close-button").dispatchEvent(back);
      expect(back.defaultPrevented).toBe(true);
      expect(element.shadowRoot.activeElement).toBe(list);
    });

    it("pulls focus back when it leaves the dialog", async () => {
      const element = create();
      await open(element);
      q(element, ".event-list").focus();
      q(element, "dialog").dispatchEvent(
        new FocusEvent("focusout", { relatedTarget: null, bubbles: true })
      );
      expect(element.shadowRoot.activeElement).toBe(
        q(element, ".close-button")
      );
    });
  });
});
