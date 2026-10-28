/**
 * @description       : Unit tests for schemaVisualizer in objects mode, where a section passes the
 *                      API names it reads. SchemaService.getObjectGraph replaces getSchemaGraph, the
 *                      scope toggle is hidden, and the engine still starts when the diagram is
 *                      already on screen, as in a dialog that has just opened.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/28/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SchemaVisualizer, { parseObjectNames } from "c/schemaVisualizer";
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
  return element.shadowRoot.querySelectorAll(selector);
}

describe("parseObjectNames", () => {
  it("splits a comma separated string, trims and drops blanks and repeats", () => {
    expect(parseObjectNames(" Skill__c, ,Experience__c,Skill__c ")).toEqual([
      "Skill__c",
      "Experience__c"
    ]);
  });

  it("accepts an array and ignores anything else", () => {
    expect(parseObjectNames([" Skill__c ", "", null, "Account"])).toEqual([
      "Skill__c",
      "Account"
    ]);
    expect(parseObjectNames(undefined)).toEqual([]);
    expect(parseObjectNames(42)).toEqual([]);
  });
});

describe("c-schema-visualizer objects mode", () => {
  const originalObserver = window.IntersectionObserver;

  beforeEach(() => {
    loadGraphEngine.mockResolvedValue(FAKE_D3);
    layoutGraph.mockImplementation(placedLayout);
  });

  afterEach(() => {
    window.IntersectionObserver = originalObserver;
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("wires getObjectGraph with the names from a comma separated string", async () => {
    mount({ objects: "Experience__c, Skill__c" });
    await flushPromises();

    expect(getObjectGraph.getLastConfig()).toEqual({
      objectNames: ["Experience__c", "Skill__c"]
    });
  });

  it("accepts an array of names", async () => {
    mount({ objects: ["Project__c", "Skill__c"] });
    await flushPromises();

    expect(getObjectGraph.getLastConfig()).toEqual({
      objectNames: ["Project__c", "Skill__c"]
    });
  });

  it("does not run the scope wire in objects mode", async () => {
    mount({ objects: "Skill__c" });
    await flushPromises();

    expect(getSchemaGraph.getLastConfig()).not.toEqual({
      scope: "employerHub"
    });
  });

  it("hides the scope toggle and says it shows the objects the section reads", async () => {
    const element = mount({ objects: "Skill__c" });
    getObjectGraph.emit(PAYLOAD);
    await flushPromises();

    expect(q(element, ".scope-toggle")).toBeNull();
    expect(q(element, ".erd-title").textContent).toBe(
      "This section's data model"
    );
    expect(q(element, ".caption").textContent).toBe(
      "The 3 objects this section reads, described live in 142 ms of server CPU."
    );
    expect(qa(element, ".object-item")).toHaveLength(3);
    expect(qa(element, "g.node")).toHaveLength(3);
  });

  it("says so when none of the objects can be drawn", async () => {
    const element = mount({ objects: "User" });
    getObjectGraph.emit({
      scope: "objects",
      nodes: [],
      edges: [],
      objectCount: 0,
      cpuMs: 1
    });
    await flushPromises();

    expect(q(element, ".status").textContent).toBe(
      "No objects to show for this section."
    );
  });

  it("shows a plain error when the objects wire errors", async () => {
    const element = mount({ objects: "Skill__c" });
    getObjectGraph.error();
    await flushPromises();

    expect(q(element, ".status_error").textContent).toBe(
      "The data model could not be loaded."
    );
  });

  it("behaves as before when objects is empty", async () => {
    const element = mount({ objects: " , " });
    await flushPromises();

    expect(getSchemaGraph.getLastConfig()).toEqual({ scope: "employerHub" });
    getSchemaGraph.emit(PAYLOAD);
    await flushPromises();
    expect(qa(element, ".scope-button")).toHaveLength(2);
    expect(q(element, ".erd-title").textContent).toBe("Data model, live");
    expect(q(element, ".caption").textContent).toBe(
      "3 objects, described in 142 ms of server CPU"
    );
  });

  it("returns to the scope view when objects is cleared", async () => {
    const element = mount({ objects: "Skill__c" });
    getObjectGraph.emit(PAYLOAD);
    await flushPromises();

    element.objects = "";
    await flushPromises();
    getSchemaGraph.emit(PAYLOAD);
    await flushPromises();

    expect(getSchemaGraph.getLastConfig()).toEqual({ scope: "employerHub" });
    expect(qa(element, ".scope-button")).toHaveLength(2);
  });

  it("starts the engine when the diagram is already on screen, as in a dialog", async () => {
    const observe = jest.fn();
    window.IntersectionObserver = jest.fn(function (callback) {
      this.observe = (target) => {
        observe(target);
        callback([{ isIntersecting: true, target }]);
      };
      this.disconnect = jest.fn();
    });
    const element = mount({ objects: "Skill__c" });
    getObjectGraph.emit(PAYLOAD);
    await flushPromises();

    expect(observe).toHaveBeenCalledTimes(1);
    expect(loadGraphEngine).toHaveBeenCalledTimes(1);
    expect(qa(element, "g.node")).toHaveLength(3);
  });

  it("waits for the diagram to be visible before it loads the engine", async () => {
    let report;
    window.IntersectionObserver = jest.fn(function (callback) {
      report = callback;
      this.observe = jest.fn();
      this.disconnect = jest.fn();
    });
    mount({ objects: "Skill__c" });
    getObjectGraph.emit(PAYLOAD);
    await flushPromises();

    expect(loadGraphEngine).not.toHaveBeenCalled();
    report([{ isIntersecting: true }]);
    await flushPromises();
    expect(loadGraphEngine).toHaveBeenCalledTimes(1);
  });

  it("watches the new diagram when the names change before the first one was seen", async () => {
    const observers = [];
    window.IntersectionObserver = jest.fn(function (callback) {
      this.callback = callback;
      this.observe = jest.fn();
      this.disconnect = jest.fn();
      observers.push(this);
    });
    const element = mount({ objects: "Skill__c" });
    getObjectGraph.emit(PAYLOAD);
    await flushPromises();
    expect(observers).toHaveLength(1);

    element.objects = "Project__c";
    await flushPromises();
    getObjectGraph.emit(PAYLOAD);
    await flushPromises();

    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(observers).toHaveLength(2);
    observers[1].callback([{ isIntersecting: true }]);
    await flushPromises();
    expect(loadGraphEngine).toHaveBeenCalledTimes(1);
  });
});
