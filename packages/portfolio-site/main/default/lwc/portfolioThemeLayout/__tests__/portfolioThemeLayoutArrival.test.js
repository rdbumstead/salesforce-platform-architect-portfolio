/**
 * @description       : Unit tests for the arrival of a redirected visitor in portfolioThemeLayout,
 *                      on the static site: from=sf is removed from the address bar while the
 *                      module loads, other parameters stay, the arrival event is sent once, and a
 *                      page with no from=sf sends nothing and never asks Salesforce for the
 *                      redirect settings.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/13/2026
 **/
import { createElement } from "@lwc/engine-dom";
import Layout, {
  ARRIVAL_ATTRIBUTE,
  readArrival,
  stripArrival
} from "c/portfolioThemeLayout";
import { trackEvent } from "c/analyticsService";
import getRedirect from "@salesforce/apex/SiteRedirectController.getRedirect";

jest.mock(
  "lightning/navigation",
  () => {
    const {
      createTestWireAdapter
    } = require("@salesforce/wire-service-jest-util");
    return {
      __esModule: true,
      CurrentPageReference: createTestWireAdapter(jest.fn())
    };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "" }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/SiteRedirectController.getRedirect",
  () => ({ __esModule: true, default: jest.fn() }),
  { virtual: true }
);

// The layout reads the address while its module loads, so the address is set here, in the
// factory the module's own import runs first, the way the static site's first request arrives.
jest.mock(
  "c/siteHost",
  () => {
    globalThis.history.replaceState(
      { keep: true },
      "",
      "/skills?view=graph&from=sf&x=1#top"
    );
    return { __esModule: true, IS_STATIC: true };
  },
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    __esModule: true,
    trackEvent: jest.fn(),
    EVENTS: { REDIRECT_ARRIVED: "redirect_arrived" }
  }),
  { virtual: true }
);

describe("c-portfolio-theme-layout arrival on the static site", () => {
  it("removed from=sf from the address bar while the module loaded, keeping the rest", () => {
    expect(
      window.location.pathname + window.location.search + window.location.hash
    ).toBe("/skills?view=graph&x=1#top");
    expect(window.history.state).toEqual({ keep: true });
  });

  it("sends the arrival event once, however many layouts connect", () => {
    ["a", "b"].forEach(() => {
      document.body.appendChild(
        createElement("c-portfolio-theme-layout", { is: Layout })
      );
    });
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("redirect_arrived", {
      source: "sf"
    });
  });

  it("never reads the redirect settings on the static site", () => {
    expect(getRedirect).not.toHaveBeenCalled();
  });
});

describe("stripArrival", () => {
  const history = () => ({ state: null, replaceState: jest.fn() });

  it("removes only from=sf and keeps the rest of the address", () => {
    const h = history();
    expect(
      stripArrival({ pathname: "/a", search: "?x=1&from=sf", hash: "#h" }, h)
    ).toBe(true);
    expect(h.replaceState).toHaveBeenCalledWith(null, "", "/a?x=1#h");
  });

  it("drops the question mark when nothing else is left", () => {
    const h = history();
    stripArrival({ pathname: "/a", search: "?from=sf", hash: "" }, h);
    expect(h.replaceState).toHaveBeenCalledWith(null, "", "/a");
  });

  it("does nothing without from=sf or with another from value", () => {
    const h = history();
    expect(stripArrival({ pathname: "/a", search: "", hash: "" }, h)).toBe(
      false
    );
    expect(
      stripArrival({ pathname: "/a", search: "?from=other", hash: "" }, h)
    ).toBe(false);
    expect(h.replaceState).not.toHaveBeenCalled();
  });

  it("returns false and does not throw when the history cannot be written", () => {
    const h = {
      state: null,
      replaceState: () => {
        throw new Error("blocked");
      }
    };
    expect(
      stripArrival({ pathname: "/", search: "?from=sf", hash: "" }, h)
    ).toBe(false);
  });
});

describe("readArrival", () => {
  const root = (value) => ({
    getAttribute: (name) => (name === ARRIVAL_ATTRIBUTE ? value : null)
  });
  const history = () => ({ state: null, replaceState: jest.fn() });

  it("is true when the head script left its mark and the address is already clean", () => {
    const h = history();
    expect(
      readArrival({ pathname: "/a", search: "", hash: "" }, h, root("sf"))
    ).toBe(true);
    expect(h.replaceState).not.toHaveBeenCalled();
  });

  it("strips the address itself when there is no mark", () => {
    const h = history();
    expect(
      readArrival(
        { pathname: "/a", search: "?from=sf", hash: "" },
        h,
        root(null)
      )
    ).toBe(true);
    expect(h.replaceState).toHaveBeenCalledWith(null, "", "/a");
  });

  it("is false with neither, or with a mark that is not sf", () => {
    expect(
      readArrival(
        { pathname: "/a", search: "", hash: "" },
        history(),
        root(null)
      )
    ).toBe(false);
    expect(
      readArrival(
        { pathname: "/a", search: "", hash: "" },
        history(),
        root("x")
      )
    ).toBe(false);
  });

  it("does not throw when the root cannot be read", () => {
    expect(
      readArrival({ pathname: "/a", search: "", hash: "" }, history(), null)
    ).toBe(false);
  });
});
