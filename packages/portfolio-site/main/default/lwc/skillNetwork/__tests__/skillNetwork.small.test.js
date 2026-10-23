/**
 * @description       : Unit tests for skillNetwork LWC on the Small form factor: the matrix only, no view
 *                      switch, and no request for the graph engine (Round 5 plan M2).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SkillNetwork from "c/skillNetwork";
// Same module as the component, which the Round 3 plan pins.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { graphql } from "lightning/uiGraphQLApi";
import { loadGraphEngine, layoutGraph } from "c/graphEngine";

const PAYLOAD = require("./data/skillNetworkPayload.json");

// config/jest.config.js maps every lightning/* import to one universal mock component, so the
// factory keeps it as the default export and adds a test wire adapter for graphql.
jest.mock(
  "lightning/uiGraphQLApi",
  () => {
    const {
      createTestWireAdapter
    } = require("@salesforce/wire-service-jest-util");
    const universal = jest.requireActual("lightning/uiGraphQLApi");
    return {
      __esModule: true,
      default: universal.default,
      graphql: createTestWireAdapter(jest.fn()),
      gql: jest.fn()
    };
  },
  { virtual: true }
);

jest.mock(
  "c/graphEngine",
  () => ({
    loadGraphEngine: jest.fn(),
    layoutGraph: jest.fn(),
    attachPanZoom: jest.fn(),
    attachNodeDrag: jest.fn()
  }),
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: {
      SKILLS_VIEW_CHANGED: "skills_view_changed",
      SKILL_SELECTED: "skill_selected"
    }
  }),
  { virtual: true }
);

// The Jest transformer defaults formFactor to Large. This file runs as a phone.
jest.mock("@salesforce/client/formFactor", () => ({ default: "Small" }), {
  virtual: true
});

async function flushPromises() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

async function mountWithData() {
  const element = createElement("c-skill-network", { is: SkillNetwork });
  document.body.appendChild(element);
  graphql.emit({
    data: JSON.parse(JSON.stringify(PAYLOAD)),
    errors: undefined
  });
  await flushPromises();
  return element;
}

describe("c-skill-network (Small form factor)", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("shows the matrix with no view switch and never requests the engine", async () => {
    const element = await mountWithData();

    expect(element.shadowRoot.querySelector(".view-switch")).toBeNull();
    expect(element.shadowRoot.querySelectorAll(".matrix-row")).toHaveLength(3);
    expect(element.shadowRoot.querySelectorAll("button.chip")).toHaveLength(5);
    expect(element.shadowRoot.querySelector(".graph-view")).toBeNull();
    expect(loadGraphEngine).not.toHaveBeenCalled();
    expect(layoutGraph).not.toHaveBeenCalled();
  });

  it("still selects a chip and lists where it was used", async () => {
    const element = await mountWithData();

    const chip = [...element.shadowRoot.querySelectorAll("button.chip")].find(
      (button) =>
        button.querySelector(".chip-name").textContent === "Data Cloud"
    );
    chip.click();
    await flushPromises();

    const panel = element.shadowRoot.querySelector(".selection-panel");
    expect(panel.querySelector(".selection-roles").textContent).toContain(
      "Analyst"
    );
    expect(loadGraphEngine).not.toHaveBeenCalled();
  });
});
