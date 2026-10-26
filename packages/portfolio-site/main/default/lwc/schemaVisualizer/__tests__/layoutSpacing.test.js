/**
 * @description       : Spacing measure for the Pillar A ERD. Mounts the real component on
 *                      the two production scopes (Employer Hub, 9 objects, and Portfolio, 14 objects, with
 *                      every reference field, read from the live page's object list), runs the real
 *                      layoutGraph on the real D3_Library build, and measures what the template draws:
 *                      object boxes that overlap, the smallest gap between two boxes, lines that cross a
 *                      box that is not one of their ends, and nodes held on the clamp at the box edge.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SchemaVisualizer from "c/schemaVisualizer";
import getSchemaGraph from "@salesforce/apex/SchemaService.getSchemaGraph";
import { loadGraphEngine, layoutGraph } from "c/graphEngine";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SCOPES = require("./data/productionScopes.json");

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

function loadD3() {
  const source = fs
    .readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "..",
        "staticresources",
        "D3_Library.js"
      ),
      "utf8"
    )
    .replace(/\r\n/g, "\n");
  const fakeWindow = { setTimeout, clearTimeout, setInterval, clearInterval };
  fakeWindow.window = fakeWindow;
  fakeWindow.self = fakeWindow;
  const context = vm.createContext(fakeWindow);
  vm.runInContext(source, context, { filename: "D3_Library.js" });
  return vm.runInContext("globalThis", context).d3;
}

async function flushPromises() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function num(element, name) {
  return Number(element.getAttribute(name));
}

function rects(element) {
  return [...element.shadowRoot.querySelectorAll("g.node rect")].map((rect) => {
    const left = num(rect, "x");
    const top = num(rect, "y");
    return {
      api: rect.parentElement.dataset.api,
      left,
      top,
      right: left + num(rect, "width"),
      bottom: top + num(rect, "height")
    };
  });
}

// Distance between two boxes, 0 when they touch, negative never (overlaps are counted apart).
function boxGap(a, b) {
  const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  return Math.hypot(dx, dy);
}

function boxesOverlap(a, b) {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

// Liang Barsky clip: true when the segment passes through the inside of the box.
function segmentCrossesBox(x1, y1, x2, y2, box) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let low = 0;
  let high = 1;
  const edges = [
    [-dx, x1 - box.left],
    [dx, box.right - x1],
    [-dy, y1 - box.top],
    [dy, box.bottom - y1]
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) {
        return false;
      }
    } else {
      const t = q / p;
      if (p < 0) {
        low = Math.max(low, t);
      } else {
        high = Math.min(high, t);
      }
    }
  }
  return high - low > 1e-6;
}

let lastCall;

async function measure(scope) {
  const element = createElement("c-schema-visualizer", {
    is: SchemaVisualizer
  });
  element.scope = scope;
  document.body.appendChild(element);
  getSchemaGraph.emit(JSON.parse(JSON.stringify(SCOPES[scope])));
  await flushPromises();

  const boxes = rects(element);
  let boxOverlaps = 0;
  let smallestGap = Infinity;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j])) {
        boxOverlaps++;
      } else {
        smallestGap = Math.min(smallestGap, boxGap(boxes[i], boxes[j]));
      }
    }
  }

  // A drawn line runs between two box centres, cut at the box edges. Any other box it passes
  // through is a crossing. Centres come from the drawn boxes, so any stretch the component
  // applies after the layout is included.
  const centres = new Map(
    boxes.map((box) => [
      box.api,
      { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
    ])
  );
  let linesThroughBoxes = 0;
  lastCall.result.edges.forEach((edge) => {
    const from = centres.get(edge.source);
    const to = centres.get(edge.target);
    boxes.forEach((box) => {
      if (box.api === edge.source || box.api === edge.target) {
        return;
      }
      if (segmentCrossesBox(from.x, from.y, to.x, to.y, box)) {
        linesThroughBoxes++;
      }
    });
  });

  const options = lastCall.args[3];
  const onClamp = lastCall.result.nodes.filter(
    (node) =>
      node.x - node.radius <= 0.5 ||
      node.x + node.radius >= options.width - 0.5 ||
      node.y - node.radius <= 0.5 ||
      node.y + node.radius >= options.height - 0.5
  ).length;

  return {
    nodes: boxes.length,
    lines: element.shadowRoot.querySelectorAll("g.edge").length,
    view: element.shadowRoot
      .querySelector("svg.diagram-svg")
      .getAttribute("viewBox"),
    boxOverlaps,
    smallestGap: Math.round(smallestGap * 10) / 10,
    linesThroughBoxes,
    onClamp
  };
}

describe("c-schema-visualizer diagram spacing on the production scopes", () => {
  let realLayout;
  let d3;

  beforeAll(() => {
    d3 = loadD3();
    realLayout = jest.requireActual("c/graphEngine").layoutGraph;
  });

  beforeEach(() => {
    loadGraphEngine.mockResolvedValue(d3);
    layoutGraph.mockImplementation((...args) => {
      const result = realLayout(...args);
      lastCall = { args, result };
      return result;
    });
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  // Before the spacing was tuned (960 by 600, round nodes of radius 84, charge -600, link distance 180):
  // Employer Hub gap 15.9, 4 lines through boxes, 4 on the clamp. Portfolio gap 11.6, 3 lines
  // through boxes, 6 on the clamp. No box overlapped in either.
  // The view box fitted to the drawn boxes changed only the view: it was "0 0 960 720" on both.
  it("measures the Employer Hub diagram", async () => {
    expect(await measure("employerHub")).toEqual({
      nodes: 9,
      lines: 17,
      view: "167.7 66.4 768 523.6",
      boxOverlaps: 0,
      smallestGap: 36,
      linesThroughBoxes: 1,
      onClamp: 0
    });
  });

  it("measures the Portfolio diagram", async () => {
    expect(await measure("portfolio")).toEqual({
      nodes: 14,
      lines: 17,
      view: "6.8 111.1 961.1 616.1",
      boxOverlaps: 0,
      smallestGap: 42.3,
      linesThroughBoxes: 2,
      onClamp: 0
    });
  });
});
