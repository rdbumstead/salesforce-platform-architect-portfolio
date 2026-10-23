/**
 * @description       : Unit tests for schemaVisualizer on the Large form factor (the Jest default).
 *                      SchemaService.getSchemaGraph is a mocked wire adapter, c/graphEngine and
 *                      c/analyticsService are virtual mocks.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SchemaVisualizer from "c/schemaVisualizer";
import getSchemaGraph from "@salesforce/apex/SchemaService.getSchemaGraph";
import { loadGraphEngine, layoutGraph } from "c/graphEngine";
import { trackEvent } from "c/analyticsService";

jest.mock(
  "@salesforce/apex/SchemaService.getSchemaGraph",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "c/graphEngine",
  () => ({ loadGraphEngine: jest.fn(), layoutGraph: jest.fn() }),
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: {
      ERD_SCOPE_CHANGED: "erd_scope_changed",
      ERD_NODE_SELECTED: "erd_node_selected"
    }
  }),
  { virtual: true }
);

const PAYLOAD = require("./data/schemaGraph.json");

// Three objects and three reference fields. Account.ParentId points at Account itself,
// so it is listed but not drawn.
const EXPECTED = { nodes: 3, edges: 3, drawnEdges: 2, masterDetail: 1 };

const FAKE_D3 = { forceSimulation: jest.fn() };

function placedLayout(d3, nodes, edges) {
  const placed = nodes.map((node, index) => ({
    ...node,
    x: 200 + index * 250,
    y: 300
  }));
  const byId = new Map(placed.map((node) => [node.id, node]));
  return {
    nodes: placed,
    edges: edges.map((edge) => ({
      ...edge,
      x1: byId.get(edge.source).x,
      y1: byId.get(edge.source).y,
      x2: byId.get(edge.target).x,
      y2: byId.get(edge.target).y
    }))
  };
}

async function flushPromises() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function mount(props = {}) {
  const element = createElement("c-schema-visualizer", {
    is: SchemaVisualizer
  });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

function qa(element, selector) {
  return element.shadowRoot.querySelectorAll(selector);
}

function q(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

describe("c-schema-visualizer", () => {
  beforeEach(() => {
    loadGraphEngine.mockResolvedValue(FAKE_D3);
    layoutGraph.mockImplementation(placedLayout);
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("places View source with the schemaVisualizer key beside the heading (contract P2)", async () => {
    const element = mount();
    await flushPromises();

    const control = q(element, ".erd-header c-view-source");
    expect(control).not.toBeNull();
    expect(control.sourceKey).toBe("schemaVisualizer");
  });

  it("asks for the employerHub scope by default and shows a loading line", async () => {
    const element = mount();
    await flushPromises();

    expect(getSchemaGraph.getLastConfig()).toEqual({ scope: "employerHub" });
    expect(q(element, ".status").textContent).toContain("Loading");
  });

  it("asks for the scope set in the builder", async () => {
    mount({ scope: "portfolio" });
    await flushPromises();

    expect(getSchemaGraph.getLastConfig()).toEqual({ scope: "portfolio" });
  });

  it("puts every node and every edge from the payload in the list, with the caption", async () => {
    const element = mount();
    getSchemaGraph.emit(PAYLOAD);
    await flushPromises();

    expect(qa(element, ".object-item")).toHaveLength(EXPECTED.nodes);
    expect(qa(element, ".relationship")).toHaveLength(EXPECTED.edges);
    expect(q(element, ".caption").textContent).toBe(
      "3 objects, described in 142 ms of server CPU"
    );
    const texts = Array.from(qa(element, ".relationship")).map(
      (item) => item.textContent
    );
    expect(texts).toContain(
      "Partner_Engagement__c: master-detail to EH_Partner_Engagement__c"
    );
    expect(texts).toContain("Account__c: lookup to Account");
  });

  it("loads the engine on desktop and draws every node and each edge with length", async () => {
    const element = mount();
    getSchemaGraph.emit(PAYLOAD);
    await flushPromises();

    expect(loadGraphEngine).toHaveBeenCalledTimes(1);
    const [, nodes, edges, options] = layoutGraph.mock.calls[0];
    expect(nodes).toHaveLength(EXPECTED.nodes);
    expect(edges).toHaveLength(EXPECTED.drawnEdges);
    // The layout runs squeezed sideways by 2.2 and is stretched back to the 960 by 720 view.
    expect(options).toEqual(
      expect.objectContaining({ width: 960 / 2.2, height: 720 })
    );
    expect(qa(element, "g.node")).toHaveLength(EXPECTED.nodes);
    expect(qa(element, "g.edge")).toHaveLength(EXPECTED.drawnEdges);
    expect(qa(element, "g.edge_master")).toHaveLength(EXPECTED.masterDetail);
    expect(qa(element, "g.edge_lookup")).toHaveLength(
      EXPECTED.drawnEdges - EXPECTED.masterDetail
    );
    expect(qa(element, "g.edge .edge-dot")).toHaveLength(EXPECTED.masterDetail);
    expect(q(element, ".object-list").className).toContain(
      "object-list_assistive"
    );
  });

  it("lists the fields of a node when it is clicked and tracks the selection", async () => {
    const element = mount();
    getSchemaGraph.emit(PAYLOAD);
    await flushPromises();

    // jsdom gives SVG elements no click(), so the event is dispatched.
    q(element, 'g.node[data-api="EH_Partner_Engagement__c"]').dispatchEvent(
      new CustomEvent("click")
    );
    await flushPromises();

    expect(q(element, ".panel-title").textContent).toBe(
      "Partner Engagement (EH_Partner_Engagement__c)"
    );
    const rows = qa(element, ".field-row");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("Account__c");
    expect(rows[0].textContent).toContain("REFERENCE");
    expect(rows[0].textContent).toContain("Account");
    expect(rows[1].textContent).toContain("STRING, required");
    expect(trackEvent).toHaveBeenCalledWith("erd_node_selected", {
      object: "EH_Partner_Engagement__c"
    });
    expect(
      q(element, 'g.node[data-api="EH_Partner_Engagement__c"]').getAttribute(
        "aria-pressed"
      )
    ).toBe("true");

    q(element, ".panel-close").click();
    await flushPromises();
    expect(q(element, ".panel")).toBeNull();
  });

  it("selects a node from the keyboard", async () => {
    const element = mount();
    getSchemaGraph.emit(PAYLOAD);
    await flushPromises();

    q(element, 'g.node[data-api="Account"]').dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter" })
    );
    await flushPromises();

    expect(q(element, ".panel-title").textContent).toBe("Account (Account)");
  });

  it("selects a node from the list", async () => {
    const element = mount();
    getSchemaGraph.emit(PAYLOAD);
    await flushPromises();

    q(element, '.object-button[data-api="EH_Job_Posting__c"]').click();
    await flushPromises();

    expect(qa(element, ".field-row")).toHaveLength(2);
  });

  it("rewires with the other scope when the toggle is pressed and tracks it", async () => {
    const element = mount();
    getSchemaGraph.emit(PAYLOAD);
    await flushPromises();

    const portfolio = q(element, '.scope-button[data-scope="portfolio"]');
    expect(portfolio.getAttribute("aria-pressed")).toBe("false");
    portfolio.click();
    await flushPromises();

    expect(getSchemaGraph.getLastConfig()).toEqual({ scope: "portfolio" });
    expect(trackEvent).toHaveBeenCalledWith("erd_scope_changed", {
      scope: "portfolio"
    });
    expect(
      q(element, '.scope-button[data-scope="portfolio"]').getAttribute(
        "aria-pressed"
      )
    ).toBe("true");

    q(element, '.scope-button[data-scope="portfolio"]').click();
    await flushPromises();
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("shows the list when the engine fails to load", async () => {
    loadGraphEngine.mockRejectedValue(new Error("blocked"));
    const element = mount();
    getSchemaGraph.emit(PAYLOAD);
    await flushPromises();

    expect(q(element, ".diagram")).toBeNull();
    expect(q(element, ".status_error").textContent).toContain(
      "object list is shown instead"
    );
    expect(q(element, ".object-list").className).not.toContain(
      "object-list_assistive"
    );
    expect(qa(element, ".object-item")).toHaveLength(EXPECTED.nodes);
  });

  it("shows a plain error when the wire errors", async () => {
    const element = mount();
    getSchemaGraph.error();
    await flushPromises();

    expect(q(element, ".status_error").textContent).toBe(
      "The data model could not be loaded."
    );
    expect(q(element, ".object-list")).toBeNull();
    expect(loadGraphEngine).not.toHaveBeenCalled();
  });

  it("never requests the engine on a narrow viewport", async () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn(() => ({ matches: true }));
    try {
      const element = mount();
      getSchemaGraph.emit(PAYLOAD);
      await flushPromises();

      expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
      expect(loadGraphEngine).not.toHaveBeenCalled();
      expect(q(element, ".diagram")).toBeNull();
      expect(qa(element, ".object-item")).toHaveLength(EXPECTED.nodes);
    } finally {
      window.matchMedia = original;
    }
  });

  it("says so when the scope has no objects", async () => {
    const element = mount();
    getSchemaGraph.emit({ ...PAYLOAD, nodes: [], edges: [], objectCount: 0 });
    await flushPromises();

    expect(q(element, ".status").textContent).toBe(
      "No objects to show for this scope."
    );
  });
});
