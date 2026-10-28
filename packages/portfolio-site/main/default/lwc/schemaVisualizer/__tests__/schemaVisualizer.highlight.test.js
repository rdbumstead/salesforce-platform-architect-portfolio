/**
 * @description       : Unit tests for schemaVisualizer in highlight mode, where a section passes the
 *                      API names it reads. The whole data model those objects belong to is drawn,
 *                      the section's objects stand out and the rest fade, and the labels and the
 *                      list say which objects the section reads.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/28/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SchemaVisualizer from "c/schemaVisualizer";
import getSchemaGraph from "@salesforce/apex/SchemaService.getSchemaGraph";
import getObjectGraph from "@salesforce/apex/SchemaService.getObjectGraph";
import { loadGraphEngine, layoutGraph } from "c/graphEngine";

jest.mock(
  "@salesforce/apex/SchemaService.getSchemaGraph",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/SchemaService.getObjectGraph",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "c/graphEngine",
  () => ({
    loadGraphEngine: jest.fn(),
    layoutGraph: jest.fn(),
    boundsOf: jest.requireActual("c/graphEngine").boundsOf
  }),
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

// Account, EH_Job_Posting__c and EH_Partner_Engagement__c, with Job_Posting to Partner_Engagement
// and Partner_Engagement to Account.
const PAYLOAD = require("./data/schemaGraph.json");
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

function q(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function qa(element, selector) {
  return Array.from(element.shadowRoot.querySelectorAll(selector));
}

async function drawn(props) {
  const element = mount(props);
  getSchemaGraph.emit(PAYLOAD);
  await flushPromises();
  return element;
}

describe("c-schema-visualizer highlight mode", () => {
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

  it("draws the portfolio model for portfolio objects and never asks for just those objects", async () => {
    mount({ highlight: "Project__c" });
    await flushPromises();

    expect(getSchemaGraph.getLastConfig()).toEqual({ scope: "portfolio" });
    expect(getObjectGraph.getLastConfig()).not.toEqual({
      objectNames: ["Project__c"]
    });
  });

  it("draws the Employer Hub model when every object is an Employer Hub one", async () => {
    mount({ highlight: ["EH_Job_Posting__c", "eh_partner_engagement__c"] });
    await flushPromises();

    expect(getSchemaGraph.getLastConfig()).toEqual({ scope: "employerHub" });
  });

  it("hides the scope toggle and names both counts in the caption", async () => {
    const element = await drawn({ highlight: "EH_Job_Posting__c" });

    expect(q(element, ".scope-toggle")).toBeNull();
    expect(q(element, ".erd-title").textContent).toBe(
      "This section's data model"
    );
    expect(q(element, ".caption").textContent).toBe(
      "The one object this section reads, highlighted among the 3 in the data model, described live in 142 ms of server CPU."
    );
  });

  it("counts several objects in the caption", async () => {
    const element = await drawn({
      highlight: "EH_Job_Posting__c,EH_Partner_Engagement__c"
    });

    expect(q(element, ".caption").textContent).toContain(
      "The 2 objects this section reads, highlighted among the 3"
    );
  });

  it("draws every object, the section's highlighted and the rest faded, ignoring case", async () => {
    const element = await drawn({ highlight: "eh_job_posting__c" });

    const nodes = qa(element, "g.node");
    expect(nodes).toHaveLength(3);
    const byApi = Object.fromEntries(
      nodes.map((node) => [node.dataset.api, node.getAttribute("class")])
    );
    expect(byApi.EH_Job_Posting__c).toContain("node_highlight");
    expect(byApi.EH_Job_Posting__c).not.toContain("node_dim");
    expect(byApi.Account).toContain("node_dim");
    expect(byApi.EH_Partner_Engagement__c).toContain("node_dim");
  });

  it("fades only the edges with neither end in the section", async () => {
    const element = await drawn({ highlight: "EH_Job_Posting__c" });

    const classes = qa(element, "g.edge").map((edge) =>
      edge.getAttribute("class")
    );
    expect(classes.filter((name) => name.includes("edge_dim"))).toHaveLength(
      classes.length - 1
    );
  });

  it("says in each label and in the list which objects the section reads, its own first", async () => {
    const element = await drawn({ highlight: "Account" });

    const node = q(element, 'g.node[data-api="Account"]');
    expect(node.getAttribute("aria-label")).toContain("read by this section");
    const other = q(element, 'g.node[data-api="EH_Job_Posting__c"]');
    expect(other.getAttribute("aria-label")).not.toContain(
      "read by this section"
    );
    const items = qa(element, ".object-button").map((button) =>
      button.textContent.trim()
    );
    expect(items[0]).toContain("read by this section");
    expect(
      items.filter((text) => text.includes("read by this section"))
    ).toHaveLength(1);
  });

  it("adds the highlight to the legend only in highlight mode", async () => {
    const highlighted = await drawn({ highlight: "Account" });
    expect(q(highlighted, '[data-id="legend-highlight"]')).not.toBeNull();
    document.body.removeChild(highlighted);

    const plain = await drawn({});
    expect(q(plain, '[data-id="legend-highlight"]')).toBeNull();
    expect(qa(plain, "g.node.node_dim")).toHaveLength(0);
  });

  it("lets objects win when both are set", async () => {
    const element = mount({ objects: "Skill__c", highlight: "Account" });
    getObjectGraph.emit(PAYLOAD);
    await flushPromises();

    expect(getObjectGraph.getLastConfig()).toEqual({
      objectNames: ["Skill__c"]
    });
    expect(q(element, ".caption").textContent).toBe(
      "The 3 objects this section reads, described live in 142 ms of server CPU."
    );
    expect(qa(element, "g.node.node_dim")).toHaveLength(0);
  });
});
