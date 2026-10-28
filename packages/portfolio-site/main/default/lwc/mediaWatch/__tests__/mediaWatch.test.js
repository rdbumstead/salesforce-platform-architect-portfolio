/**
 * @description       : Unit tests for c/mediaWatch, the shared media query watch.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/28/2026
 **/
import { watchMedia } from "c/mediaWatch";

describe("c/mediaWatch", () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  function fakeList(matches) {
    const listeners = new Set();
    return {
      matches,
      addEventListener: jest.fn((type, listener) => listeners.add(listener)),
      removeEventListener: jest.fn((type, listener) =>
        listeners.delete(listener)
      ),
      fire(next) {
        this.matches = next;
        listeners.forEach((listener) => listener());
      },
      listeners
    };
  }

  it("reports false once when the browser has no matchMedia", () => {
    window.matchMedia = undefined;
    const onChange = jest.fn();
    const stop = watchMedia("(max-width: 767px)", onChange);
    expect(onChange.mock.calls).toEqual([[false]]);
    expect(() => stop()).not.toThrow();
  });

  it("reports the current match at once and follows changes", () => {
    const list = fakeList(true);
    window.matchMedia = jest.fn(() => list);
    const onChange = jest.fn();
    watchMedia("(max-width: 767px)", onChange);

    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
    list.fire(false);
    list.fire(true);
    expect(onChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it("stops listening when asked", () => {
    const list = fakeList(false);
    window.matchMedia = jest.fn(() => list);
    const onChange = jest.fn();
    const stop = watchMedia("(max-width: 767px)", onChange);

    stop();
    list.fire(true);
    expect(list.listeners.size).toBe(0);
    expect(onChange.mock.calls).toEqual([[false]]);
  });

  it("still reports once where the list has no addEventListener", () => {
    window.matchMedia = jest.fn(() => ({ matches: true }));
    const onChange = jest.fn();
    const stop = watchMedia("(max-width: 767px)", onChange);
    expect(onChange.mock.calls).toEqual([[true]]);
    expect(() => stop()).not.toThrow();
  });
});
