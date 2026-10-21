/**
 * @description       : Unit tests for skillNetwork LWC on the Small form factor (static SVG, no G6).
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
import { loadG6 } from "c/g6Loader";

const PAYLOAD = require("./data/skillNetworkPayload.json");

// Three skills, two projects and one experience. Five junction rows have both
// ends, and one Project_Skill__c row points at a skill outside the result.
const EXPECTED = { nodes: 6, edges: 5 };

function buildPayload({ empty = false } = {}) {
  const data = JSON.parse(JSON.stringify(PAYLOAD));
  if (empty) {
    data.uiapi.query.Skill__c.edges = [];
  }
  return data;
}

// config/jest.config.js maps every lightning/* import to one universal mock
// component, and Jest keys mocks by the resolved file, so mocking one lightning
// module mocks them all. The factory keeps the universal component as the default
// export (lightning-card, lightning-spinner and friends still render) and adds a
// test wire adapter for graphql.
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

jest.mock("c/g6Loader", () => ({ loadG6: jest.fn() }));

// The Jest transformer defaults formFactor to Large. This file runs as a phone.
jest.mock("@salesforce/client/formFactor", () => ({ default: "Small" }), {
  virtual: true
});

async function flushPromises() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function mount() {
  const element = createElement("c-skill-network", { is: SkillNetwork });
  document.body.appendChild(element);
  return element;
}

describe("c-skill-network (Small form factor)", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("renders a static SVG from the same data and never calls loadG6", async () => {
    const element = mount();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();

    const svg = element.shadowRoot.querySelector("svg.network-svg");
    expect(svg).not.toBeNull();
    expect(svg.querySelectorAll("circle")).toHaveLength(EXPECTED.nodes);
    expect(svg.querySelectorAll("line")).toHaveLength(EXPECTED.edges);
    expect(svg.querySelectorAll("g.svg-skill")).toHaveLength(3);
    expect(svg.querySelectorAll("g.svg-work")).toHaveLength(3);
    expect(element.shadowRoot.querySelector(".graph-container")).toBeNull();
    expect(element.shadowRoot.querySelector(".pause-toggle")).toBeNull();
    expect(loadG6).not.toHaveBeenCalled();
  });

  it("keeps a safe colour when Color_Hex__c is not a hex value", async () => {
    const element = mount();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();

    const fills = Array.from(
      element.shadowRoot.querySelectorAll("g.svg-skill circle")
    ).map((circle) => circle.getAttribute("fill"));
    expect(fills).toEqual(["#123abc", "#0176d3", "#3a49da"]);
  });

  it("lists every node and connection for screen readers", async () => {
    const element = mount();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();

    const items = element.shadowRoot.querySelectorAll(
      ".network-list li.network-node"
    );
    expect(items).toHaveLength(EXPECTED.nodes);
    expect(
      element.shadowRoot.querySelector(".network-summary").textContent
    ).toBe(`${EXPECTED.nodes} items and ${EXPECTED.edges} connections.`);
    expect(loadG6).not.toHaveBeenCalled();
  });

  it("renders the error state and never calls loadG6", async () => {
    const element = mount();
    graphql.emit({ data: undefined, errors: [{ message: "Access denied" }] });
    await flushPromises();

    expect(element.shadowRoot.querySelector(".state-error")).not.toBeNull();
    expect(element.shadowRoot.querySelector("svg")).toBeNull();
    expect(loadG6).not.toHaveBeenCalled();
  });
});
