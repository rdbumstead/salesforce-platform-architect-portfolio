import {
  ANCHOR_ATTRIBUTE,
  SHOW_ME_EVENT,
  onShowMe,
  revealAnchor,
  showMe
} from "c/tourShowMe";

describe("c/tourShowMe", () => {
  it("sends the stop letter, upper case, on the document", () => {
    const listener = jest.fn();
    document.addEventListener(SHOW_ME_EVENT, listener);
    expect(showMe("c")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ stop: "C" });
    document.removeEventListener(SHOW_ME_EVENT, listener);
  });

  it("sends nothing without a stop", () => {
    const listener = jest.fn();
    document.addEventListener(SHOW_ME_EVENT, listener);
    expect(showMe("")).toBe(false);
    expect(showMe(undefined)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    document.removeEventListener(SHOW_ME_EVENT, listener);
  });

  it("calls back only for its own stop, until it is removed", () => {
    const callback = jest.fn();
    const stop = onShowMe("D", callback);
    showMe("C");
    expect(callback).not.toHaveBeenCalled();
    showMe("D");
    expect(callback).toHaveBeenCalledTimes(1);
    stop();
    showMe("D");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("returns a harmless remover for a bad call", () => {
    expect(() => onShowMe("A")()).not.toThrow();
    expect(() => onShowMe(undefined, jest.fn())()).not.toThrow();
  });

  it("scrolls to and focuses the marked element without a second scroll", () => {
    const host = document.createElement("div");
    const button = document.createElement("button");
    button.setAttribute(ANCHOR_ATTRIBUTE, "");
    button.scrollIntoView = jest.fn();
    button.focus = jest.fn();
    host.appendChild(button);
    expect(revealAnchor(host)).toBe(true);
    expect(button.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center" })
    );
    expect(button.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("answers false when there is no anchor or no template", () => {
    expect(revealAnchor(document.createElement("div"))).toBe(false);
    expect(revealAnchor(null)).toBe(false);
  });
});
