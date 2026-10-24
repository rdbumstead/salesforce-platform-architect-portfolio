/**
 * @description       : Unit tests for the motionPreference module. Covers the system setting as
 *                      the default, a stored choice winning over it, storing a choice with its
 *                      attribute and document event, the change listener for both sources, and
 *                      the silent paths when storage or matchMedia are missing or throw.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
import {
  MOTION_ATTRIBUTE,
  MOTION_EVENT,
  MOTION_STORAGE_KEY,
  applyStoredMotion,
  getStoredMotion,
  isReduced,
  onMotionChange,
  scrollBehavior,
  setMotion,
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

describe("c/motionPreference", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    systemReduced = false;
    mockMatchMedia();
    window.localStorage.clear();
    document.documentElement.removeAttribute(MOTION_ATTRIBUTE);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    jest.restoreAllMocks();
  });

  it("uses the portfolio-motion key and event name", () => {
    expect(MOTION_STORAGE_KEY).toBe("portfolio-motion");
    expect(MOTION_EVENT).toBe("portfolio-motion");
  });

  describe("with no stored choice", () => {
    it("follows the system setting", () => {
      expect(isReduced()).toBe(false);
      systemReduced = true;
      expect(systemPrefersReduced()).toBe(true);
      expect(isReduced()).toBe(true);
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

    it("ignores a stored value that is not reduce or full", () => {
      window.localStorage.setItem(MOTION_STORAGE_KEY, "sideways");
      systemReduced = true;
      expect(getStoredMotion()).toBeNull();
      expect(isReduced()).toBe(true);
    });
  });

  describe("with a stored choice", () => {
    it("lets reduce win over a system set to full motion", () => {
      window.localStorage.setItem(MOTION_STORAGE_KEY, "reduce");
      expect(isReduced()).toBe(true);
    });

    it("lets full win over a system set to reduce", () => {
      window.localStorage.setItem(MOTION_STORAGE_KEY, "full");
      systemReduced = true;
      expect(isReduced()).toBe(false);
    });

    it("writes the stored choice on the html element when asked", () => {
      window.localStorage.setItem(MOTION_STORAGE_KEY, "reduce");
      expect(applyStoredMotion()).toBe("reduce");
      expect(document.documentElement.getAttribute(MOTION_ATTRIBUTE)).toBe(
        "reduce"
      );
    });

    it("writes nothing on the html element when no choice is stored", () => {
      expect(applyStoredMotion()).toBeNull();
      expect(document.documentElement.hasAttribute(MOTION_ATTRIBUTE)).toBe(
        false
      );
    });
  });

  describe("setMotion", () => {
    it("stores the choice, writes the attribute and sends the event", () => {
      const listener = jest.fn();
      document.addEventListener(MOTION_EVENT, listener);
      expect(setMotion("reduce")).toBe(true);
      document.removeEventListener(MOTION_EVENT, listener);

      expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe("reduce");
      expect(document.documentElement.getAttribute(MOTION_ATTRIBUTE)).toBe(
        "reduce"
      );
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].detail).toEqual({
        motion: "reduce",
        reduced: true
      });
      expect(isReduced()).toBe(true);
    });

    it("sends reduced false for full", () => {
      const listener = jest.fn();
      document.addEventListener(MOTION_EVENT, listener);
      setMotion("full");
      document.removeEventListener(MOTION_EVENT, listener);
      expect(listener.mock.calls[0][0].detail).toEqual({
        motion: "full",
        reduced: false
      });
    });

    it("refuses any other value and changes nothing", () => {
      const listener = jest.fn();
      document.addEventListener(MOTION_EVENT, listener);
      expect(setMotion("fast")).toBe(false);
      expect(setMotion(undefined)).toBe(false);
      document.removeEventListener(MOTION_EVENT, listener);
      expect(listener).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
    });

    it("still sends the event when storage throws", () => {
      jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      const listener = jest.fn();
      document.addEventListener(MOTION_EVENT, listener);
      expect(setMotion("reduce")).toBe(true);
      document.removeEventListener(MOTION_EVENT, listener);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("reads no choice when storage throws on read", () => {
      jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      systemReduced = true;
      expect(getStoredMotion()).toBeNull();
      expect(isReduced()).toBe(true);
    });
  });

  describe("onMotionChange", () => {
    it("calls back on a stored change and stops after unsubscribe", () => {
      const callback = jest.fn();
      const stop = onMotionChange(callback);
      setMotion("reduce");
      setMotion("full");
      stop();
      setMotion("reduce");
      expect(callback.mock.calls).toEqual([[true], [false]]);
    });

    it("calls back on a system change while no choice is stored", () => {
      const callback = jest.fn();
      const stop = onMotionChange(callback);
      changeSystem(true);
      stop();
      expect(callback).toHaveBeenCalledWith(true);
      expect(systemListeners).toHaveLength(0);
    });

    it("ignores a system change once the visitor has chosen", () => {
      window.localStorage.setItem(MOTION_STORAGE_KEY, "full");
      const callback = jest.fn();
      const stop = onMotionChange(callback);
      changeSystem(true);
      stop();
      expect(callback).not.toHaveBeenCalled();
    });

    it("returns a no-op for a callback that is not a function", () => {
      const stop = onMotionChange("not a function");
      expect(() => stop()).not.toThrow();
      expect(systemListeners).toHaveLength(0);
    });
  });

  it("gives the scroll behaviour for the current preference", () => {
    expect(scrollBehavior()).toBe("smooth");
    window.localStorage.setItem(MOTION_STORAGE_KEY, "reduce");
    expect(scrollBehavior()).toBe("auto");
  });
});
