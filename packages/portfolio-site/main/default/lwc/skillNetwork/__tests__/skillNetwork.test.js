/**
 * @description       : Unit tests for skillNetwork LWC on the Large form factor (the Jest default).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
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

async function flushPromises() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function fakeG6() {
  const layoutMethod = { stop: jest.fn() };
  const graph = {
    data: jest.fn(),
    render: jest.fn(),
    layout: jest.fn(),
    changeData: jest.fn(),
    destroy: jest.fn(),
    get: jest.fn((key) => {
      return key === "layoutController"
        ? { layoutMethods: [layoutMethod] }
        : undefined;
    })
  };
  const G6 = { Graph: jest.fn(() => graph) };
  return { G6, graph, layoutMethod };
}

function mount() {
  const element = createElement("c-skill-network", { is: SkillNetwork });
  document.body.appendChild(element);
  return element;
}

describe("c-skill-network (Large form factor)", () => {
  let g6;

  beforeEach(() => {
    g6 = fakeG6();
    loadG6.mockResolvedValue(g6.G6);
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.IntersectionObserver;
    delete window.matchMedia;
    jest.clearAllMocks();
  });

  it("shows a spinner until the adapter emits", () => {
    const element = mount();
    expect(
      element.shadowRoot.querySelector("lightning-spinner")
    ).not.toBeNull();
    expect(loadG6).not.toHaveBeenCalled();
  });

  it("lists every node and connection for screen readers", async () => {
    const element = mount();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();

    const items = element.shadowRoot.querySelectorAll(
      ".network-list li.network-node"
    );
    expect(items).toHaveLength(EXPECTED.nodes);
    const endpoints = Array.from(items).reduce(
      (sum, item) => sum + Number(item.dataset.connections),
      0
    );
    expect(endpoints).toBe(EXPECTED.edges * 2);
    expect(
      element.shadowRoot.querySelector(".network-summary").textContent
    ).toBe(`${EXPECTED.nodes} items and ${EXPECTED.edges} connections.`);
    expect(items[0].textContent).toContain("Apex, Skill. Connected to");
  });

  it("loads G6 once and constructs a Graph with the nodes and edges", async () => {
    const element = mount();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();

    expect(loadG6).toHaveBeenCalledTimes(1);
    expect(g6.G6.Graph).toHaveBeenCalledTimes(1);
    const config = g6.G6.Graph.mock.calls[0][0];
    expect(config.container).toBe(
      element.shadowRoot.querySelector(".graph-container")
    );
    expect(config.layout.type).toBe("force");
    const graphData = g6.graph.data.mock.calls[0][0];
    expect(graphData.nodes).toHaveLength(EXPECTED.nodes);
    expect(graphData.edges).toHaveLength(EXPECTED.edges);
    expect(graphData.nodes.find((n) => n.id === "a01SKILL1").style.fill).toBe(
      "#123abc"
    );
    // An invalid Color_Hex__c falls back to the category colour.
    expect(graphData.nodes.find((n) => n.id === "a01SKILL2").style.fill).toBe(
      "#0176d3"
    );
    expect(g6.graph.render).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot.querySelector("svg")).toBeNull();
  });

  it("pauses, resumes and resets the layout", async () => {
    const element = mount();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();

    const pause = element.shadowRoot.querySelector(".pause-toggle");
    expect(pause.alternativeText).toBe("Pause layout animation");
    pause.click();
    await flushPromises();
    expect(g6.layoutMethod.stop).toHaveBeenCalledTimes(1);
    expect(pause.alternativeText).toBe("Resume layout animation");
    expect(pause.iconName).toBe("utility:play");

    pause.click();
    await flushPromises();
    expect(g6.graph.layout).toHaveBeenCalledTimes(1);

    element.shadowRoot.querySelector(".reset-layout").click();
    expect(g6.graph.layout).toHaveBeenCalledTimes(2);
  });

  it("waits for the container to be visible before loading G6", async () => {
    const observers = [];
    window.IntersectionObserver = jest.fn((callback) => {
      const observer = { callback, observe: jest.fn(), disconnect: jest.fn() };
      observers.push(observer);
      return observer;
    });
    mount();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();

    expect(observers).toHaveLength(1);
    expect(loadG6).not.toHaveBeenCalled();

    observers[0].callback([{ isIntersecting: true }]);
    await flushPromises();
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(loadG6).toHaveBeenCalledTimes(1);
    expect(g6.G6.Graph).toHaveBeenCalledTimes(1);
  });

  it("updates the graph in place when the adapter emits again", async () => {
    mount();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();

    expect(loadG6).toHaveBeenCalledTimes(1);
    expect(g6.graph.changeData).toHaveBeenCalledTimes(1);
  });

  it("falls back to the static SVG when G6 fails to load", async () => {
    loadG6.mockRejectedValue(new Error("G6_Library failed to load: blocked"));
    const element = mount();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".graph-container")).toBeNull();
    expect(element.shadowRoot.querySelector("svg")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".graph-error").textContent
    ).toContain("blocked");
  });

  it("renders the static SVG and never loads G6 on a narrow viewport", async () => {
    window.matchMedia = jest.fn(() => ({ matches: true }));
    const element = mount();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();

    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
    expect(element.shadowRoot.querySelector("svg")).not.toBeNull();
    expect(loadG6).not.toHaveBeenCalled();
  });

  it("renders the error state when the adapter returns errors", async () => {
    const element = mount();
    graphql.emit({
      data: undefined,
      errors: [{ message: "No such column 'Color_Hex__c'" }]
    });
    await flushPromises();

    const alert = element.shadowRoot.querySelector(".state-error");
    expect(alert).not.toBeNull();
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("No such column");
    expect(element.shadowRoot.querySelector(".network-list")).toBeNull();
    expect(loadG6).not.toHaveBeenCalled();
  });

  it("renders the empty state when there are no skills", async () => {
    const element = mount();
    graphql.emit({ data: buildPayload({ empty: true }), errors: undefined });
    await flushPromises();

    expect(element.shadowRoot.querySelector(".state-empty")).not.toBeNull();
    expect(loadG6).not.toHaveBeenCalled();
  });

  it("destroys the graph when removed from the page", async () => {
    const element = mount();
    graphql.emit({ data: buildPayload(), errors: undefined });
    await flushPromises();
    document.body.removeChild(element);

    expect(g6.graph.destroy).toHaveBeenCalledTimes(1);
  });
});
