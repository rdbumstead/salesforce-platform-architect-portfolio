/**
 * @description       : The site's graph engine (Round 5 plan M1). loadGraphEngine loads the D3_Library
 *                      static resource (d3-dispatch, d3-quadtree, d3-timer and d3-force) once per page and
 *                      hands every caller the same window.d3. layoutGraph runs a d3-force simulation to the
 *                      end in one synchronous call and returns positions, so consumers draw SVG from their
 *                      own templates and nothing animates (reading R5). Consumers: skillNetwork and
 *                      schemaVisualizer. Callers never load the engine on a phone or before a graph opens.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { loadScript } from "lightning/platformResourceLoader";
import D3_LIBRARY from "@salesforce/resourceUrl/D3_Library";

// One promise per page. Every component that asks for the engine shares it.
let enginePromise;

const DEFAULTS = Object.freeze({
  width: 800,
  height: 600,
  linkDistance: 60,
  charge: -30,
  anchorStrength: 0.1,
  padding: 2,
  radius: 5,
  ticks: 300
});

// The golden angle in radians, used to spread starting points on a spiral.
const GOLDEN_ANGLE = 2.399963;

function reasonOf(error) {
  if (!error) {
    return "unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  return error.message || error.type || String(error);
}

/**
 * Loads D3_Library once per page and resolves to the d3 namespace.
 * A failed load is not cached, so a later call can try again.
 * @param {LightningElement} component the calling component, passed to loadScript
 * @returns {Promise<object>} resolves to window.d3 (forceSimulation and friends)
 */
export function loadGraphEngine(component) {
  if (!enginePromise) {
    enginePromise = loadScript(component, D3_LIBRARY)
      .catch((error) => {
        throw new Error(`D3_Library failed to load: ${reasonOf(error)}`);
      })
      .then(() => {
        const d3 = window.d3;
        if (!d3 || typeof d3.forceSimulation !== "function") {
          throw new Error(
            "D3_Library loaded but no d3.forceSimulation was found"
          );
        }
        return d3;
      })
      .catch((error) => {
        enginePromise = undefined;
        throw error;
      });
  }
  return enginePromise;
}

function groupOf(node) {
  return node.group === undefined || node.group === null
    ? ""
    : String(node.group);
}

// Groups in the order they first appear, each given a point on a ring round the centre.
// A single group sits in the centre.
function ringAnchors(nodes, width, height) {
  const groups = [];
  nodes.forEach((node) => {
    const group = groupOf(node);
    if (!groups.includes(group)) {
      groups.push(group);
    }
  });
  const radius = groups.length > 1 ? Math.min(width, height) * 0.3 : 0;
  const anchors = {};
  groups.forEach((group, index) => {
    const angle = (2 * Math.PI * index) / groups.length - Math.PI / 2;
    anchors[group] = {
      x: width / 2 + radius * Math.cos(angle),
      y: height / 2 + radius * Math.sin(angle)
    };
  });
  return anchors;
}

// A fixed seed generator, so any jiggle d3 needs is the same on every run.
function seededRandom() {
  let state = 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  if (min > max) {
    return (min + max) / 2;
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Lays out a graph with d3-force and returns positions. Pure and synchronous: the inputs are
 * not changed, the simulation is stopped and then ticked a fixed number of times, and the same
 * input gives the same output.
 * @param {object} d3 the namespace from loadGraphEngine
 * @param {Array<object>} nodes each { id, group, radius, ...anything else, kept }. radius
 *   defaults to 5
 * @param {Array<object>} edges each { source, target, ...anything else, kept } where source and
 *   target are node ids. An edge whose ends are not both in nodes is left out of the result.
 * @param {object} [options] width and height (the box every node stays inside, default 800 by
 *   600), linkDistance (60), linkStrength (d3's default when absent), charge (forceManyBody
 *   strength, -30), anchors ({ [group]: { x, y } }, groups on a ring when absent),
 *   anchorStrength (a number or a function of the node, 0.1), padding (added to each radius
 *   for collision, 2), ticks (300)
 * @returns {{nodes: Array<object>, edges: Array<object>}} copies of the inputs in the same
 *   order, nodes with x and y, edges with x1, y1, x2 and y2
 */
export function layoutGraph(d3, nodes, edges, options = {}) {
  const inputNodes = Array.isArray(nodes) ? nodes : [];
  const inputEdges = Array.isArray(edges) ? edges : [];
  const width = numberOr(options.width, DEFAULTS.width);
  const height = numberOr(options.height, DEFAULTS.height);
  const padding = numberOr(options.padding, DEFAULTS.padding);
  const ticks = Math.max(
    0,
    Math.round(numberOr(options.ticks, DEFAULTS.ticks))
  );
  const anchors = options.anchors || ringAnchors(inputNodes, width, height);
  const centre = { x: width / 2, y: height / 2 };

  const simNodes = inputNodes.map((node, index) => {
    const anchor = anchors[groupOf(node)] || centre;
    const angle = index * GOLDEN_ANGLE;
    const spread = 4 * Math.sqrt(index + 1);
    // Each node starts on a small spiral round its own anchor, so groups begin apart.
    return {
      id: node.id,
      radius: numberOr(node.radius, DEFAULTS.radius),
      source: node,
      anchorX: anchor.x,
      anchorY: anchor.y,
      x: anchor.x + spread * Math.cos(angle),
      y: anchor.y + spread * Math.sin(angle)
    };
  });
  const byId = new Map(simNodes.map((node) => [node.id, node]));
  const keptEdges = inputEdges.filter(
    (edge) => edge && byId.has(edge.source) && byId.has(edge.target)
  );
  const links = keptEdges.map((edge) => ({
    source: edge.source,
    target: edge.target
  }));

  const strength = options.anchorStrength;
  const anchorStrength =
    typeof strength === "function"
      ? (node) => strength(node.source)
      : () => numberOr(strength, DEFAULTS.anchorStrength);

  const linkForce = d3
    .forceLink(links)
    .id((node) => node.id)
    .distance(numberOr(options.linkDistance, DEFAULTS.linkDistance));
  if (typeof options.linkStrength === "number") {
    linkForce.strength(options.linkStrength);
  }

  // stop() first, so d3's own timer never runs. The ticks below are the whole simulation.
  const simulation = d3.forceSimulation(simNodes).stop();
  if (typeof simulation.randomSource === "function") {
    simulation.randomSource(seededRandom());
  }
  simulation
    .force(
      "charge",
      d3.forceManyBody().strength(numberOr(options.charge, DEFAULTS.charge))
    )
    .force(
      "collide",
      d3.forceCollide((node) => node.radius + padding)
    )
    .force("link", linkForce)
    .force("x", d3.forceX((node) => node.anchorX).strength(anchorStrength))
    .force("y", d3.forceY((node) => node.anchorY).strength(anchorStrength));

  const keepInside = () => {
    simNodes.forEach((node) => {
      node.x = clamp(node.x, node.radius, width - node.radius);
      node.y = clamp(node.y, node.radius, height - node.radius);
    });
  };
  keepInside();
  for (let i = 0; i < ticks; i++) {
    simulation.tick();
    keepInside();
  }

  const outNodes = simNodes.map((simNode) => ({
    ...simNode.source,
    x: simNode.x,
    y: simNode.y
  }));
  const placed = new Map(outNodes.map((node) => [node.id, node]));
  const outEdges = keptEdges.map((edge) => {
    const from = placed.get(edge.source);
    const to = placed.get(edge.target);
    return { ...edge, x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  });
  return { nodes: outNodes, edges: outEdges };
}
