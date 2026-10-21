/**
 * @description       : Skill network. Skills, projects and experiences are nodes, Project_Skill__c and
 *                      Experience_Skill__c rows are edges, read through the UI API GraphQL wire adapter.
 *                      Large and Medium form factors draw an animated AntV G6 graph once the component is visible.
 *                      Small form factors and narrow viewports draw a static inline SVG and never load G6 (ADR-020).
 *                      Both modes render a visually hidden list of every node and its connections.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
// The Round 3 plan (K5, WS4 scope) pins lightning/uiGraphQLApi. The lint rule prefers
// lightning/graphql, a move left to the orchestrator (log entry for WS4).
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { gql, graphql } from "lightning/uiGraphQLApi";
import FORM_FACTOR from "@salesforce/client/formFactor";
import { loadG6 } from "c/g6Loader";

// Reads only the fields the guest permission set grants (Round 3 plan K4 and K5).
const SKILL_NETWORK_QUERY = gql`
  query SkillNetworkGraph {
    uiapi {
      query {
        Skill__c(first: 200) {
          edges {
            node {
              Id
              Name {
                value
              }
              Category__c {
                value
              }
              Display_Name__c {
                value
              }
              Proficiency__c {
                value
              }
              Color_Hex__c {
                value
              }
            }
          }
        }
        Project_Skill__c(first: 200) {
          edges {
            node {
              Id
              Project__c {
                value
              }
              Skill__c {
                value
              }
              Project__r {
                Name {
                  value
                }
              }
            }
          }
        }
        Experience_Skill__c(first: 200) {
          edges {
            node {
              Id
              Experience__c {
                value
              }
              Skill__c {
                value
              }
              Experience__r {
                Name {
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;

const NARROW_VIEWPORT_QUERY = "(max-width: 767px)";
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Canvas drawing needs concrete colours, so these live here and not in CSS.
const CATEGORY_COLORS = {
  Frontend: "#0176d3",
  Backend: "#2e844a",
  Cloud: "#0b827c",
  Integration: "#8a033e",
  AI: "#7f3fbf",
  DevOps: "#a96404",
  Data: "#3a49da",
  "Soft Skill": "#5c5c5c"
};
const DEFAULT_SKILL_COLOR = "#747474";
const KIND_COLORS = { project: "#ba0517", experience: "#032d60" };
const KIND_LABELS = {
  skill: "Skill",
  project: "Project",
  experience: "Experience"
};

// Static SVG geometry for the Small form factor.
const SVG_WIDTH = 390;
const SVG_ROW = 22;
const SVG_PAD = 20;
const SKILL_X = 150;
const WORK_X = 240;
const LABEL_GAP = 12;
const LABEL_MAX = 22;

function fieldValue(record, field) {
  return record && record[field] ? record[field].value : null;
}

function rowsOf(data, objectName) {
  const connection = data?.uiapi?.query?.[objectName];
  return connection && Array.isArray(connection.edges)
    ? connection.edges.map((edge) => edge.node).filter(Boolean)
    : [];
}

function skillColor(hex, category) {
  if (hex && HEX_COLOR.test(hex)) {
    return hex;
  }
  return CATEGORY_COLORS[category] || DEFAULT_SKILL_COLOR;
}

function shorten(text) {
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text;
}

// Turns the GraphQL payload into nodes and edges. A junction row whose skill is not
// in the skill result is dropped, so every edge has both ends.
function buildNetwork(data) {
  const nodes = [];
  const byId = new Map();

  rowsOf(data, "Skill__c").forEach((row) => {
    const category = fieldValue(row, "Category__c");
    const node = {
      id: row.Id,
      kind: "skill",
      label:
        fieldValue(row, "Display_Name__c") ||
        fieldValue(row, "Name") ||
        "Unnamed skill",
      proficiency: Number(fieldValue(row, "Proficiency__c")) || 0,
      color: skillColor(fieldValue(row, "Color_Hex__c"), category)
    };
    nodes.push(node);
    byId.set(node.id, node);
  });

  const edges = [];
  const addWork = (rows, kind, idField, relationship) => {
    rows.forEach((row) => {
      const skillId = fieldValue(row, "Skill__c");
      const workId = fieldValue(row, idField);
      if (!skillId || !workId || !byId.has(skillId)) {
        return;
      }
      if (!byId.has(workId)) {
        const workNode = {
          id: workId,
          kind,
          label: fieldValue(row[relationship], "Name") || KIND_LABELS[kind],
          color: KIND_COLORS[kind]
        };
        nodes.push(workNode);
        byId.set(workId, workNode);
      }
      edges.push({ id: row.Id, source: skillId, target: workId });
    });
  };
  addWork(
    rowsOf(data, "Project_Skill__c"),
    "project",
    "Project__c",
    "Project__r"
  );
  addWork(
    rowsOf(data, "Experience_Skill__c"),
    "experience",
    "Experience__c",
    "Experience__r"
  );

  return { nodes, edges };
}

export default class SkillNetwork extends LightningElement {
  nodes = [];
  edges = [];
  accessibleNodes = [];
  svgModel;
  isLoading = true;
  errorMessage;
  graphErrorMessage;
  isPaused = false;
  graphReady = false;
  isSmall = false;

  graph;
  observer;
  visibilityWatched = false;
  disconnected = false;

  connectedCallback() {
    this.disconnected = false;
    this.isSmall = FORM_FACTOR === "Small" || this.isNarrowViewport();
  }

  disconnectedCallback() {
    this.disconnected = true;
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
    if (this.graph) {
      this.graph.destroy();
      this.graph = undefined;
    }
    // A component put back on the page draws a fresh graph.
    this.visibilityWatched = false;
    this.graphReady = false;
  }

  isNarrowViewport() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia(NARROW_VIEWPORT_QUERY).matches
    );
  }

  @wire(graphql, { query: SKILL_NETWORK_QUERY })
  wiredNetwork({ data, errors }) {
    if (errors && errors.length) {
      this.isLoading = false;
      this.errorMessage =
        errors
          .map((error) => error && error.message)
          .filter(Boolean)
          .join(" ") || "The skill network could not be loaded.";
      return;
    }
    if (!data) {
      return;
    }
    const network = buildNetwork(data);
    this.nodes = network.nodes;
    this.edges = network.edges;
    this.accessibleNodes = this.buildAccessibleNodes();
    this.svgModel = this.buildSvgModel();
    this.errorMessage = undefined;
    this.isLoading = false;
    if (this.graph) {
      this.graph.changeData(this.graphData);
    }
  }

  renderedCallback() {
    if (this.showCanvas && !this.visibilityWatched) {
      this.visibilityWatched = true;
      this.whenVisible(() => this.startGraph());
    }
  }

  // Waits until the graph container scrolls into view, so the 1.57 MB library
  // never competes with the page's first paint. Without IntersectionObserver it
  // starts straight after the first render.
  whenVisible(callback) {
    const container = this.template.querySelector(".graph-container");
    if (!container || typeof window.IntersectionObserver !== "function") {
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

  startGraph() {
    return loadG6(this)
      .then((G6) => {
        if (!this.disconnected) {
          this.drawGraph(G6);
        }
      })
      .catch((error) => {
        const reason = error && error.message ? ` ${error.message}` : "";
        this.graphErrorMessage = `The interactive graph could not load, so a static view is shown.${reason}`;
      });
  }

  drawGraph(G6) {
    const container = this.template.querySelector(".graph-container");
    if (!container) {
      return;
    }
    this.graph = new G6.Graph({
      container,
      width: container.clientWidth || 800,
      height: container.clientHeight || 500,
      fitView: true,
      layout: {
        type: "force",
        preventOverlap: true,
        linkDistance: 110,
        nodeStrength: -30
      },
      modes: { default: ["drag-canvas", "zoom-canvas", "drag-node"] },
      defaultNode: {
        labelCfg: { position: "bottom", style: { fontSize: 11 } }
      },
      defaultEdge: { style: { stroke: "#c9c9c9", lineWidth: 1 } }
    });
    this.graph.data(this.graphData);
    this.graph.render();
    this.graphReady = true;
    this.isPaused = false;
  }

  get graphData() {
    return {
      nodes: this.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        type: node.kind === "experience" ? "rect" : "circle",
        size: node.kind === "skill" ? 14 + node.proficiency * 4 : 26,
        style: { fill: node.color, stroke: "#ffffff", lineWidth: 1 }
      })),
      edges: this.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target
      }))
    };
  }

  // G6 4.x keeps its running layouts on the layout controller. Each force layout
  // has a stop() that halts the simulation where it is.
  stopLayout() {
    const controller = this.graph.get("layoutController");
    const methods = (controller && controller.layoutMethods) || [];
    methods.forEach((method) => {
      if (method && typeof method.stop === "function") {
        method.stop();
      }
    });
  }

  handlePauseToggle() {
    if (!this.graph) {
      return;
    }
    if (this.isPaused) {
      this.graph.layout();
      this.isPaused = false;
    } else {
      this.stopLayout();
      this.isPaused = true;
    }
  }

  handleReset() {
    if (!this.graph) {
      return;
    }
    this.graph.layout();
    this.isPaused = false;
  }

  get hasError() {
    return !this.isLoading && Boolean(this.errorMessage);
  }

  get hasNodes() {
    return this.nodes.length > 0;
  }

  get isEmpty() {
    return !this.isLoading && !this.errorMessage && !this.hasNodes;
  }

  get showGraph() {
    return !this.isLoading && !this.errorMessage && this.hasNodes;
  }

  get showCanvas() {
    return this.showGraph && !this.isSmall && !this.graphErrorMessage;
  }

  get showSvg() {
    return this.showGraph && (this.isSmall || Boolean(this.graphErrorMessage));
  }

  get controlsDisabled() {
    return !this.graphReady;
  }

  get pauseIcon() {
    return this.isPaused ? "utility:play" : "utility:pause";
  }

  get pauseLabel() {
    return this.isPaused ? "Resume layout animation" : "Pause layout animation";
  }

  get summary() {
    const nodeWord = this.nodes.length === 1 ? "item" : "items";
    const edgeWord = this.edges.length === 1 ? "connection" : "connections";
    return `${this.nodes.length} ${nodeWord} and ${this.edges.length} ${edgeWord}.`;
  }

  // One entry per node for screen readers, naming every node it connects to.
  buildAccessibleNodes() {
    const labels = new Map(this.nodes.map((node) => [node.id, node.label]));
    const links = new Map(this.nodes.map((node) => [node.id, []]));
    this.edges.forEach((edge) => {
      links.get(edge.source).push(labels.get(edge.target));
      links.get(edge.target).push(labels.get(edge.source));
    });
    return this.nodes.map((node) => {
      const connected = links.get(node.id);
      const kind = KIND_LABELS[node.kind];
      const text = connected.length
        ? `${node.label}, ${kind}. Connected to ${connected.join(", ")}.`
        : `${node.label}, ${kind}. No connections.`;
      return { id: node.id, text, connectionCount: connected.length };
    });
  }

  // Two column layout for the static SVG: skills on the left, projects and
  // experiences on the right, one line per junction row.
  buildSvgModel() {
    const skills = this.nodes.filter((node) => node.kind === "skill");
    const work = this.nodes.filter((node) => node.kind !== "skill");
    const rows = Math.max(skills.length, work.length, 1);
    const height = SVG_PAD * 2 + (rows - 1) * SVG_ROW;
    const position = new Map();

    const place = (list, x) =>
      list.map((node, index) => {
        const y =
          list.length > 1
            ? SVG_PAD + (index * (rows - 1) * SVG_ROW) / (list.length - 1)
            : SVG_PAD + ((rows - 1) * SVG_ROW) / 2;
        position.set(node.id, { x, y });
        return { node, x, y };
      });

    const skillPoints = place(skills, SKILL_X).map(({ node, x, y }) => ({
      key: node.id,
      cx: x,
      cy: y,
      r: 4 + Math.min(Math.max(node.proficiency, 0), 5),
      fill: node.color,
      labelX: x - LABEL_GAP,
      labelY: y + 4,
      label: shorten(node.label),
      title: `${node.label} (Skill)`
    }));
    const workPoints = place(work, WORK_X).map(({ node, x, y }) => ({
      key: node.id,
      cx: x,
      cy: y,
      r: 7,
      fill: node.color,
      labelX: x + LABEL_GAP,
      labelY: y + 4,
      label: shorten(node.label),
      title: `${node.label} (${KIND_LABELS[node.kind]})`
    }));
    const lines = this.edges.map((edge) => {
      const from = position.get(edge.source);
      const to = position.get(edge.target);
      return { key: edge.id, x1: from.x, y1: from.y, x2: to.x, y2: to.y };
    });

    return {
      viewBox: `0 0 ${SVG_WIDTH} ${height}`,
      height,
      lines,
      skillPoints,
      workPoints
    };
  }
}
