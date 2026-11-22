/**
 * @description       : Unit tests for governanceEvidence on the static site, where c/siteHost says
 *                      IS_STATIC. The list is read at build time, and the page says so.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/21/2026
 **/
import { createElement } from "@lwc/engine-dom";
import GovernanceEvidence from "c/governanceEvidence";
import getGovernanceEvidence from "@salesforce/apex/GovernanceController.getGovernanceEvidence";

jest.mock(
  "@salesforce/apex/GovernanceController.getGovernanceEvidence",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

jest.mock("c/siteHost", () => ({ __esModule: true, IS_STATIC: true }), {
  virtual: true
});

describe("c-governance-evidence on the static site", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("says the list is as of the last build", async () => {
    const element = createElement("c-governance-evidence", {
      is: GovernanceEvidence
    });
    document.body.appendChild(element);
    getGovernanceEvidence.emit({ governedTotal: 1, runs: [] });
    await new Promise((resolve) => process.nextTick(resolve));
    const note = element.shadowRoot.querySelector('[data-id="static-note"]');
    expect(note.textContent.replace(/\s+/g, " ").trim()).toBe(
      "This list is read when the site is built, so it is as of the last build and can trail the newest deploy."
    );
  });
});
