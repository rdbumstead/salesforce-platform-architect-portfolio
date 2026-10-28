/**
 * @description       : Live ERD. Reads SchemaService for one
 *                      scope, or for just the objects named in the objects property, lays the objects out with the site graph engine and draws them as SVG from
 *                      this template. The engine loads only on desktop and tablet, and only once the
 *                      component is on screen. Phones and narrow viewports get the object list as the
 *                      visible view and never request the engine. The list mirrors every node and edge
 *                      in every mode (SAS App. G shadow structure), apart from the platform self
 *                      lookups MasterRecordId and ParentId, which say nothing about the design. The
 *                      view box is fitted to the drawn boxes, so the canvas has no empty band.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/26/2025
 **/
import { LightningElement, api, wire } from "lwc";
import FORM_FACTOR from "@salesforce/client/formFactor";
import getSchemaGraph from "@salesforce/apex/SchemaService.getSchemaGraph";
import getObjectGraph from "@salesforce/apex/SchemaService.getObjectGraph";
import { boundsOf, loadGraphEngine, layoutGraph } from "c/graphEngine";
import { trackEvent, EVENTS } from "c/analyticsService";

export const SCOPES = Object.freeze([
  { value: "employerHub", label: "Employer Hub" },
  { value: "portfolio", label: "Portfolio" }
]);
const DEFAULT_SCOPE = "employerHub";
const NARROW_VIEWPORT_QUERY = "(max-width: 767px)";
const KIND_MASTER_DETAIL = "masterDetail";

// Diagram geometry, in viewBox units. The SVG scales to its container.
export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 720;
const NODE_WIDTH = 156;
const NODE_HEIGHT = 48;
// The boxes are about three times wider than they are tall, and the engine keeps round nodes
// apart. So the layout runs in a space squeezed sideways by LAYOUT_STRETCH and is stretched
// back afterwards: each round node becomes an oval that fits a box with room to spare. The
// radius keeps every box inside the view, the padding sets the space between boxes. Tuned on
// both production scopes (layoutSpacing.test.js measures it).
const LAYOUT_STRETCH = 2.2;
const LAYOUT_RADIUS = 40;
const LAYOUT_PADDING = 16;
const LABEL_MAX = 20;
const DOT_RADIUS = 5;
// Space kept round the drawn boxes when the view box is fitted to them, and the narrowest
// fitted view box, so a small diagram is not drawn more than a quarter larger than before.
const FIT_MARGIN = 24;
const MIN_FIT_WIDTH = 768;
// Platform self lookups on standard objects, left out of the list.
const PLATFORM_SELF_LOOKUPS = Object.freeze(["MasterRecordId", "ParentId"]);

function isPlatformSelfLookup(edge) {
  return (
    edge.fromObject === edge.toObject &&
    PLATFORM_SELF_LOOKUPS.includes(edge.field)
  );
}

function isScope(value) {
  return SCOPES.some((scope) => scope.value === value);
}

/**
 * Turns the objects property into a clean list of API names. It takes a comma separated
 * string or an array. Blanks and repeats are dropped and the order is kept.
 * @param {string|string[]} value the property value
 * @returns {string[]} the API names, empty when there are none
 */
export function parseObjectNames(value) {
  let parts = [];
  if (Array.isArray(value)) {
    parts = value;
  } else if (typeof value === "string") {
    parts = value.split(",");
  }
  const names = [];
  parts.forEach((part) => {
    const name = typeof part === "string" ? part.trim() : "";
    if (name && !names.includes(name)) {
      names.push(name);
    }
  });
  return names;
}

function shorten(text) {
  const value = text || "";
  return value.length > LABEL_MAX ? `${value.slice(0, LABEL_MAX - 1)}…` : value;
}

// Where the line from a box centre towards (dx, dy) leaves the box.
function boxEdge(x, y, dx, dy) {
  const scaleX = dx === 0 ? Infinity : NODE_WIDTH / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : NODE_HEIGHT / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  if (!Number.isFinite(scale)) {
    return { x, y };
  }
  return { x: x + dx * scale, y: y + dy * scale };
}

/**
 * Names an object for a heading or a list line: its label, with the API name in brackets only
 * when the two differ, so a standard object such as Account does not read "Account (Account)".
 * @param {{label: string, apiName: string}} node the schema node
 * @returns {string} the name to show
 */
function objectName(node) {
  return node.label === node.apiName
    ? node.label
    : `${node.label} (${node.apiName})`;
}

function kindLabel(kind) {
  return kind === KIND_MASTER_DETAIL ? "master-detail" : "lookup";
}

export default class SchemaVisualizer extends LightningElement {
  activeScope = DEFAULT_SCOPE;
  graph;
  isLoading = true;
  errorMessage;
  engineErrorMessage;
  selectedApiName;
  diagram;
  isSmall = false;

  scopeValue = DEFAULT_SCOPE;
  objectList = [];
  d3;
  observer;
  watchedContainer;
  engineRequested = false;
  disconnected = false;

  /** ERD scope, employerHub (default) or portfolio. Anything else falls back to the default. */
  @api
  get scope() {
    return this.scopeValue;
  }
  set scope(value) {
    this.scopeValue = isScope(value) ? value : DEFAULT_SCOPE;
    this.activeScope = this.scopeValue;
  }

  /**
   * API names of the objects to draw, as a comma separated string or an array. With at least
   * one name the component draws just those objects and hides the scope toggle. Empty means
   * the whole scope, as before.
   */
  @api
  get objects() {
    return this.objectList.join(",");
  }
  set objects(value) {
    const next = parseObjectNames(value);
    if (next.join(",") === this.objectList.join(",")) {
      return;
    }
    this.objectList = next;
    this.selectedApiName = undefined;
    this.graph = undefined;
    this.diagram = undefined;
    this.errorMessage = undefined;
    this.isLoading = true;
  }

  connectedCallback() {
    this.disconnected = false;
    this.isSmall = FORM_FACTOR === "Small" || this.isNarrowViewport();
  }

  disconnectedCallback() {
    this.disconnected = true;
    this.stopWatching();
    this.engineRequested = false;
  }

  stopWatching() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
    this.watchedContainer = undefined;
  }

  get hasObjects() {
    return this.objectList.length > 0;
  }

  // A wire whose parameter is undefined does not fire, so exactly one of these two is set.
  get scopeParam() {
    return this.hasObjects ? undefined : this.activeScope;
  }

  get objectsParam() {
    return this.hasObjects ? this.objectList : undefined;
  }

  get showScopeToggle() {
    return !this.hasObjects;
  }

  get title() {
    return this.hasObjects ? "Data model for this section" : "Data model, live";
  }

  get emptyMessage() {
    return this.hasObjects
      ? "No objects to show for this section."
      : "No objects to show for this scope.";
  }

  isNarrowViewport() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia(NARROW_VIEWPORT_QUERY).matches
    );
  }

  @wire(getSchemaGraph, { scope: "$scopeParam" })
  wiredGraph(result) {
    this.receiveGraph(result);
  }

  @wire(getObjectGraph, { objectNames: "$objectsParam" })
  wiredObjectGraph(result) {
    this.receiveGraph(result);
  }

  receiveGraph({ data, error }) {
    if (error) {
      this.isLoading = false;
      this.graph = undefined;
      this.diagram = undefined;
      this.errorMessage = "The data model could not be loaded.";
      return;
    }
    if (!data) {
      return;
    }
    this.graph = data;
    this.errorMessage = undefined;
    this.isLoading = false;
    this.diagram = undefined;
    this.drawDiagram();
  }

  renderedCallback() {
    if (!this.showDiagram || this.engineRequested) {
      return;
    }
    const container = this.template.querySelector(".diagram");
    // The container is rebuilt when the graph reloads, so a watch on a removed one is replaced.
    if (container && container !== this.watchedContainer) {
      this.stopWatching();
      this.watchedContainer = container;
      this.whenVisible(container, () => {
        this.engineRequested = true;
        this.startEngine();
      });
    }
  }

  // Waits until the diagram is in view, so the engine never competes with the page's first
  // paint. A diagram that is already on screen, as in a dialog that has just opened, starts
  // at once because the observer reports it on its first look. Without IntersectionObserver
  // it starts after the first render.
  whenVisible(container, callback) {
    if (typeof window.IntersectionObserver !== "function") {
      callback();
      return;
    }
    this.observer = new window.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        this.observer.disconnect();
        this.observer = undefined;
        callback();
      }
    });
    this.observer.observe(container);
  }

  startEngine() {
    return loadGraphEngine(this)
      .then((d3) => {
        if (this.disconnected) {
          return;
        }
        this.d3 = d3;
        this.drawDiagram();
      })
      .catch(() => {
        this.engineErrorMessage =
          "The diagram could not load, so the object list is shown instead.";
      });
  }

  drawDiagram() {
    if (!this.d3 || !this.graph) {
      return;
    }
    const nodes = this.nodes.map((node) => ({
      id: node.apiName,
      group: node.isCustom ? "custom" : "standard",
      radius: LAYOUT_RADIUS
    }));
    // A self reference (Account.ParentId) has no length to draw. It stays in the list.
    const edges = this.edges
      .filter((edge) => edge.fromObject !== edge.toObject)
      .map((edge) => ({
        source: edge.fromObject,
        target: edge.toObject,
        kind: edge.kind,
        field: edge.field
      }));
    try {
      const squeezed = layoutGraph(this.d3, nodes, edges, {
        width: VIEW_WIDTH / LAYOUT_STRETCH,
        height: VIEW_HEIGHT,
        linkDistance: 140,
        charge: -450,
        anchorStrength: 0.1,
        padding: LAYOUT_PADDING
      });
      this.diagram = {
        nodes: squeezed.nodes.map((node) => ({
          ...node,
          x: node.x * LAYOUT_STRETCH
        })),
        edges: squeezed.edges.map((edge) => ({
          ...edge,
          x1: edge.x1 * LAYOUT_STRETCH,
          x2: edge.x2 * LAYOUT_STRETCH
        }))
      };
    } catch {
      this.engineErrorMessage =
        "The diagram could not be drawn, so the object list is shown instead.";
    }
  }

  get scopeButtons() {
    return SCOPES.map((scope) => {
      const pressed = scope.value === this.activeScope;
      return {
        ...scope,
        pressed: pressed ? "true" : "false",
        className: pressed ? "scope-button scope-button_on" : "scope-button"
      };
    });
  }

  handleScopeClick(event) {
    const scope = event.currentTarget.dataset.scope;
    if (!isScope(scope) || scope === this.activeScope) {
      return;
    }
    this.activeScope = scope;
    this.selectedApiName = undefined;
    this.diagram = undefined;
    this.isLoading = true;
    trackEvent(EVENTS.ERD_SCOPE_CHANGED, { scope });
  }

  handleNodeClick(event) {
    this.selectNode(event.currentTarget.dataset.api);
  }

  handleNodeKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.selectNode(event.currentTarget.dataset.api);
    }
  }

  selectNode(apiName) {
    if (!apiName) {
      return;
    }
    this.selectedApiName = apiName;
    trackEvent(EVENTS.ERD_NODE_SELECTED, { object: apiName });
  }

  handleClosePanel() {
    this.selectedApiName = undefined;
  }

  get nodes() {
    return this.graph && Array.isArray(this.graph.nodes)
      ? this.graph.nodes
      : [];
  }

  get edges() {
    return this.graph && Array.isArray(this.graph.edges)
      ? this.graph.edges
      : [];
  }

  get hasNodes() {
    return this.nodes.length > 0;
  }

  get hasError() {
    return !this.isLoading && Boolean(this.errorMessage);
  }

  get isEmpty() {
    return !this.isLoading && !this.errorMessage && !this.hasNodes;
  }

  get showContent() {
    return !this.isLoading && !this.errorMessage && this.hasNodes;
  }

  get showDiagram() {
    return this.showContent && !this.isSmall && !this.engineErrorMessage;
  }

  get diagramReady() {
    return Boolean(this.diagram);
  }

  get listClass() {
    return this.showDiagram
      ? "object-list object-list_assistive"
      : "object-list";
  }

  get caption() {
    if (!this.graph) {
      return "";
    }
    const count = this.graph.objectCount ?? this.nodes.length;
    const objectWord = count === 1 ? "object" : "objects";
    const summary = `${count} ${objectWord}, described in ${this.graph.cpuMs} ms of server CPU`;
    return this.hasObjects
      ? `The objects this section reads. ${summary}`
      : summary;
  }

  // The drawn boxes plus a margin, so the diagram fills its canvas. The layout box is the
  // fallback before anything is drawn.
  get viewBox() {
    const bounds = boundsOf(
      this.svgNodes.map((node) => ({
        left: node.x,
        top: node.y,
        right: node.x + node.width,
        bottom: node.y + node.height
      })),
      FIT_MARGIN
    );
    if (!bounds) {
      return `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`;
    }
    const round = (value) => Math.round(value * 10) / 10;
    const width = Math.max(bounds.right - bounds.left, MIN_FIT_WIDTH);
    const left = (bounds.left + bounds.right) / 2 - width / 2;
    return [
      round(left),
      round(bounds.top),
      round(width),
      round(bounds.bottom - bounds.top)
    ].join(" ");
  }

  get diagramLabel() {
    return `Entity relationship diagram: ${this.caption}. The object list holds the same objects and relationships.`;
  }

  get svgNodes() {
    if (!this.diagram) {
      return [];
    }
    const byName = new Map(this.nodes.map((node) => [node.apiName, node]));
    return this.diagram.nodes.map((placed) => {
      const node = byName.get(placed.id) || {};
      const selected = placed.id === this.selectedApiName;
      return {
        key: placed.id,
        apiName: placed.id,
        x: placed.x - NODE_WIDTH / 2,
        y: placed.y - NODE_HEIGHT / 2,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        labelX: placed.x,
        labelY: placed.y - 3,
        countY: placed.y + 15,
        label: shorten(node.label),
        count: `${node.fieldCount} fields`,
        ariaLabel: `${node.label}, ${node.fieldCount} fields. Show fields.`,
        pressed: selected ? "true" : "false",
        className: [
          "node",
          node.isCustom ? "node_custom" : "node_standard",
          selected ? "node_selected" : ""
        ]
          .join(" ")
          .trim()
      };
    });
  }

  get svgEdges() {
    if (!this.diagram) {
      return [];
    }
    return this.diagram.edges.map((edge, index) => {
      const dx = edge.x2 - edge.x1;
      const dy = edge.y2 - edge.y1;
      const start = boxEdge(edge.x1, edge.y1, dx, dy);
      const end = boxEdge(edge.x2, edge.y2, -dx, -dy);
      const masterDetail = edge.kind === KIND_MASTER_DETAIL;
      return {
        key: `${edge.source}.${edge.field}.${index}`,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        isMasterDetail: masterDetail,
        dotRadius: DOT_RADIUS,
        className: masterDetail ? "edge edge_master" : "edge edge_lookup"
      };
    });
  }

  // One entry per object, each naming the reference fields it holds, so every node and
  // every edge appears exactly once, apart from the platform self lookups.
  get listItems() {
    const edgesByObject = new Map();
    this.edges.forEach((edge, index) => {
      if (isPlatformSelfLookup(edge)) {
        return;
      }
      if (!edgesByObject.has(edge.fromObject)) {
        edgesByObject.set(edge.fromObject, []);
      }
      edgesByObject.get(edge.fromObject).push({
        key: `${edge.fromObject}.${edge.field}.${index}`,
        text: `${edge.field}: ${kindLabel(edge.kind)} to ${edge.toObject}`
      });
    });
    return this.nodes.map((node) => {
      const relationships = edgesByObject.get(node.apiName) || [];
      return {
        key: node.apiName,
        apiName: node.apiName,
        text: `${objectName(node)}, ${node.fieldCount} fields`,
        buttonLabel: `Show fields of ${node.label}`,
        relationships,
        hasRelationships: relationships.length > 0
      };
    });
  }

  get selectedNode() {
    return this.selectedApiName
      ? this.nodes.find((node) => node.apiName === this.selectedApiName)
      : undefined;
  }

  get hasSelection() {
    return Boolean(this.selectedNode);
  }

  get panelHeading() {
    const node = this.selectedNode;
    return node ? objectName(node) : "";
  }

  get selectedFields() {
    const node = this.selectedNode;
    if (!node || !Array.isArray(node.fields)) {
      return [];
    }
    return node.fields.map((field) => ({
      key: field.apiName,
      apiName: field.apiName,
      label: field.label,
      type: field.isRequired ? `${field.type}, required` : field.type,
      references:
        Array.isArray(field.referenceTo) && field.referenceTo.length
          ? field.referenceTo.join(", ")
          : ""
    }));
  }
}
