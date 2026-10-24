/**
 * @description       : Unit tests for the motionPreference module. Covers the system setting as
 *                      the only source, a value stored by an earlier version being ignored and
 *                      removed, the change listener for the system setting and the document
 *                      event, and the silent paths when storage or matchMedia are missing or throw.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
import {
  MOTION_EVENT,
  MOTION_FULL,
  MOTION_REDUCE,
  MOTION_STORAGE_KEY,
  forgetStoredMotion,
  isReduced,
  onMotionChange,
  scrollBehavior,
  systemPrefersReduced
} from "c/motionPreference";

let systemReduced;
let systemListeners;

function mockMatchMedia() {
  systemListeners = [];
  window.matchMedia = jest.fn((query) => ({
    media: query,
    get matches() {
      return query === "(prefers-reduced-motion: reduce)" && systemReduced;
    },
    addEventListener: jest.fn((type, listener) => {
      systemListeners.push(listener);
    }),
    removeEventListener: jest.fn((type, listener) => {
      systemListeners = systemListeners.filter((item) => item !== listener);
    })
  }));
}

function changeSystem(reduced) {
  systemReduced = reduced;
  systemListeners.forEach((listener) => listener({ matches: reduced }));
}

function sendMotionEvent(reduced) {
  document.dispatchEvent(
    new CustomEvent(MOTION_EVENT, { detail: { reduced } })
  );
}

describe("c/motionPreference", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    systemReduced = false;
    mockMatchMedia();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    jest.restoreAllMocks();
  });

  it("keeps the portfolio-motion key and event name and the two states", () => {
    expect(MOTION_STORAGE_KEY).toBe("portfolio-motion");
    expect(MOTION_EVENT).toBe("portfolio-motion");
    expect(MOTION_REDUCE).toBe("reduce");
    expect(MOTION_FULL).toBe("full");
  });

  describe("isReduced", () => {
    it("follows the system setting", () => {
      expect(isReduced()).toBe(false);
      systemReduced = true;
      expect(systemPrefersReduced()).toBe(true);
      expect(isReduced()).toBe(true);
    });

    it("ignores a stored full when the system asks for reduced motion", () => {
      window.localStorage.setItem(MOTION_STORAGE_KEY, "full");
      systemReduced = true;
      expect(isReduced()).toBe(true);
    });

    it("ignores a stored reduce when the system asks for full motion", () => {
      window.localStorage.setItem(MOTION_STORAGE_KEY, "reduce");
      expect(isReduced()).toBe(false);
    });

    it("reads as full motion where matchMedia is missing", () => {
      window.matchMedia = undefined;
      expect(systemPrefersReduced()).toBe(false);
      expect(isReduced()).toBe(false);
    });

    it("reads as full motion where matchMedia throws", () => {
      window.matchMedia = jest.fn(() => {
        throw new Error("blocked");
      });
      expect(isReduced()).toBe(false);
    });
  });

  describe("forgetStoredMotion", () => {
    it("removes a stored value once and reports it", () => {
      window.localStorage.setItem(MOTION_STORAGE_KEY, "reduce");
      expect(forgetStoredMotion()).toBe(true);
      expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
      expect(forgetStoredMotion()).toBe(false);
    });

    it("leaves every other key alone", () => {
      window.localStorage.setItem("portfolio-theme", "dark");
      window.localStorage.setItem(MOTION_STORAGE_KEY, "full");
      forgetStoredMotion();
      expect(window.localStorage.getItem("portfolio-theme")).toBe("dark");
    });

    it("answers false when storage throws", () => {
      jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(forgetStoredMotion()).toBe(false);
    });
  });

  describe("onMotionChange", () => {
    it("calls back on a system change and stops after unsubscribe", () => {
      const callback = jest.fn();
      const stop = onMotionChange(callback);
      changeSystem(true);
      changeSystem(false);
      stop();
      expect(callback.mock.calls).toEqual([[true], [false]]);
      expect(systemListeners).toHaveLength(0);
    });

    it("follows a system change even with a value stored by an earlier version", () => {
      window.localStorage.setItem(MOTION_STORAGE_KEY, "full");
      const callback = jest.fn();
      const stop = onMotionChange(callback);
      changeSystem(true);
      stop();
      expect(callback).toHaveBeenCalledWith(true);
    });

    it("calls back on a portfolio-motion event and stops after unsubscribe", () => {
      const callback = jest.fn();
      const stop = onMotionChange(callback);
      sendMotionEvent(true);
      stop();
      sendMotionEvent(false);
      expect(callback.mock.calls).toEqual([[true]]);
    });

    it("reads the system setting for an event without a reduced value", () => {
      systemReduced = true;
      const callback = jest.fn();
      const stop = onMotionChange(callback);
      document.dispatchEvent(new CustomEvent(MOTION_EVENT));
      stop();
      expect(callback).toHaveBeenCalledWith(true);
    });

    it("returns a no-op for a callback that is not a function", () => {
      const stop = onMotionChange("not a function");
      expect(() => stop()).not.toThrow();
      expect(systemListeners).toHaveLength(0);
    });
  });

  it("gives the scroll behaviour for the system setting", () => {
    window.localStorage.setItem(MOTION_STORAGE_KEY, "reduce");
    expect(scrollBehavior()).toBe("smooth");
    systemReduced = true;
    expect(scrollBehavior()).toBe("auto");
  });
});
