/**
 * @description       : The site's graph engine. loadGraphEngine loads the D3_Library
 *                      static resource (d3-force and its helpers, plus d3-selection, d3-drag and d3-zoom)
 *                      once per page and hands every caller the same window.d3.
 *                      layoutGraph runs a d3-force simulation to the end in one synchronous call and
 *                      returns positions, so consumers draw SVG from their own templates and nothing
 *                      animates. attachPanZoom and attachNodeDrag wire d3-zoom and d3-drag to
 *                      that SVG and report back through callbacks, so the template stays the only thing
 *                      that draws. attachPanZoom can also leave the plain wheel to the page, pan past
 *                      the drawn box at the resting scale and pan by a fixed step for arrow keys.
 *                      The fit is opt in, so a caller that passes nothing keeps the old view:
 *                      boundsOf and fitTransform work out the view that holds a drawing, fitTo
 *                      moves the view there, and a duration on a button move eases it with
 *                      d3-transition. Wheel, pinch and drag moves never ease.
 *                      Consumers: skillNetwork for the force layout, the fit and pan, zoom and
 *                      drag, schemaVisualizer for the force layout and boundsOf. Callers never
 *                      load the engine on a phone or before a graph opens.
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

/** Zoom limits and the factor one zoom in or zoom out step applies. */
export const ZOOM = Object.freeze({ min: 1, max: 4, step: 1.5 });

/**
 * The box that holds every given box, or null when none is finite.
 * @param {Array<object>} boxes each { left, top, right, bottom }
 * @param {number} [margin] added on every side, 0 by default
 * @returns {{left: number, top: number, right: number, bottom: number}|null} the union
 */
export function boundsOf(boxes, margin = 0) {
  let result = null;
  (Array.isArray(boxes) ? boxes : []).forEach((box) => {
    if (
      !box ||
      ![box.left, box.top, box.right, box.bottom].every(Number.isFinite)
    ) {
      return;
    }
    result = result
      ? {
          left: Math.min(result.left, box.left),
          top: Math.min(result.top, box.top),
          right: Math.max(result.right, box.right),
          bottom: Math.max(result.bottom, box.bottom)
        }
      : { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  });
  const pad = numberOr(margin, 0);
  return result
    ? {
        left: result.left - pad,
        top: result.top - pad,
        right: result.right + pad,
        bottom: result.bottom + pad
      }
    : null;
}

/**
 * The zoom transform that shows a box whole and centred in the visible extent. Pure.
 * @param {object} bounds { left, top, right, bottom } in the SVG's own units
 * @param {Array<Array<number>>} extent the visible box as [[x0, y0], [x1, y1]]
 * @param {object} [options] min and max (the scale limits, default ZOOM)
 * @returns {{x: number, y: number, k: number}} translate and scale, as d3-zoom applies them
 */
export function fitTransform(bounds, extent, options = {}) {
  const min = numberOr(options.min, ZOOM.min);
  const max = numberOr(options.max, ZOOM.max);
  if (!bounds || !Array.isArray(extent)) {
    return { x: 0, y: 0, k: 1 };
  }
  const [[x0, y0], [x1, y1]] = extent;
  const width = Math.max(bounds.right - bounds.left, 1);
  const height = Math.max(bounds.bottom - bounds.top, 1);
  const k = clamp(Math.min((x1 - x0) / width, (y1 - y0) / height), min, max);
  const centreX = (bounds.left + bounds.right) / 2;
  const centreY = (bounds.top + bounds.bottom) / 2;
  return {
    x: (x0 + x1) / 2 - centreX * k,
    y: (y0 + y1) / 2 - centreY * k,
    k
  };
}

/** The gesture name onGestureEnd reports for the event that started it. */
const GESTURES = Object.freeze({
  wheel: "wheel",
  mousedown: "mouse",
  touchstart: "touch"
});

/** The gesture name for a touch gesture that had two or more fingers down at any point. */
const PINCH = "pinch";

function touchCount(event) {
  return event && event.touches ? event.touches.length : 0;
}

function defaultZoomFilter(event) {
  return (!event.ctrlKey || event.type === "wheel") && !event.button;
}

// A wheel event's zoom amount as d3-zoom works it out (log2 of the scale change), capped so one
// notch of a mouse wheel never zooms more than one button step. A trackpad pinch sends many small
// wheel events with ctrlKey set, which stay under the cap.
function cappedWheelDelta(step) {
  const cap = Math.log2(step);
  return (event) => {
    const unit = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002;
    const delta = -event.deltaY * unit * (event.ctrlKey ? 10 : 1);
    return Math.max(-cap, Math.min(cap, delta));
  };
}

/**
 * Wires d3-zoom to an SVG element for wheel, pinch and drag panning, and returns controls for
 * buttons and keys. The transform is never written to the DOM here: onZoom receives it and the
 * caller draws it from its own template.
 * @param {object} d3 the namespace from loadGraphEngine
 * @param {SVGElement} svg the element that receives the pointer events
 * @param {object} options onZoom (called with each d3 ZoomTransform, required), extent (the
 *   visible box as [[x0, y0], [x1, y1]] in the SVG's own units, also the pan limit unless
 *   translateExtent is given), translateExtent (the pan limit, a box larger than extent lets the
 *   view pan at the resting scale), ctrlWheel (true: a plain wheel scrolls the page and only a
 *   wheel with Ctrl held, which is also how a trackpad pinch arrives, zooms, one step at most per
 *   event), onGestureEnd (called with "wheel", "mouse", "touch" or "pinch" when a pointer gesture
 *   ends, once per gesture. "pinch" is a touch gesture that had two or more fingers down at any
 *   point, also when the second finger joined after the first had started to pan),
 *   min, max and step (default ZOOM), rest (the resting scale, default min: one finger on a
 *   touch screen pans the graph only above it, so a caller that rests above min still leaves
 *   one finger to the page)
 * @returns {object|undefined} { zoomIn, zoomOut, reset, fitTo, panBy, scale, detach }, or
 *   undefined when the loaded library has no d3-zoom (an older cached copy), so callers simply
 *   hide their controls. panBy(dx, dy) moves the view by that many SVG units on screen at any
 *   scale. fitTo({ x, y, k }) moves the view to that transform. zoomIn, zoomOut, reset and
 *   fitTo take an optional duration in ms, and ease over it when d3-transition is loaded. With
 *   no duration, or 0, they move at once.
 */
export function attachPanZoom(d3, svg, options = {}) {
  if (
    !d3 ||
    !svg ||
    typeof d3.zoom !== "function" ||
    typeof d3.select !== "function" ||
    typeof options.onZoom !== "function"
  ) {
    return undefined;
  }
  const min = numberOr(options.min, ZOOM.min);
  const max = numberOr(options.max, ZOOM.max);
  const step = numberOr(options.step, ZOOM.step);
  const rest = numberOr(options.rest, min);
  const ctrlWheel = options.ctrlWheel === true;
  const selection = d3.select(svg);
  // The pointer gesture in progress, named as onGestureEnd reports it.
  let gesture;
  const behaviour = d3
    .zoom()
    .scaleExtent([min, max])
    // One finger at the resting scale scrolls the page, so a tablet visitor is never trapped.
    // Two fingers, or any touch once zoomed in, pan and zoom.
    .filter((event) => {
      if (event.type === "touchstart") {
        return event.touches.length > 1 || d3.zoomTransform(svg).k > rest;
      }
      if (ctrlWheel && event.type === "wheel") {
        // Turned down here, the wheel event is never cancelled, so the page scrolls.
        return event.ctrlKey === true;
      }
      return defaultZoomFilter(event);
    })
    .on("zoom", (event) => {
      // A second finger can join a one finger pan, so a touch gesture becomes a pinch here too.
      if (
        gesture === GESTURES.touchstart &&
        touchCount(event.sourceEvent) > 1
      ) {
        gesture = PINCH;
      }
      options.onZoom(event.transform);
    });
  if (ctrlWheel) {
    behaviour.wheelDelta(cappedWheelDelta(step));
  }
  if (options.extent) {
    behaviour
      .extent(options.extent)
      .translateExtent(options.translateExtent || options.extent);
  }
  if (typeof options.onGestureEnd === "function") {
    // A button or key move has no source event, so only pointer gestures are reported.
    behaviour
      .on("start", (event) => {
        const type = event.sourceEvent && event.sourceEvent.type;
        gesture = type ? GESTURES[type] : undefined;
        if (
          gesture === GESTURES.touchstart &&
          touchCount(event.sourceEvent) > 1
        ) {
          gesture = PINCH;
        }
      })
      .on("end", () => {
        if (gesture) {
          options.onGestureEnd(gesture);
        }
        gesture = undefined;
      });
  }
  // A double click selects a node twice, so it never zooms.
  selection.call(behaviour).on("dblclick.zoom", null);
  // A button move eases over the duration when one is given and d3-transition is loaded.
  const mover = (duration) =>
    numberOr(duration, 0) > 0 && typeof selection.transition === "function"
      ? selection.interrupt().transition().duration(duration)
      : selection;
  return {
    zoomIn: (duration) => mover(duration).call(behaviour.scaleBy, step),
    zoomOut: (duration) => mover(duration).call(behaviour.scaleBy, 1 / step),
    reset: (duration) =>
      mover(duration).call(behaviour.transform, d3.zoomIdentity),
    fitTo: (transform, duration) => {
      if (
        !transform ||
        ![transform.x, transform.y, transform.k].every(Number.isFinite)
      ) {
        return;
      }
      mover(duration).call(
        behaviour.transform,
        d3.zoomIdentity
          .translate(transform.x, transform.y)
          .scale(clamp(transform.k, min, max))
      );
    },
    // translateBy moves by its arguments times the scale, so divide to move a fixed distance.
    panBy: (dx, dy) => {
      const k = d3.zoomTransform(svg).k || 1;
      selection.call(behaviour.translateBy, dx / k, dy / k);
    },
    scale: () => d3.zoomTransform(svg).k,
    detach: () => selection.on(".zoom", null)
  };
}

/**
 * Wires d3-drag to node elements. Each element names its node in a data-id attribute. The
 * pointer is read in the coordinates of the element's parent, so a drag inside a zoomed group
 * reports positions in layout units.
 * @param {object} d3 the namespace from loadGraphEngine
 * @param {NodeList|Array<Element>} elements the node elements
 * @param {object} options position(id) returns the node's current { x, y } or nothing,
 *   onDrag(id, x, y) is called on every move (both required), onEnd(id) when the drag ends
 * @returns {boolean} false when the loaded library has no d3-drag, true otherwise
 */
export function attachNodeDrag(d3, elements, options = {}) {
  if (
    !d3 ||
    typeof d3.drag !== "function" ||
    typeof d3.selectAll !== "function" ||
    typeof options.position !== "function" ||
    typeof options.onDrag !== "function"
  ) {
    return false;
  }
  const behaviour = d3
    .drag()
    // A press that moves less than this is still a click, which selects the node.
    .clickDistance(4)
    .subject(function subject() {
      const id = this.getAttribute("data-id");
      const point = id ? options.position(id) : undefined;
      return point ? { id, x: point.x, y: point.y } : null;
    })
    .on("drag", (event) => options.onDrag(event.subject.id, event.x, event.y));
  if (typeof options.onEnd === "function") {
    behaviour.on("end", (event) => options.onEnd(event.subject.id));
  }
  d3.selectAll(elements).call(behaviour);
  return true;
}
