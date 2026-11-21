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
import DataSource, { keepStampWhole } from "c/dataSource";
import { builtAt } from "c/siteHost";
import getSources from "@salesforce/apex/DataSourceController.getSources";

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

function create(props = {}) {
  const element = createElement("c-data-source", { is: DataSource });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

const button = (el) => el.shadowRoot.querySelector(".marker-button");
const label = (el) => el.shadowRoot.querySelector(".marker-label");

/** Puts the visitor in one zone for a test, whatever zone the machine is in. */
function visitorIn(timeZone) {
  jest.restoreAllMocks();
  const Real = Intl.DateTimeFormat;
  jest
    .spyOn(Intl, "DateTimeFormat")
    .mockImplementation(
      (locale, options) => new Real(locale, { timeZone, ...options })
    );
}

describe("c-data-source label on the static site", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows the build date, with the full label as the title and spoken name", async () => {
    visitorIn("America/New_York");
    builtAt.mockReturnValue("2026-11-19T01:33:09.000Z");
    const el = create();
    await Promise.resolve();
    // The stamp's spaces are no break spaces, so a narrow screen never splits it.
    expect(label(el).textContent).toBe(
      "From Salesforce · built Nov 18, 2026, 8:33 PM EST"
    );
    expect(button(el).getAttribute("title")).toBeNull();
    expect(button(el).getAttribute("aria-label")).toBe(
      "From Salesforce · built Nov 18, 2026, 8:33 PM EST"
    );
  });

  it("starts the spoken name with the shown words, counts included, and puts the time last", async () => {
    visitorIn("America/New_York");
    builtAt.mockReturnValue("2026-11-19T01:33:09.000Z");
    const el = create({ sourceKeys: "ResumeController_Roles" });
    getSources.emit([
      {
        name: "ResumeController_Roles",
        label: "Roles",
        description: "Resume roles.",
        hasCount: true,
        count: 10
      }
    ]);
    await Promise.resolve();
    const shown = button(el).textContent.replace(/\s+/g, " ").trim();
    const name = button(el).getAttribute("aria-label");
    expect(shown).toBe(
      "From Salesforce · built Nov 18, 2026, 8:33 PM EST 10 roles"
    );
    expect(name.replace(/,/g, "").startsWith(shown.replace(/,/g, ""))).toBe(
      true
    );
    expect(
      name.startsWith(
        "From Salesforce · built Nov 18, 2026, 8:33 PM EST, 10 roles"
      )
    ).toBe(true);
  });

  it("keeps the live label and no title on the Salesforce site", async () => {
    builtAt.mockReturnValue(null);
    const el = create();
    await Promise.resolve();
    expect(label(el).textContent).toBe("Live from Salesforce");
    expect(button(el).getAttribute("title")).toBeNull();
  });
});

describe("keepStampWhole", () => {
  it("joins the spaces of the stamp after built and leaves other labels alone", () => {
    expect(
      keepStampWhole("From Salesforce · built Nov 18, 2026, 8:33 PM EST")
    ).toBe("From Salesforce · built Nov 18, 2026, 8:33 PM EST");
    expect(keepStampWhole("Live from Salesforce")).toBe("Live from Salesforce");
    expect(keepStampWhole(undefined)).toBe("");
  });
});
