/**
 * @description       : Unit tests for c-footer on the static site, where c/siteHost says
 *                      IS_STATIC. The build leaves the GraphQL probe out on purpose, so the footer
 *                      must not start it. With a live (not recorded) snapshot there is no probe
 *                      element and no GraphQL line once the page is idle, and the other readings
 *                      still show.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/09/2026
 **/
import { createElement } from "@lwc/engine-dom";
import Footer from "c/footer";
import getSystemSnapshot from "@salesforce/apex/FooterController.getSystemSnapshot";

jest.mock(
  "@salesforce/apex/FooterController.getLinks",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/FooterController.getSystemSnapshot",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "" }),
  { virtual: true }
);
jest.mock("c/siteHost", () => {
  const actual = jest.requireActual("c/siteHost");
  return { ...actual, IS_STATIC: true };
});

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

describe("c-footer on the static site", () => {
  let idleCallbacks;

  beforeEach(() => {
    idleCallbacks = [];
    window.requestIdleCallback = jest.fn((callback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    window.cancelIdleCallback = jest.fn();
    getSystemSnapshot.mockResolvedValue({
      cpuTimeMs: 12,
      cpuTimeLimitMs: 10000,
      soqlQueries: 3,
      soqlQueryLimit: 100,
      providers: [],
      aiRequestsToday: 7
    });
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
    jest.clearAllMocks();
  });

  it("starts no GraphQL probe and shows no GraphQL line on a live snapshot", async () => {
    const element = createElement("c-footer", { is: Footer });
    document.body.appendChild(element);
    idleCallbacks.splice(0).forEach((callback) => callback());
    for (let i = 0; i < 6; i++) {
      await flushPromises();
    }

    const root = element.shadowRoot;
    expect(getSystemSnapshot).toHaveBeenCalledTimes(1);
    root.querySelector('button[data-key="limits"]').click();
    await flushPromises();
    expect(root.querySelector('[data-id="limit"]')).not.toBeNull();
    expect(root.querySelector('[data-id="graphql-probe"]')).toBeNull();
    expect(root.querySelector('[data-id="graphql"]')).toBeNull();
    expect(root.querySelector('button[data-key="platform"]')).toBeNull();
    expect(root.querySelector(".chips.chips--six")).toBeNull();
    expect(root.querySelector('[data-id="metrics"]').textContent).not.toMatch(
      /GraphQL/
    );
  });
});
