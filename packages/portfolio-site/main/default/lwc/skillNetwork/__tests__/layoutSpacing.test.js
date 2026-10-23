/**
 * @description       : Spacing measure for the skills graph (Round 6 plan N3). Mounts the real component on
 *                      a fixture shaped like production (59 skills in 12 categories, 11 roles, 5 projects,
 *                      58 role links and 17 project links, read only from production with record Ids
 *                      replaced and role and project names replaced by placeholders of the same length),
 *                      runs the real layoutGraph on the real D3_Library build, and measures what the
 *                      template draws: label boxes that overlap, labels that sit on another node, circles
 *                      that overlap, the smallest gap between category clusters, nodes held on the clamp
 *                      at the box edge, and labels cut off by the view box.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SkillNetwork from "c/skillNetwork";
// Same module as the component, which the Round 3 plan pins.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { graphql } from "lightning/uiGraphQLApi";
import { loadGraphEngine, layoutGraph } from "c/graphEngine";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PAYLOAD = require("./data/productionSkills.json");

// Text metrics from skillNetwork.css: node labels are 12px in the sans face, category labels
// 13px in the mono face. Average character widths are 0.56em (sans) and 0.6em (mono). A box
// runs from 0.75em above the baseline to 0.25em below it.
const NODE_FONT = 12;
const NODE_CHAR = 0.56 * NODE_FONT;
const CATEGORY_FONT = 13;
const CATEGORY_CHAR = 0.6 * CATEGORY_FONT;

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
  () => ({ loadGraphEngine: jest.fn(), layoutGraph: jest.fn() }),
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

// The box a text element covers, from its x, y, anchor and character count.
function textBox(element, charWidth, fontSize) {
  const width = element.textContent.trim().length * charWidth;
  const x = num(element, "x");
  const anchor = element.getAttribute("text-anchor") || "start";
  let left = x;
  if (anchor === "middle") {
    left = x - width / 2;
  } else if (anchor === "end") {
    left = x - width;
  }
  const y = num(element, "y");
  return {
    left,
    right: left + width,
    top: y - 0.75 * fontSize,
    bottom: y + 0.25 * fontSize
  };
}

function boxesOverlap(a, b) {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

function boxHitsCircle(box, circle) {
  const nearX = Math.min(Math.max(circle.x, box.left), box.right);
  const nearY = Math.min(Math.max(circle.y, box.top), box.bottom);
  return Math.hypot(circle.x - nearX, circle.y - nearY) < circle.r;
}

function overlappingPairs(labels) {
  const boxes = labels.map((label) => label.box);
  let pairs = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j])) {
        pairs++;
      }
    }
  }
  return pairs;
}

// Every label the SVG shows right now, node labels tagged with their own node id.
function visibleLabels(element) {
  const root = element.shadowRoot;
  const nodeLabels = [...root.querySelectorAll("g.graph-node")]
    .map((group) => ({
      id: group.dataset.id,
      text: group.querySelector("text.node-label")
    }))
    .filter((entry) => entry.text)
    .map((entry) => ({
      id: entry.id,
      box: textBox(entry.text, NODE_CHAR, NODE_FONT)
    }));
  const categoryLabels = [...root.querySelectorAll("text.category-label")].map(
    (text) => ({ id: null, box: textBox(text, CATEGORY_CHAR, CATEGORY_FONT) })
  );
  return [...nodeLabels, ...categoryLabels];
}

function circles(element) {
  return [...element.shadowRoot.querySelectorAll("g.graph-node")].map(
    (group) => {
      const circle = group.querySelector("circle");
      return {
        id: group.dataset.id,
        x: num(circle, "cx"),
        y: num(circle, "cy"),
        r: num(circle, "r")
      };
    }
  );
}

// Node labels that cover another node's circle, and category labels that cover any circle.
function labelsOnOtherNodes(labels, nodes) {
  let hits = 0;
  labels.forEach((label) => {
    nodes.forEach((node) => {
      if (node.id !== label.id && boxHitsCircle(label.box, node)) {
        hits++;
      }
    });
  });
  return hits;
}

function labelsOutsideView(element, labels) {
  const [minX, minY, width, height] = element.shadowRoot
    .querySelector("svg.graph-svg")
    .getAttribute("viewBox")
    .split(" ")
    .map(Number);
  return labels.filter(
    ({ box }) =>
      box.left < minX ||
      box.right > minX + width ||
      box.top < minY ||
      box.bottom > minY + height
  ).length;
}

// Layout facts from the engine's own input and output. Only drawn nodes (skills, roles and
// projects) count as nodes. Every node the engine placed counts for the clamp.
function layoutFacts(call) {
  const options = call.args[3];
  const all = call.result.nodes;
  const placed = all.filter((node) => node.kind !== "category");
  let circleOverlaps = 0;
  let clusterGap = Infinity;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
      if (gap < 0) {
        circleOverlaps++;
      }
      if (a.kind === "skill" && b.kind === "skill" && a.group !== b.group) {
        clusterGap = Math.min(clusterGap, gap);
      }
    }
  }
  const onClamp = all.filter(
    (node) =>
      node.x - node.radius <= 0.5 ||
      node.x + node.radius >= options.width - 0.5 ||
      node.y - node.radius <= 0.5 ||
      node.y + node.radius >= options.height - 0.5
  ).length;
  return {
    nodes: placed.length,
    box: `${options.width}x${options.height}`,
    circleOverlaps,
    clusterGap: Math.round(clusterGap * 10) / 10,
    onClamp
  };
}

let lastCall;

async function measure() {
  const element = createElement("c-skill-network", { is: SkillNetwork });
  document.body.appendChild(element);
  graphql.emit({
    data: JSON.parse(JSON.stringify(PAYLOAD)),
    errors: undefined
  });
  await flushPromises();
  element.shadowRoot.querySelector('.view-button[data-view="graph"]').click();
  await flushPromises();

  const rest = visibleLabels(element);
  const nodes = circles(element);
  const result = {
    ...layoutFacts(lastCall),
    restLabels: rest.length,
    restLabelOverlaps: overlappingPairs(rest),
    restLabelsOnNodes: labelsOnOtherNodes(rest, nodes),
    labelsOutsideView: labelsOutsideView(element, rest),
    hoverOverlapsTotal: 0,
    hoverOverlapsMax: 0,
    hoverLabelsOnNodesTotal: 0
  };

  // Hover each node in turn. Its own label and its neighbours' labels appear.
  for (const group of [
    ...element.shadowRoot.querySelectorAll("g.graph-node")
  ]) {
    const id = group.dataset.id;
    element.shadowRoot
      .querySelector(`g.graph-node[data-id="${id}"]`)
      .dispatchEvent(new CustomEvent("mouseenter"));
    await flushPromises();
    const shown = visibleLabels(element);
    const overlaps = overlappingPairs(shown);
    result.hoverLabelsOnNodesTotal += labelsOnOtherNodes(shown, nodes);
    result.hoverOverlapsTotal += overlaps;
    result.hoverOverlapsMax = Math.max(result.hoverOverlapsMax, overlaps);
    element.shadowRoot
      .querySelector(`g.graph-node[data-id="${id}"]`)
      .dispatchEvent(new CustomEvent("mouseleave"));
    await flushPromises();
  }
  return result;
}

describe("c-skill-network graph spacing on production shaped data", () => {
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

  // Before Round 6 (960 by 680, charge -25, padding 2, category ring 0.25, no label nodes):
  // cluster gap 34.9, 28 labels on other nodes, 67 label overlaps over all hovers, 13 at worst.
  it("measures the layout the page draws", async () => {
    const result = await measure();

    expect(result).toEqual({
      nodes: 75,
      box: "960x840",
      circleOverlaps: 0,
      clusterGap: 65.8,
      onClamp: 0,
      restLabels: 28,
      restLabelOverlaps: 0,
      restLabelsOnNodes: 0,
      labelsOutsideView: 0,
      hoverOverlapsTotal: 9,
      hoverOverlapsMax: 1,
      hoverLabelsOnNodesTotal: 61
    });
  });
});
