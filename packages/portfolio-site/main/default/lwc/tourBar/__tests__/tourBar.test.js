/**
 * @description       : Unit tests for tourBar: nothing renders unless a tour is running, the
 *                      stop from the route against the live pillars, the progress row with the
 *                      stop's minutes, the task line as the Show me button, Back, Next, Finish
 *                      and the ending with Resume, Contact and Docs, End tour, the three tour
 *                      events, the start, storage that throws, and the phone padding report.
 *                      c/pillarData is the real module.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/27/2026
 **/
import { createElement } from "@lwc/engine-dom";
import TourBar, {
  TOUR_STORAGE_KEY,
  TOUR_START_EVENT,
  TOUR_LABEL,
  endTour,
  firstStopHref,
  isTourRunning,
  minutesText,
  startTour,
  stopIndexFor
} from "c/tourBar";
import { trackEvent } from "c/analyticsService";
import { SHOW_ME_EVENT } from "c/tourShowMe";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    __esModule: true,
    trackEvent: jest.fn(),
    EVENTS: {
      TOUR_STEP_VIEWED: "tour_step_viewed",
      TOUR_EXITED: "tour_exited",
      TOUR_FINISHED: "tour_finished"
    }
  }),
  { virtual: true }
);

const originalMatchMedia = window.matchMedia;

function phone(matches) {
  window.matchMedia = jest.fn(() => ({
    matches,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }));
}

function render(routeUrl, listeners = {}) {
  const element = createElement("c-tour-bar", { is: TourBar });
  element.routeUrl = routeUrl;
  Object.entries(listeners).forEach(([name, fn]) =>
    element.addEventListener(name, fn)
  );
  document.body.appendChild(element);
  return element;
}

function flush() {
  return Promise.resolve();
}

function byId(element, id) {
  return element.shadowRoot.querySelector(`[data-id="${id}"]`);
}

function text(node) {
  return node.textContent.replace(/\s+/g, " ").trim();
}

describe("c-tour-bar", () => {
  beforeEach(() => {
    phone(false);
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    window.sessionStorage.clear();
    window.matchMedia = originalMatchMedia;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe("the helpers", () => {
    it("names the tour from the stops' minutes and links its first stop", () => {
      expect(TOUR_LABEL).toBe("Take the 10 minute tour");
      expect(firstStopHref()).toBe("/portfolio/business-architecture");
      expect(minutesText(1)).toBe("1 minute");
      expect(minutesText(3)).toBe("3 minutes");
    });

    it("works out the stop from the route, and no stop for other pages", () => {
      expect(stopIndexFor("business-architecture")).toBe(0);
      expect(stopIndexFor("delivery")).toBe(4);
      expect(stopIndexFor("")).toBe(-1);
      expect(stopIndexFor("api-lab/reference")).toBe(-1);
      expect(stopIndexFor(undefined)).toBe(-1);
    });

    it("keeps one key that says a tour is running, and nothing else", () => {
      const started = jest.fn();
      document.addEventListener(TOUR_START_EVENT, started);
      expect(isTourRunning()).toBe(false);
      expect(startTour()).toBe(true);
      expect(window.sessionStorage.length).toBe(1);
      expect(window.sessionStorage.getItem(TOUR_STORAGE_KEY)).toBe("1");
      expect(isTourRunning()).toBe(true);
      expect(started).toHaveBeenCalledTimes(1);
      endTour();
      expect(isTourRunning()).toBe(false);
      document.removeEventListener(TOUR_START_EVENT, started);
    });

    it("starts nothing and says so when storage throws", () => {
      jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(startTour()).toBe(false);
      expect(isTourRunning()).toBe(false);
      expect(() => endTour()).not.toThrow();
    });
  });

  describe("opt in", () => {
    it("renders nothing on any page while no tour runs", () => {
      ["", "api-lab", "delivery", "resume"].forEach((route) => {
        const element = render(route);
        expect(element.shadowRoot.querySelector("[data-id]")).toBeNull();
      });
      expect(trackEvent).not.toHaveBeenCalled();
    });

    it("renders nothing on a page that is no stop while a tour runs", () => {
      startTour();
      const element = render("resume");
      expect(byId(element, "tour-bar")).toBeNull();
      expect(trackEvent).not.toHaveBeenCalled();
    });

    it("renders nothing when storage throws", () => {
      jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      const element = render("api-lab");
      expect(byId(element, "tour-bar")).toBeNull();
    });
  });

  describe("a stop", () => {
    it("shows the progress row, the minutes and the task line on stop 3", () => {
      startTour();
      const element = render("api-lab");
      const barEl = byId(element, "tour-bar");
      expect(barEl.getAttribute("role")).toBe("region");
      expect(barEl.getAttribute("aria-label")).toBe("The 10 minute tour");
      const progress = byId(element, "tour-progress");
      expect(progress.getAttribute("aria-live")).toBe("polite");
      expect(text(progress)).toBe("Stop 3 of 5, API Lab, 1 minute");
      expect(text(byId(element, "tour-minutes"))).toBe("1 minute");
      const task = byId(element, "tour-task");
      expect(task.tagName).toBe("BUTTON");
      expect(text(task)).toBe(
        "Show me: Press Execute GET and find X-Request-Id and X-RateLimit-Limit."
      );
      expect(element.shadowRoot.querySelectorAll("[aria-live]")).toHaveLength(
        1
      );
    });

    it("links Back and Next to the stops either side", () => {
      startTour();
      const element = render("api-lab");
      const back = byId(element, "tour-back");
      const next = byId(element, "tour-next");
      expect(back.getAttribute("href")).toBe("/portfolio/nonprofit-solutions");
      expect(back.getAttribute("aria-label")).toBe(
        "Back to Solution Architecture"
      );
      expect(text(back)).toBe("Back");
      expect(next.getAttribute("href")).toBe("/portfolio/ai-lab");
      expect(next.getAttribute("aria-label")).toBe("Next, AI Lab");
      expect(text(next)).toBe("Next");
      expect(byId(element, "tour-finish")).toBeNull();
    });

    it("has no Back on the first stop, and Finish in place of Next on the last", async () => {
      startTour();
      const element = render("business-architecture");
      expect(byId(element, "tour-back")).toBeNull();
      expect(text(byId(element, "tour-progress"))).toContain(
        "Stop 1 of 5, Business Architecture"
      );
      expect(text(byId(element, "tour-minutes"))).toBe("2 minutes");
      element.routeUrl = "delivery";
      await flush();
      expect(byId(element, "tour-next")).toBeNull();
      expect(byId(element, "tour-finish").tagName).toBe("BUTTON");
    });

    it("asks the page to show the stop's control from the task line", () => {
      startTour();
      const heard = jest.fn();
      document.addEventListener(SHOW_ME_EVENT, heard);
      const element = render("ai-lab");
      byId(element, "tour-task").click();
      document.removeEventListener(SHOW_ME_EVENT, heard);
      expect(heard).toHaveBeenCalledTimes(1);
      expect(heard.mock.calls[0][0].detail).toEqual({ stop: "D" });
    });

    it("sends tour_step_viewed once per arrival at a stop", async () => {
      startTour();
      const element = render("api-lab");
      expect(trackEvent).toHaveBeenCalledWith("tour_step_viewed", {
        stop: "C",
        pillar: "api-lab"
      });
      element.routeUrl = "api-lab";
      await flush();
      expect(trackEvent).toHaveBeenCalledTimes(1);
      element.routeUrl = "resume";
      await flush();
      element.routeUrl = "api-lab";
      await flush();
      element.routeUrl = "ai-lab";
      await flush();
      expect(trackEvent.mock.calls).toEqual([
        ["tour_step_viewed", { stop: "C", pillar: "api-lab" }],
        ["tour_step_viewed", { stop: "C", pillar: "api-lab" }],
        ["tour_step_viewed", { stop: "D", pillar: "ai-lab" }]
      ]);
    });

    it("tells the layout when a move by the bar starts and when its stop arrives", async () => {
      startTour();
      const tournavigate = jest.fn();
      const tourarrive = jest.fn();
      const element = render("api-lab", { tournavigate, tourarrive });
      const next = byId(element, "tour-next");
      next.addEventListener("click", (event) => event.preventDefault());
      next.click();
      expect(tournavigate).toHaveBeenCalledTimes(1);
      expect(tourarrive).not.toHaveBeenCalled();
      element.routeUrl = "ai-lab";
      await flush();
      expect(tourarrive).toHaveBeenCalledTimes(1);
      // A move the visitor makes some other way is counted but moves no focus.
      element.routeUrl = "delivery";
      await flush();
      expect(tourarrive).toHaveBeenCalledTimes(1);
    });
  });

  describe("starting", () => {
    it("shows the bar and counts the arrival when the tour starts on its first stop", async () => {
      const tourarrive = jest.fn();
      const tournavigate = jest.fn();
      const element = render("business-architecture", {
        tourarrive,
        tournavigate
      });
      expect(byId(element, "tour-bar")).toBeNull();
      startTour();
      await flush();
      expect(byId(element, "tour-bar")).not.toBeNull();
      expect(tournavigate).toHaveBeenCalledTimes(1);
      expect(tourarrive).toHaveBeenCalledTimes(1);
      expect(trackEvent).toHaveBeenCalledWith("tour_step_viewed", {
        stop: "A",
        pillar: "business-architecture"
      });
    });

    it("waits for the first stop when the tour starts from the home page", async () => {
      const tourarrive = jest.fn();
      const element = render("", { tourarrive });
      startTour();
      await flush();
      expect(byId(element, "tour-bar")).toBeNull();
      expect(tourarrive).not.toHaveBeenCalled();
      element.routeUrl = "business-architecture";
      await flush();
      expect(byId(element, "tour-bar")).not.toBeNull();
      expect(tourarrive).toHaveBeenCalledTimes(1);
    });
  });

  describe("ending", () => {
    it("ends early from End tour with tour_exited, for the rest of the visit", async () => {
      startTour();
      const tourleave = jest.fn();
      const element = render("nonprofit-solutions", { tourleave });
      byId(element, "tour-end").click();
      await flush();
      expect(byId(element, "tour-bar")).toBeNull();
      expect(isTourRunning()).toBe(false);
      expect(trackEvent).toHaveBeenLastCalledWith("tour_exited", { stop: "B" });
      expect(tourleave).toHaveBeenCalledTimes(1);
      element.routeUrl = "api-lab";
      await flush();
      expect(byId(element, "tour-bar")).toBeNull();
    });

    it("shows That's the tour with Resume, Contact and Docs after Finish", async () => {
      startTour();
      const element = render("delivery");
      byId(element, "tour-finish").click();
      await flush();
      expect(trackEvent).toHaveBeenLastCalledWith("tour_finished");
      expect(isTourRunning()).toBe(false);
      const progress = byId(element, "tour-progress");
      expect(text(progress)).toBe("That's the tour");
      expect(element.shadowRoot.activeElement).toBe(progress);
      expect(byId(element, "tour-task")).toBeNull();
      const links = Array.from(
        element.shadowRoot.querySelectorAll(".tour-ending-links a")
      ).map((link) => [text(link), link.getAttribute("href")]);
      expect(links).toEqual([
        ["Resume", "/portfolio/resume"],
        ["Contact", "/portfolio/contact"],
        ["Docs", "/portfolio/docs"]
      ]);
    });

    it("closes the ending from Close, and on the next page", async () => {
      startTour();
      const tourleave = jest.fn();
      const element = render("delivery", { tourleave });
      byId(element, "tour-finish").click();
      await flush();
      byId(element, "tour-close").click();
      await flush();
      expect(byId(element, "tour-bar")).toBeNull();
      expect(tourleave).toHaveBeenCalledTimes(1);

      startTour();
      element.routeUrl = "delivery";
      const again = render("delivery");
      byId(again, "tour-finish").click();
      await flush();
      again.routeUrl = "resume";
      await flush();
      expect(byId(again, "tour-bar")).toBeNull();
    });

    it("leaves the ending when one of its links is followed", async () => {
      startTour();
      const element = render("delivery");
      byId(element, "tour-finish").click();
      await flush();
      const link = element.shadowRoot.querySelector(
        '.tour-ending-links a[data-key="resume"]'
      );
      link.addEventListener("click", (event) => event.preventDefault());
      link.click();
      await flush();
      expect(byId(element, "tour-bar")).toBeNull();
    });
  });

  describe("on a phone", () => {
    it("reports its height so the layout can pad the page, and 0 once it goes", async () => {
      phone(true);
      startTour();
      const tourspace = jest.fn();
      jest
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue({ height: 132.4 });
      const element = render("api-lab", { tourspace });
      await flush();
      expect(tourspace).toHaveBeenLastCalledWith(
        expect.objectContaining({ detail: { height: 133 } })
      );
      byId(element, "tour-end").click();
      await flush();
      expect(tourspace).toHaveBeenLastCalledWith(
        expect.objectContaining({ detail: { height: 0 } })
      );
    });

    it("reports 0 on a wide screen", async () => {
      phone(false);
      startTour();
      const tourspace = jest.fn();
      render("api-lab", { tourspace });
      await flush();
      expect(tourspace).toHaveBeenLastCalledWith(
        expect.objectContaining({ detail: { height: 0 } })
      );
    });
  });
});
