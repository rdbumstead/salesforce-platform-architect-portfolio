/**
 * @description       : Unit tests for c-data-source on the static site, where c/siteHost gives a
 *                      build time. The button shows the build date on one line and keeps the
 *                      full label with the time as its title and its spoken name. On the
 *                      Salesforce site the button has no title and shows the live label.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/05/2026
 **/
import { createElement } from "@lwc/engine-dom";
import DataSource from "c/dataSource";
import { builtAt } from "c/siteHost";

jest.mock(
  "@salesforce/apex/DataSourceController.getSources",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/DataSourceController.getObjectSources",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);
jest.mock("c/siteHost", () => {
  const actual = jest.requireActual("c/siteHost");
  return { ...actual, builtAt: jest.fn(() => null) };
});

function create() {
  const element = createElement("c-data-source", { is: DataSource });
  document.body.appendChild(element);
  return element;
}

const button = (el) => el.shadowRoot.querySelector(".marker-button");
const label = (el) => el.shadowRoot.querySelector(".marker-label");

describe("c-data-source label on the static site", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows the build date, with the full label as the title and spoken name", async () => {
    builtAt.mockReturnValue("2026-11-03T14:05:09.000Z");
    const el = create();
    await Promise.resolve();
    expect(label(el).textContent).toBe("From Salesforce · built 3 Nov 2026");
    expect(button(el).getAttribute("title")).toBe(
      "From Salesforce · built 3 Nov 2026, 14:05 UTC"
    );
    expect(button(el).getAttribute("aria-label")).toBe(
      "From Salesforce · built 3 Nov 2026, 14:05 UTC"
    );
  });

  it("keeps the live label and no title on the Salesforce site", async () => {
    builtAt.mockReturnValue(null);
    const el = create();
    await Promise.resolve();
    expect(label(el).textContent).toBe("Live from Salesforce");
    expect(button(el).getAttribute("title")).toBeNull();
  });
});
