/**
 * @description       : Skills page (Round 5 plan M2). A matrix by default: one row per category, one chip per
 *                      skill with its proficiency and the years it was used, worked out from the dates of the
 *                      roles linked through Experience_Skill__c. Selecting a chip lists the roles and projects
 *                      that used it. On desktop and tablet a "Matrix | Graph" switch opens a graph view that
 *                      loads the D3 engine (c/graphEngine) on first open only, clusters skills by category with
 *                      the roles and projects on a ring, and draws edges only for the hovered or selected node.
 *                      Phones and narrow viewports get the matrix only and never request the engine.
 *                      Nothing animates: positions are computed once and drawn as SVG from this template, so
 *                      prefers-reduced-motion needs no special case.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
// The Round 3 plan (K5) pins lightning/uiGraphQLApi. The lint rule prefers
// lightning/graphql, a move left to the orchestrator.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { gql, graphql } from "lightning/uiGraphQLApi";
import FORM_FACTOR from "@salesforce/client/formFactor";
import { loadGraphEngine, layoutGraph } from "c/graphEngine";
import { EVENTS, trackEvent } from "c/analyticsService";

// Reads only fields the guest can read: K4, the required Category_Order__c, and the two
// Experience__c dates Portfolio_Guest grants from Round 5 (trap 44).
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
              Category_Order__c {
                value
              }
              Display_Name__c {
                value
              }
              Proficiency__c {
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
                Start_Date__c {
                  value
                }
                End_Date__c {
                  value
                }
                Is_Current_Role__c {
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
const OTHER_CATEGORY = "Other";
const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_DAYS = 365.25;
const VIEW_MATRIX = "matrix";
const VIEW_GRAPH = "graph";

const KIND_LABELS = { skill: "Skill", role: "Role", project: "Project" };

// Graph geometry. The view box leaves room either side of the layout box for the labels.
// The spacing was tuned on production shaped data (Round 6 plan N3, layoutSpacing.test.js).
const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 840;
const LABEL_ROOM = 150;
const CATEGORY_RING = 0.25;
const WORK_RING = 0.45;
const LABEL_MAX = 24;
// A category label is drawn in its cluster. An unseen node of this radius per character holds
// the label's place, so skills settle round the label instead of under it (13px mono, 0.6em
// a character, a circle 0.6 of the label's half width).
const CATEGORY_RADIUS_PER_CHAR = 2.34;

function fieldValue(record, field) {
  return record && record[field] ? record[field].value : null;
}

function rowsOf(data, objectName) {
  const connection = data?.uiapi?.query?.[objectName];
  return connection && Array.isArray(connection.edges)
    ? connection.edges.map((edge) => edge.node).filter(Boolean)
    : [];
}

// A date only value ("2020-03-01") as UTC midnight in milliseconds, or null.
function parseDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return null;
  }
  const time = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

function todayUtc() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// Years a skill was used: the union of its roles' date ranges with overlaps merged. A role with
// no end date, or marked current, counts to today. A role with no start date is left out.
// Returns null when no role with a start date is linked.
function yearsUsed(roles, today) {
  const ranges = roles
    .map((role) => {
      const start = parseDay(role.startDate);
      if (start === null) {
        return null;
      }
      const end =
        role.isCurrent || !role.endDate ? today : parseDay(role.endDate);
      return end === null || end < start ? null : [start, end];
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);
  if (!ranges.length) {
    return null;
  }
  let total = 0;
  let [currentStart, currentEnd] = ranges[0];
  ranges.slice(1).forEach(([start, end]) => {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  });
  total += currentEnd - currentStart;
  return total / DAY_MS / YEAR_DAYS;
}

function yearsLabel(years) {
  if (years === null) {
    return "";
  }
  if (years < 1) {
    return "under 1 yr";
  }
  const rounded = years.toFixed(1);
  return rounded === "1.0" ? "1.0 yr" : `${rounded} yrs`;
}

function yearsSpoken(years) {
  if (years === null) {
    return "";
  }
  if (years < 1) {
    return "used for under 1 year";
  }
  return `used for ${years.toFixed(1)} years`;
}

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

function shorten(text) {
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text;
}

// Turns the GraphQL payload into skills, roles, projects and the links between them.
// A junction row whose skill is not in the skill result is dropped, so every link has both ends.
function buildModel(data, today) {
  const skills = new Map();
  rowsOf(data, "Skill__c").forEach((row) => {
    const name =
      fieldValue(row, "Display_Name__c") ||
      fieldValue(row, "Name") ||
      "Unnamed skill";
    const order = Number(fieldValue(row, "Category_Order__c"));
    const proficiency = Math.round(Number(fieldValue(row, "Proficiency__c")));
    skills.set(row.Id, {
      id: row.Id,
      name,
      category: fieldValue(row, "Category__c") || OTHER_CATEGORY,
      categoryOrder:
        fieldValue(row, "Category_Order__c") !== null && Number.isFinite(order)
          ? order
          : Number.MAX_SAFE_INTEGER,
      proficiency: Number.isFinite(proficiency)
        ? Math.min(Math.max(proficiency, 0), 5)
        : 0,
      roleIds: [],
      projectIds: []
    });
  });

  const roles = new Map();
  const projects = new Map();
  const links = [];

  rowsOf(data, "Experience_Skill__c").forEach((row) => {
    const skill = skills.get(fieldValue(row, "Skill__c"));
    const roleId = fieldValue(row, "Experience__c");
    if (!skill || !roleId) {
      return;
    }
    if (!roles.has(roleId)) {
      const related = row.Experience__r;
      roles.set(roleId, {
        id: roleId,
        name: fieldValue(related, "Name") || "Role",
        startDate: fieldValue(related, "Start_Date__c"),
        endDate: fieldValue(related, "End_Date__c"),
        isCurrent: fieldValue(related, "Is_Current_Role__c") === true
      });
    }
    if (!skill.roleIds.includes(roleId)) {
      skill.roleIds.push(roleId);
      links.push({ id: row.Id, source: skill.id, target: roleId });
    }
  });

  rowsOf(data, "Project_Skill__c").forEach((row) => {
    const skill = skills.get(fieldValue(row, "Skill__c"));
    const projectId = fieldValue(row, "Project__c");
    if (!skill || !projectId) {
      return;
    }
    if (!projects.has(projectId)) {
      projects.set(projectId, {
        id: projectId,
        name: fieldValue(row.Project__r, "Name") || "Project"
      });
    }
    if (!skill.projectIds.includes(projectId)) {
      skill.projectIds.push(projectId);
      links.push({ id: row.Id, source: skill.id, target: projectId });
    }
  });

  skills.forEach((skill) => {
    skill.years = yearsUsed(
      skill.roleIds.map((id) => roles.get(id)),
      today
    );
  });

  return { skills, roles, projects, links };
}

export default class SkillNetwork extends LightningElement {
  model;
  isLoading = true;
  errorMessage;
  isSmall = false;
  view = VIEW_MATRIX;
  selectedSkillId;

  // Graph view state.
  graphLoading = false;
  graphErrorMessage;
  layout;
  hoverId;
  selectedNodeId;
  disconnected = false;

  connectedCallback() {
    this.disconnected = false;
    this.isSmall = FORM_FACTOR === "Small" || this.isNarrowViewport();
    if (this.isSmall) {
      this.view = VIEW_MATRIX;
    }
  }

  disconnectedCallback() {
    this.disconnected = true;
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
          .join(" ") || "The skills could not be loaded.";
      return;
    }
    if (!data) {
      return;
    }
    this.model = buildModel(data, todayUtc());
    this.errorMessage = undefined;
    this.isLoading = false;
    // New data means new positions. An open graph lays itself out again.
    this.layout = undefined;
    if (this.isGraph) {
      this.openGraph();
    }
  }

  // ---------- state ----------

  get hasError() {
    return !this.isLoading && Boolean(this.errorMessage);
  }

  get hasSkills() {
    return Boolean(this.model) && this.model.skills.size > 0;
  }

  get isEmpty() {
    return !this.isLoading && !this.errorMessage && !this.hasSkills;
  }

  get showSwitch() {
    return !this.isSmall;
  }

  get isMatrix() {
    return !this.isGraph;
  }

  get isGraph() {
    return this.view === VIEW_GRAPH && !this.isSmall;
  }

  get matrixPressed() {
    return String(this.isMatrix);
  }

  get graphPressed() {
    return String(this.isGraph);
  }

  get matrixButtonClass() {
    return this.isMatrix ? "view-button is-on" : "view-button";
  }

  get graphButtonClass() {
    return this.isGraph ? "view-button is-on" : "view-button";
  }

  // ---------- matrix ----------

  get categoryRows() {
    if (!this.model) {
      return [];
    }
    const groups = new Map();
    this.model.skills.forEach((skill) => {
      if (!groups.has(skill.category)) {
        groups.set(skill.category, {
          name: skill.category,
          order: skill.categoryOrder,
          skills: []
        });
      }
      const group = groups.get(skill.category);
      group.order = Math.min(group.order, skill.categoryOrder);
      group.skills.push(skill);
    });
    return [...groups.values()]
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((group, index) => ({
        key: group.name,
        name: group.name,
        headingId: `skill-category-${index}`,
        chips: [...group.skills]
          .sort((a, b) => b.proficiency - a.proficiency || byName(a, b))
          .map((skill) => this.chipFor(skill))
      }));
  }

  chipFor(skill) {
    const selected = skill.id === this.selectedSkillId;
    const years = yearsLabel(skill.years);
    return {
      id: skill.id,
      name: skill.name,
      proficiency: `${skill.proficiency}/5`,
      years,
      hasYears: Boolean(years),
      pressed: String(selected),
      className: selected ? "chip is-selected" : "chip",
      ariaLabel: [
        skill.name,
        `proficiency ${skill.proficiency} of 5`,
        yearsSpoken(skill.years)
      ]
        .filter(Boolean)
        .join(", ")
    };
  }

  get selection() {
    const skill =
      this.model && this.selectedSkillId
        ? this.model.skills.get(this.selectedSkillId)
        : undefined;
    if (!skill) {
      return undefined;
    }
    const roles = skill.roleIds
      .map((id) => this.model.roles.get(id))
      .sort(byName)
      .map((role) => ({ id: role.id, name: role.name }));
    const projects = skill.projectIds
      .map((id) => this.model.projects.get(id))
      .sort(byName)
      .map((project) => ({ id: project.id, name: project.name }));
    const years = yearsLabel(skill.years);
    return {
      name: skill.name,
      summary: years
        ? `Proficiency ${skill.proficiency} of 5, ${years} used.`
        : `Proficiency ${skill.proficiency} of 5.`,
      roles,
      projects,
      hasRoles: roles.length > 0,
      hasProjects: projects.length > 0,
      isUnused: roles.length === 0 && projects.length === 0
    };
  }

  handleChipClick(event) {
    this.selectSkill(event.currentTarget.dataset.id);
  }

  handleClearSelection() {
    this.selectedSkillId = undefined;
  }

  selectSkill(id) {
    if (this.selectedSkillId === id) {
      this.selectedSkillId = undefined;
      return;
    }
    const skill = this.model && this.model.skills.get(id);
    if (!skill) {
      return;
    }
    this.selectedSkillId = id;
    trackEvent(EVENTS.SKILL_SELECTED, {
      skill: skill.name,
      years: skill.years === null ? null : Number(skill.years.toFixed(1))
    });
  }

  // ---------- view switch ----------

  handleViewClick(event) {
    const view =
      event.currentTarget.dataset.view === VIEW_GRAPH
        ? VIEW_GRAPH
        : VIEW_MATRIX;
    if (view === this.view || (view === VIEW_GRAPH && this.isSmall)) {
      return;
    }
    this.view = view;
    trackEvent(EVENTS.SKILLS_VIEW_CHANGED, { view });
    if (view === VIEW_GRAPH) {
      this.openGraph();
    }
  }

  // Loads the engine the first time the graph opens and lays the graph out once per data set.
  // Never runs on a phone or a narrow viewport.
  openGraph() {
    if (this.isSmall || this.layout || this.graphLoading || !this.hasSkills) {
      return Promise.resolve();
    }
    this.graphLoading = true;
    this.graphErrorMessage = undefined;
    return loadGraphEngine(this)
      .then((d3) => {
        if (!this.disconnected) {
          this.layout = this.computeLayout(d3);
        }
      })
      .catch((error) => {
        const reason = error && error.message ? ` ${error.message}` : "";
        this.graphErrorMessage = `The graph could not load. The matrix still shows every skill.${reason}`;
      })
      .finally(() => {
        this.graphLoading = false;
      });
  }

  get showGraphCanvas() {
    return Boolean(this.layout) && !this.graphLoading;
  }

  graphNodes() {
    const { skills, roles, projects } = this.model;
    const nodes = [];
    skills.forEach((skill) =>
      nodes.push({
        id: skill.id,
        kind: "skill",
        name: skill.name,
        group: `category:${skill.category}`,
        radius: 6 + skill.proficiency
      })
    );
    roles.forEach((role) =>
      nodes.push({
        id: role.id,
        kind: "role",
        name: role.name,
        group: `work:${role.id}`,
        radius: 10
      })
    );
    projects.forEach((project) =>
      nodes.push({
        id: project.id,
        kind: "project",
        name: project.name,
        group: `work:${project.id}`,
        radius: 10
      })
    );
    return nodes;
  }

  // Categories on an inner ring in matrix order. Roles, then projects, on an outer ring.
  graphAnchors(categoryNames) {
    const cx = GRAPH_WIDTH / 2;
    const cy = GRAPH_HEIGHT / 2;
    const short = Math.min(GRAPH_WIDTH, GRAPH_HEIGHT);
    const anchors = {};
    const onRing = (keys, radius) =>
      keys.forEach((key, index) => {
        const angle = (2 * Math.PI * index) / keys.length - Math.PI / 2;
        anchors[key] = {
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle)
        };
      });
    onRing(
      categoryNames.map((name) => `category:${name}`),
      short * CATEGORY_RING
    );
    const work = [
      ...[...this.model.roles.values()].sort(byName),
      ...[...this.model.projects.values()].sort(byName)
    ].map((item) => `work:${item.id}`);
    onRing(work, short * WORK_RING);
    return anchors;
  }

  computeLayout(d3) {
    const categoryNames = this.categoryRows.map((row) => row.name);
    const anchors = this.graphAnchors(categoryNames);
    const labelNodes = categoryNames.map((name) => ({
      id: `category:${name}`,
      kind: "category",
      name,
      group: `category:${name}`,
      radius: name.length * CATEGORY_RADIUS_PER_CHAR
    }));
    const result = layoutGraph(
      d3,
      [...this.graphNodes(), ...labelNodes],
      this.model.links,
      {
        width: GRAPH_WIDTH,
        height: GRAPH_HEIGHT,
        anchors,
        // Category labels hold their anchor and roles and projects their place on the ring.
        // Skills gather by category.
        anchorStrength: (node) => {
          if (node.kind === "skill") {
            return 0.15;
          }
          return node.kind === "category" ? 1 : 0.9;
        },
        linkDistance: 80,
        linkStrength: 0.01,
        charge: -130,
        padding: 18
      }
    );
    const categories = result.nodes
      .filter((node) => node.kind === "category")
      .map((node) => ({
        key: node.name,
        name: node.name,
        x: node.x,
        y: node.y
      }));
    const nodes = result.nodes.filter((node) => node.kind !== "category");
    return { nodes, edges: result.edges, categories };
  }

  get activeId() {
    return this.hoverId || this.selectedNodeId;
  }

  get graphModel() {
    if (!this.layout) {
      return undefined;
    }
    const active = this.activeId;
    const linked = new Set();
    const edges = [];
    this.layout.edges.forEach((edge) => {
      if (active && (edge.source === active || edge.target === active)) {
        linked.add(edge.source);
        linked.add(edge.target);
        edges.push({
          key: edge.id,
          x1: edge.x1,
          y1: edge.y1,
          x2: edge.x2,
          y2: edge.y2
        });
      }
    });
    const cx = GRAPH_WIDTH / 2;
    const nodes = this.layout.nodes.map((node) => {
      const isActive = node.id === active;
      const isLinked = linked.has(node.id) && !isActive;
      const rightSide = node.x >= cx;
      const classes = [`graph-node node-${node.kind}`];
      if (isActive) {
        classes.push("is-active");
      } else if (isLinked) {
        classes.push("is-linked");
      } else if (active) {
        classes.push("is-dim");
      }
      return {
        key: node.id,
        id: node.id,
        className: classes.join(" "),
        cx: node.x,
        cy: node.y,
        r: node.radius,
        title: `${node.name} (${KIND_LABELS[node.kind]})`,
        showLabel: node.kind !== "skill" || isActive || isLinked,
        label: shorten(node.name),
        labelX: rightSide ? node.x + node.radius + 4 : node.x - node.radius - 4,
        labelY: node.y + 4,
        anchor: rightSide ? "start" : "end"
      };
    });
    return {
      viewBox: `${-LABEL_ROOM} 0 ${GRAPH_WIDTH + LABEL_ROOM * 2} ${GRAPH_HEIGHT}`,
      edges,
      nodes,
      categories: this.layout.categories
    };
  }

  handleNodeEnter(event) {
    this.hoverId = event.currentTarget.dataset.id;
  }

  handleNodeLeave() {
    this.hoverId = undefined;
  }

  handleNodeClick(event) {
    const id = event.currentTarget.dataset.id;
    this.selectedNodeId = this.selectedNodeId === id ? undefined : id;
    if (this.selectedNodeId && this.model.skills.has(id)) {
      this.selectSkill(id);
    }
  }

  get graphSelectionText() {
    const id = this.selectedNodeId;
    if (!id || !this.model) {
      return "";
    }
    const names = (ids, map) => ids.map((key) => map.get(key).name).sort();
    let name;
    let lines;
    const skill = this.model.skills.get(id);
    if (skill) {
      name = skill.name;
      lines = [
        ...names(skill.roleIds, this.model.roles),
        ...names(skill.projectIds, this.model.projects)
      ];
    } else {
      const work = this.model.roles.get(id) || this.model.projects.get(id);
      if (!work) {
        return "";
      }
      name = work.name;
      lines = [...this.model.skills.values()]
        .filter(
          (candidate) =>
            candidate.roleIds.includes(id) || candidate.projectIds.includes(id)
        )
        .map((candidate) => candidate.name)
        .sort();
    }
    return lines.length
      ? `${name}: ${lines.join(", ")}.`
      : `${name}: no connections.`;
  }

  // ---------- accessible list ----------

  // One entry per graph node for screen readers, naming every node it connects to. The SVG is
  // hidden from assistive technology, so this list is the graph's text equivalent.
  get accessibleNodes() {
    if (!this.model) {
      return [];
    }
    const nodes = this.graphNodes();
    const labels = new Map(nodes.map((node) => [node.id, node.name]));
    const connections = new Map(nodes.map((node) => [node.id, []]));
    this.model.links.forEach((link) => {
      connections.get(link.source).push(labels.get(link.target));
      connections.get(link.target).push(labels.get(link.source));
    });
    return nodes.map((node) => {
      const connected = connections.get(node.id);
      const kind = KIND_LABELS[node.kind];
      const text = connected.length
        ? `${node.name}, ${kind}. Connected to ${connected.join(", ")}.`
        : `${node.name}, ${kind}. No connections.`;
      return { id: node.id, text, connectionCount: connected.length };
    });
  }

  get summary() {
    const nodeCount = this.accessibleNodes.length;
    const linkCount = this.model ? this.model.links.length : 0;
    const nodeWord = nodeCount === 1 ? "item" : "items";
    const linkWord = linkCount === 1 ? "connection" : "connections";
    return `${nodeCount} ${nodeWord} and ${linkCount} ${linkWord}.`;
  }
}
