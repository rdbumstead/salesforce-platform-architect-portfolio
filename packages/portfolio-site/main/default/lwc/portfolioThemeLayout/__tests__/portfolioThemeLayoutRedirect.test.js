/**
 * @description       : Unit tests for the returning visitor redirect in portfolioThemeLayout, on
 *                      the Salesforce site: the switch on and off, the wrong host, the bypass
 *                      and its memory for the tab, the path mapping with the site prefix
 *                      removed, other query parameters kept, from=sf added, a target that is
 *                      refused, and a failed read that leaves the page alone.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/13/2026
 **/
import { createElement } from "@lwc/engine-dom";
import PortfolioThemeLayout, {
  BYPASS_KEY,
  navigation,
  redirectDestination,
  wantsToStay
} from "c/portfolioThemeLayout";
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
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/SiteRedirectController.getRedirect",
  () => ({ __esModule: true, default: jest.fn() }),
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

const ON = {
  enabled: true,
  target: "https://ryanbumstead.com",
  host: "localhost"
};

function visit(path) {
  window.history.replaceState({}, "", path);
}

function load() {
  const element = createElement("c-portfolio-theme-layout", {
    is: PortfolioThemeLayout
  });
  document.body.appendChild(element);
  return element;
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("redirectDestination", () => {
  const where = (pathname, search = "", hash = "") => ({
    hostname: "site.example.com",
    pathname,
    search,
    hash
  });
  const config = (extra = {}) => ({
    enabled: true,
    target: "https://ryanbumstead.com",
    host: "site.example.com",
    ...extra
  });

  it("sends the home page to the target with from=sf", () => {
    expect(
      redirectDestination(config(), where("/portfolio/"), "/portfolio")
    ).toBe("https://ryanbumstead.com/?from=sf");
  });

  it("maps the site prefix away and keeps the rest of the path", () => {
    expect(
      redirectDestination(config(), where("/portfolio/resume"), "/portfolio")
    ).toBe("https://ryanbumstead.com/resume?from=sf");
    expect(
      redirectDestination(
        config(),
        where("/portfolio/api-lab/reference"),
        "/portfolio"
      )
    ).toBe("https://ryanbumstead.com/api-lab/reference?from=sf");
  });

  it("maps the bare prefix to the root", () => {
    expect(
      redirectDestination(config(), where("/portfolio"), "/portfolio")
    ).toBe("https://ryanbumstead.com/?from=sf");
  });

  it("does not cut a path that only starts with the prefix letters", () => {
    expect(
      redirectDestination(config(), where("/portfolios"), "/portfolio")
    ).toBe("https://ryanbumstead.com/portfolios?from=sf");
  });

  it("keeps other query parameters and the hash", () => {
    expect(
      redirectDestination(
        config(),
        where("/portfolio/skills", "?view=graph&utm_source=card", "#top"),
        "/portfolio"
      )
    ).toBe(
      "https://ryanbumstead.com/skills?view=graph&utm_source=card&from=sf#top"
    );
  });

  it("does not add a second from parameter", () => {
    expect(
      redirectDestination(
        config(),
        where("/portfolio/", "?from=other"),
        "/portfolio"
      )
    ).toBe("https://ryanbumstead.com/?from=sf");
  });

  it("stays when the switch is off", () => {
    expect(
      redirectDestination(
        config({ enabled: false }),
        where("/portfolio/"),
        "/portfolio"
      )
    ).toBeNull();
  });

  it("stays on a host that is not the one in the settings", () => {
    expect(
      redirectDestination(
        config({ host: "other.example.com" }),
        where("/portfolio/"),
        "/portfolio"
      )
    ).toBeNull();
  });

  it("matches the host without regard to case", () => {
    expect(
      redirectDestination(
        config({ host: "SITE.example.com" }),
        where("/portfolio/"),
        "/portfolio"
      )
    ).not.toBeNull();
  });

  it("stays when the visitor asked to stay", () => {
    expect(
      redirectDestination(config(), where("/portfolio/"), "/portfolio", true)
    ).toBeNull();
  });

  it("refuses a target that is not https, except on this machine", () => {
    expect(
      redirectDestination(
        config({ target: "http://ryanbumstead.com" }),
        where("/portfolio/"),
        "/portfolio"
      )
    ).toBeNull();
    expect(
      redirectDestination(
        config({ target: "http://127.0.0.1:8822" }),
        where("/portfolio/"),
        "/portfolio"
      )
    ).toBe("http://127.0.0.1:8822/?from=sf");
    expect(
      redirectDestination(
        config({ target: "ftp://ryanbumstead.com" }),
        where("/portfolio/"),
        "/portfolio"
      )
    ).toBeNull();
  });

  it("refuses a target on the page's own host, so no loop is possible", () => {
    expect(
      redirectDestination(
        config({ target: "https://site.example.com" }),
        where("/portfolio/"),
        "/portfolio"
      )
    ).toBeNull();
  });

  it("stays on a missing, blank or unreadable setting", () => {
    expect(redirectDestination(null, where("/"), "")).toBeNull();
    expect(redirectDestination(undefined, where("/"), "")).toBeNull();
    expect(
      redirectDestination(config({ target: "" }), where("/"), "")
    ).toBeNull();
    expect(
      redirectDestination(config({ target: "not a url" }), where("/"), "")
    ).toBeNull();
    expect(
      redirectDestination(config({ host: "" }), where("/"), "")
    ).toBeNull();
    expect(
      redirectDestination(config({ enabled: "true" }), where("/"), "")
    ).toBeNull();
  });
});

describe("wantsToStay", () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("is false with no request", () => {
    expect(wantsToStay("")).toBe(false);
    expect(wantsToStay("?stay=0")).toBe(false);
  });

  it("is true with stay=1 and remembers it for the tab", () => {
    expect(wantsToStay("?x=1&stay=1")).toBe(true);
    expect(window.sessionStorage.getItem(BYPASS_KEY)).toBe("1");
    expect(wantsToStay("")).toBe(true);
  });

  it("still honours the address when storage throws", () => {
    const spy = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(wantsToStay("?stay=1")).toBe(true);
    expect(wantsToStay("")).toBe(false);
    spy.mockRestore();
  });
});

describe("c-portfolio-theme-layout redirect on the Salesforce site", () => {
  let replace;

  beforeEach(() => {
    replace = jest.spyOn(navigation, "replace").mockImplementation(() => {});
    getRedirect.mockReset();
    window.sessionStorage.clear();
    visit("/portfolio/resume?view=x");
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    replace.mockRestore();
    visit("/");
  });

  it("redirects once when the switch is on, the host matches and no bypass is set", async () => {
    getRedirect.mockResolvedValue(ON);
    load();
    await settle();
    expect(getRedirect).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "https://ryanbumstead.com/resume?view=x&from=sf"
    );
  });

  it("stays when the switch is off", async () => {
    getRedirect.mockResolvedValue({ ...ON, enabled: false });
    load();
    await settle();
    expect(replace).not.toHaveBeenCalled();
  });

  it("stays on the wrong host", async () => {
    getRedirect.mockResolvedValue({ ...ON, host: "elsewhere.example.com" });
    load();
    await settle();
    expect(replace).not.toHaveBeenCalled();
  });

  it("stays with the bypass and does not even read the settings", async () => {
    visit("/portfolio/resume?stay=1");
    getRedirect.mockResolvedValue(ON);
    load();
    await settle();
    expect(getRedirect).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps staying on a reload in the same tab after the bypass", async () => {
    visit("/portfolio/resume?stay=1");
    getRedirect.mockResolvedValue(ON);
    load();
    await settle();
    visit("/portfolio/resume");
    load();
    await settle();
    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves the page alone when the read fails", async () => {
    getRedirect.mockRejectedValue(new Error("no"));
    load();
    await settle();
    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves the page alone when the call returns nothing", async () => {
    getRedirect.mockReturnValue(undefined);
    load();
    await settle();
    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves the page alone when the call throws", async () => {
    getRedirect.mockImplementation(() => {
      throw new Error("sync");
    });
    expect(() => load()).not.toThrow();
    await settle();
    expect(replace).not.toHaveBeenCalled();
  });
});
