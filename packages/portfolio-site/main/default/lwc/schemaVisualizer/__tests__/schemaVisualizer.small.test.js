/**
 * @description       : Unit tests for schemaVisualizer on the Small form factor and on a narrow
 *                      viewport. The list is the visible view and the graph engine is never requested.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
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

// The Jest transformer defaults formFactor to Large. This file runs as a phone.
jest.mock("@salesforce/client/formFactor", () => ({ default: "Small" }), {
  virtual: true
});

const PAYLOAD = require("./data/schemaGraph.json");

async function flushPromises() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function mount() {
  const element = createElement("c-schema-visualizer", {
    is: SchemaVisualizer
  });
  document.body.appendChild(element);
  return element;
}

describe("c-schema-visualizer (Small form factor)", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("shows the list as the visible view and never requests the engine", async () => {
    const element = mount();
    getSchemaGraph.emit(PAYLOAD);
    await flushPromises();

    expect(loadGraphEngine).not.toHaveBeenCalled();
    expect(layoutGraph).not.toHaveBeenCalled();
    expect(element.shadowRoot.querySelector(".diagram")).toBeNull();
    expect(element.shadowRoot.querySelector("svg.diagram-svg")).toBeNull();
    const list = element.shadowRoot.querySelector(".object-list");
    expect(list.className).not.toContain("object-list_assistive");
    expect(element.shadowRoot.querySelectorAll(".object-item")).toHaveLength(3);
    // The payload holds three references, Account.ParentId is a platform self lookup.
    expect(element.shadowRoot.querySelectorAll(".relationship")).toHaveLength(
      2
    );
  });

  it("lists a node's fields from the list and keeps the scope toggle", async () => {
    const element = mount();
    getSchemaGraph.emit(PAYLOAD);
    await flushPromises();

    element.shadowRoot
      .querySelector('.object-button[data-api="Account"]')
      .click();
    await flushPromises();
    expect(element.shadowRoot.querySelectorAll(".field-row")).toHaveLength(2);
    expect(trackEvent).toHaveBeenCalledWith("erd_node_selected", {
      object: "Account"
    });

    element.shadowRoot
      .querySelector('.scope-button[data-scope="portfolio"]')
      .click();
    await flushPromises();
    expect(getSchemaGraph.getLastConfig()).toEqual({ scope: "portfolio" });
    expect(loadGraphEngine).not.toHaveBeenCalled();
  });
});
