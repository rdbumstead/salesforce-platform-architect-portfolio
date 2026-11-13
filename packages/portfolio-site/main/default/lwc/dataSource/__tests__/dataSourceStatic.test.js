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

  it("starts the spoken name with the shown words, counts included, and puts the time last", async () => {
    builtAt.mockReturnValue("2026-11-03T14:05:09.000Z");
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
    expect(shown).toBe("From Salesforce · built 3 Nov 2026 10 roles");
    expect(name.replace(/,/g, "").startsWith(shown.replace(/,/g, ""))).toBe(
      true
    );
    expect(
      name.startsWith("From Salesforce · built 3 Nov 2026, 10 roles")
    ).toBe(true);
    expect(name.endsWith(", 14:05 UTC")).toBe(true);
  });

  it("keeps the live label and no title on the Salesforce site", async () => {
    builtAt.mockReturnValue(null);
    const el = create();
    await Promise.resolve();
    expect(label(el).textContent).toBe("Live from Salesforce");
    expect(button(el).getAttribute("title")).toBeNull();
  });
});
