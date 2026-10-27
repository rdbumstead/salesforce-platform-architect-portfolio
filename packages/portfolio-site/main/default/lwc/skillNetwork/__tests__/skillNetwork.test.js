/**
 * @description       : Unit tests for skillNetwork LWC on the Large form factor (the Jest default). Covers the
 *                      matrix, the years rule, chip selection, the view switch, the lazy graph and its engine
 *                      load, the accessible list, the analytics calls and the no hex rule.
 *                      Also the zoom controls, the zoom transform, node drag and reset view, and the
 *                      persona filter on the matrix.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SkillNetwork, { evidenceSentence, placeLabels } from "c/skillNetwork";
// Same module as the component, which the site pins.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { graphql } from "lightning/uiGraphQLApi";
import {
  attachNodeDrag,
  attachPanZoom,
  layoutGraph,
  loadGraphEngine
} from "c/graphEngine";
import { trackEvent } from "c/analyticsService";
import getCertificationLinks from "@salesforce/apex/SkillGraphController.getCertificationLinks";

const fs = require("fs");
const path = require("path");

const PAYLOAD = require("./data/skillNetworkPayload.json");

// Five skills in three categories, three roles, two projects. Five Experience_Skill__c and
// four Project_Skill__c rows have both ends. One row of each points at a skill outside the result.
const EXPECTED = { nodes: 10, links: 9, categories: 3 };

// Fixed "today" for the years rule. Roles: Senior Developer 2018-01-01 to 2021-01-01,
// Architect 2020-01-01 to now (current, no end date), Analyst 2024-01-01 to 2024-06-30.
const TODAY = new Date("2026-01-01T12:00:00Z");

function buildPayload({ empty = false } = {}) {
  const data = JSON.parse(JSON.stringify(PAYLOAD));
  if (empty) {
    data.uiapi.query.Skill__c.edges = [];
  }
  return data;
}

// config/jest.config.js maps every lightning/* import to one universal mock component, so the
// factory keeps it as the default export and adds a test wire adapter for graphql.
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
  "@salesforce/apex/SkillGraphController.getCertificationLinks",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

// The pure helpers stay real, the d3 parts are stand ins.
jest.mock(
  "c/graphEngine",
  () => {
    const actual = jest.requireActual("c/graphEngine");
    return {
      loadGraphEngine: jest.fn(),
      layoutGraph: jest.fn(),
      attachPanZoom: jest.fn(),
      attachNodeDrag: jest.fn(),
      boundsOf: actual.boundsOf,
      fitTransform: actual.fitTransform
    };
  },
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: {
      SKILLS_VIEW_CHANGED: "skills_view_changed",
      SKILL_SELECTED: "skill_selected",
      SKILLS_PERSONA_FILTERED: "skills_persona_filtered",
      GRAPH_ZOOM_USED: "graph_zoom_used",
      GRAPH_LAYOUT_CHANGED: "graph_layout_changed"
    }
  }),
  { virtual: true }
);

// Reduced motion on, so the matrix changes at once, unless a test turns it off.
function setMotion({ reduced = true, narrow = false } = {}) {
  window.matchMedia = jest.fn((query) => ({
    matches: query.includes("reduce") ? reduced : narrow
  }));
}

// Two certifications: one current that backs Apex and Data Cloud, one retired that backs
// Agentforce. A link to a skill outside the result is dropped.
const CERTIFICATIONS = [
  {
    id: "a01C1",
    name: "Salesforce Certified Platform Developer",
    isRetired: false,
    earnedYear: 2021,
    skillIds: ["a01S1", "a01S4", "a01MISSING"]
  },
  {
    id: "a01C2",
    name: "Salesforce Certified AI Associate",
    isRetired: true,
    earnedYear: 2023,
    skillIds: ["a01S5"]
  }
];

async function flushPromises() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function mount() {
  const element = createElement("c-skill-network", { is: SkillNetwork });
  document.body.appendChild(element);
  return element;
}

async function mountWithData() {
  const element = mount();
  graphql.emit({ data: buildPayload(), errors: undefined });
  await flushPromises();
  return element;
}

function chipByName(element, name) {
  return [...element.shadowRoot.querySelectorAll("button.chip")].find(
    (chip) => chip.querySelector(".chip-name").textContent === name
  );
}

function switchButton(element, view) {
  return element.shadowRoot.querySelector(`.view-button[data-view="${view}"]`);
}

function count(element, selector) {
  return element.shadowRoot.querySelectorAll(selector).length;
}

// A stand in for layoutGraph: puts nodes on a line and fills in edge end points.
function fakeLayout(d3, nodes, edges) {
  const placed = nodes.map((node, index) => ({
    ...node,
    x: 20 + index * 40,
    y: 100
  }));
  const byId = new Map(placed.map((node) => [node.id, node]));
  return {
    nodes: placed,
    edges: edges.map((edge) => ({
      ...edge,
      x1: byId.get(edge.source).x,
      y1: 100,
      x2: byId.get(edge.target).x,
      y2: 100
    }))
  };
}

describe("c-skill-network (Large form factor)", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: TODAY });
    loadGraphEngine.mockResolvedValue({ forceSimulation: jest.fn() });
    layoutGraph.mockImplementation(fakeLayout);
    attachPanZoom.mockReturnValue(undefined);
    attachNodeDrag.mockReturnValue(true);
    setMotion();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.useRealTimers();
    jest.clearAllMocks();
    delete window.matchMedia;
  });

  // The card puts its actions slot at the right of its title row. The Jest card mock has no
  // named slots, so the template itself is read.
  it("places View source with the skillNetwork key in the card title row", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "..", "skillNetwork.html"),
      "utf8"
    );
    expect(html).toMatch(
      /<lightning-card[^>]*>\s*<c-view-source slot="actions" source-key="skillNetwork"><\/c-view-source>/
    );
    expect(html.match(/<c-view-source/g)).toHaveLength(1);
  });

  it("shows a spinner until the wire returns", () => {
    const element = mount();
    expect(element.shadowRoot.querySelector(".state-loading")).not.toBeNull();
    expect(element.shadowRoot.querySelector(".matrix")).toBeNull();
  });

  it("shows the error state when the query fails", async () => {
    const element = mount();
    graphql.emit({ errors: [{ message: "No access" }] });
    await flushPromises();

    const error = element.shadowRoot.querySelector(".state-error");
    expect(error).not.toBeNull();
    expect(error.textContent).toContain("No access");
  });

  it("says the error sentence once when the query gives no reason of its own", async () => {
    const element = mount();
    graphql.emit({ errors: [{}] });
    await flushPromises();

    const error = element.shadowRoot.querySelector(".state-error");
    const sentence = "The skills could not be loaded.";
    expect(error.textContent.split(sentence)).toHaveLength(2);
    expect(error.querySelectorAll("p")).toHaveLength(1);
  });

  it("shows the empty state when there are no skills", async () => {
    const element = mount();
    graphql.emit({ data: buildPayload({ empty: true }), errors: undefined });
    await flushPromises();

    expect(element.shadowRoot.querySelector(".state-empty")).not.toBeNull();
    expect(element.shadowRoot.querySelector(".view-switch")).toBeNull();
  });

  it("opens on the matrix with one row per category in Category_Order__c order", async () => {
    const element = await mountWithData();

    const rows = [...element.shadowRoot.querySelectorAll(".matrix-row")];
    expect(
      rows.map((row) => row.querySelector(".row-name").textContent)
    ).toEqual(["Frontend", "Backend", "Data"]);
    expect(element.shadowRoot.querySelector(".graph-view")).toBeNull();
  });

  it("orders chips by proficiency, then name, and shows the display name and proficiency", async () => {
    const element = await mountWithData();

    const rows = [...element.shadowRoot.querySelectorAll(".matrix-row")];
    const names = rows.map((row) =>
      [...row.querySelectorAll(".chip-name")].map((chip) => chip.textContent)
    );
    expect(names).toEqual([
      ["Flow", "Lightning Web Components"],
      ["Apex"],
      ["Agentforce", "Data Cloud"]
    ]);
    const apex = chipByName(element, "Apex");
    expect(apex.querySelector(".chip-proficiency").textContent).toBe("5/5");
    expect(apex.tagName).toBe("BUTTON");
    expect(apex.getAttribute("aria-pressed")).toBe("false");
  });

  it("works out years from merged role ranges, counts a current role to today, and says under 1 yr", async () => {
    const element = await mountWithData();
    const years = (name) => {
      const node = chipByName(element, name).querySelector(".chip-years");
      return node ? node.textContent : null;
    };

    // Senior Developer 2018 to 2021 overlaps Architect 2020 to today: 2018 to 2026.
    expect(years("Apex")).toBe("8.0 yrs");
    // Architect only, current with no end date: 2020 to 2026.
    expect(years("Lightning Web Components")).toBe("6.0 yrs");
    // Senior Developer only.
    expect(years("Flow")).toBe("3.0 yrs");
    // Analyst, six months.
    expect(years("Data Cloud")).toBe("under 1 yr");
    // Linked to a project only, so no years.
    expect(years("Agentforce")).toBeNull();
    expect(chipByName(element, "Agentforce").getAttribute("aria-label")).toBe(
      "Agentforce, proficiency 3 of 5, used on a project"
    );
  });

  it("lists the roles and projects of a selected chip and tracks skill_selected", async () => {
    const element = await mountWithData();

    chipByName(element, "Apex").click();
    await flushPromises();

    const chip = chipByName(element, "Apex");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    const panel = element.shadowRoot.querySelector(".selection-panel");
    expect(panel.querySelector(".selection-title").textContent).toBe("Apex");
    expect(
      [...panel.querySelectorAll(".selection-roles li")].map(
        (li) => li.textContent
      )
    ).toEqual(["Architect", "Senior Developer"]);
    expect(
      [...panel.querySelectorAll(".selection-projects li")].map(
        (li) => li.textContent
      )
    ).toEqual(["Employer Hub", "Portfolio"]);
    expect(trackEvent).toHaveBeenCalledWith("skill_selected", {
      skill: "Apex",
      years: 8
    });

    chip.click();
    await flushPromises();
    expect(element.shadowRoot.querySelector(".selection-panel")).toBeNull();
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("shows Project in place of years for a skill only a project links", async () => {
    const element = await mountWithData();
    const chip = chipByName(element, "Agentforce");

    expect(chip.querySelector(".chip-evidence").textContent).toBe("Project");
    expect(chip.querySelector(".chip-years")).toBeNull();
    expect(
      chipByName(element, "Apex").querySelector(".chip-evidence")
    ).toBeNull();
  });

  it("shows the earliest certified year for a skill with no role, and never gives it years", async () => {
    const element = await mountWithData();
    getCertificationLinks.emit(JSON.parse(JSON.stringify(CERTIFICATIONS)));
    await flushPromises();
    const chip = chipByName(element, "Agentforce");

    expect(chip.querySelector(".chip-evidence").textContent).toBe(
      "Certified 2023"
    );
    expect(chip.querySelector(".chip-years")).toBeNull();
    expect(chip.getAttribute("aria-label")).toBe(
      "Agentforce, proficiency 3 of 5, certified in 2023"
    );
    chip.click();
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(".selection-summary").textContent
    ).toBe("Proficiency 3 of 5, certified in 2023.");
  });

  it("keeps years for a skill with roles even when a certification backs it", async () => {
    const element = await mountWithData();
    getCertificationLinks.emit(JSON.parse(JSON.stringify(CERTIFICATIONS)));
    await flushPromises();

    expect(
      chipByName(element, "Apex").querySelector(".chip-years").textContent
    ).toBe("8.0 yrs");
    expect(
      chipByName(element, "Apex").querySelector(".chip-evidence")
    ).toBeNull();
  });

  it("sends null years for a skill with no role", async () => {
    const element = await mountWithData();

    chipByName(element, "Agentforce").click();
    await flushPromises();

    expect(trackEvent).toHaveBeenCalledWith("skill_selected", {
      skill: "Agentforce",
      years: null
    });
    expect(element.shadowRoot.querySelector(".selection-roles")).toBeNull();
  });

  it("does not request the engine until the graph opens", async () => {
    const element = await mountWithData();

    expect(switchButton(element, "matrix").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(loadGraphEngine).not.toHaveBeenCalled();
    expect(layoutGraph).not.toHaveBeenCalled();
  });

  it("loads the engine on first open, lays the graph out once and tracks skills_view_changed", async () => {
    const element = await mountWithData();

    switchButton(element, "graph").click();
    await flushPromises();

    expect(trackEvent).toHaveBeenCalledWith("skills_view_changed", {
      view: "graph"
    });
    expect(loadGraphEngine).toHaveBeenCalledTimes(1);
    expect(layoutGraph).toHaveBeenCalledTimes(1);
    const [, nodes, links, options] = layoutGraph.mock.calls[0];
    // One unseen label node per category joins the drawn nodes in the layout.
    expect(nodes).toHaveLength(EXPECTED.nodes + EXPECTED.categories);
    expect(nodes.filter((node) => node.kind === "category")).toHaveLength(
      EXPECTED.categories
    );
    expect(links).toHaveLength(EXPECTED.links);
    expect(options.anchors["category:Frontend"]).toBeDefined();
    expect(count(element, ".graph-node")).toBe(EXPECTED.nodes);
    expect(element.shadowRoot.querySelector(".matrix")).toBeNull();

    switchButton(element, "matrix").click();
    await flushPromises();
    switchButton(element, "graph").click();
    await flushPromises();

    expect(trackEvent).toHaveBeenCalledWith("skills_view_changed", {
      view: "matrix"
    });
    expect(loadGraphEngine).toHaveBeenCalledTimes(1);
    expect(layoutGraph).toHaveBeenCalledTimes(1);
  });

  it("draws edges only for the hovered or selected node", async () => {
    const element = await mountWithData();
    switchButton(element, "graph").click();
    await flushPromises();

    expect(count(element, ".graph-edge")).toBe(0);

    const apex = element.shadowRoot.querySelector(
      '.graph-node[data-id="a01S1"]'
    );
    apex.dispatchEvent(new CustomEvent("mouseenter"));
    await flushPromises();
    // Apex links to two roles and two projects.
    expect(count(element, ".graph-edge")).toBe(4);

    apex.dispatchEvent(new CustomEvent("mouseleave"));
    await flushPromises();
    expect(count(element, ".graph-edge")).toBe(0);

    element.shadowRoot
      .querySelector('.graph-node[data-id="a05R2"]')
      .dispatchEvent(new CustomEvent("click"));
    await flushPromises();
    // Architect links to Apex and LWC.
    expect(count(element, ".graph-edge")).toBe(2);
    expect(
      element.shadowRoot.querySelector(".graph-selection").textContent
    ).toContain("Architect: Apex, Lightning Web Components.");
  });

  it("keeps an accessible list with one entry per graph node", async () => {
    const element = await mountWithData();
    switchButton(element, "graph").click();
    await flushPromises();

    const items = [...element.shadowRoot.querySelectorAll(".network-node")];
    expect(items).toHaveLength(EXPECTED.nodes);
    expect(
      element.shadowRoot.querySelector(".network-summary").textContent
    ).toBe(`${EXPECTED.nodes} items and ${EXPECTED.links} connections.`);
    const apex = items.find((item) => item.textContent.startsWith("Apex,"));
    expect(apex.textContent).toContain("Senior Developer");
    expect(apex.textContent).toContain("Employer Hub");
    expect(apex.dataset.connections).toBe("4");
    expect(
      element.shadowRoot.querySelector(".graph-svg").getAttribute("aria-hidden")
    ).toBe("true");
  });

  it("explains a failed engine load and retries on the next open", async () => {
    loadGraphEngine
      .mockRejectedValueOnce(new Error("D3_Library failed to load: blocked"))
      .mockResolvedValue({ forceSimulation: jest.fn() });
    const element = await mountWithData();

    switchButton(element, "graph").click();
    await flushPromises();
    const error = element.shadowRoot.querySelector(".graph-error");
    expect(error.textContent).toContain("The graph could not load");
    expect(element.shadowRoot.querySelector(".graph-svg")).toBeNull();

    switchButton(element, "matrix").click();
    await flushPromises();
    switchButton(element, "graph").click();
    await flushPromises();
    expect(loadGraphEngine).toHaveBeenCalledTimes(2);
    expect(element.shadowRoot.querySelector(".graph-svg")).not.toBeNull();
  });

  it("hides the switch on a narrow viewport and never loads the engine", async () => {
    setMotion({ narrow: true });
    const element = await mountWithData();

    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
    expect(element.shadowRoot.querySelector(".view-switch")).toBeNull();
    expect(count(element, ".matrix-row")).toBe(3);
    expect(loadGraphEngine).not.toHaveBeenCalled();
  });

  // Pan, zoom and drag. The engine's own tests drive the real d3-zoom and d3-drag.
  function fakeControls() {
    return {
      zoomIn: jest.fn(),
      zoomOut: jest.fn(),
      reset: jest.fn(),
      fitTo: jest.fn(),
      panBy: jest.fn(),
      scale: jest.fn(() => 1),
      detach: jest.fn()
    };
  }

  async function openGraph(element) {
    switchButton(element, "graph").click();
    await flushPromises();
  }

  function graphNode(element, id) {
    return element.shadowRoot.querySelector(`.graph-node[data-id="${id}"]`);
  }

  it("shows no zoom controls when the loaded library has no d3-zoom", async () => {
    const element = await mountWithData();
    await openGraph(element);

    expect(attachPanZoom).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot.querySelector(".graph-controls")).toBeNull();
    expect(element.shadowRoot.querySelector(".graph-svg")).not.toBeNull();
  });

  // The fit the component asked for when it wired zoom.
  function firstFit(controls) {
    return controls.fitTo.mock.calls[0][0];
  }

  function transformOf(fit) {
    return `translate(${fit.x},${fit.y}) scale(${fit.k})`;
  }

  it("wires zoom to the graph once, opens fitted and drives it from four named buttons", async () => {
    const controls = fakeControls();
    attachPanZoom.mockReturnValue(controls);
    const element = await mountWithData();
    await openGraph(element);

    const svg = element.shadowRoot.querySelector(".graph-svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 1280 800");
    expect(attachPanZoom).toHaveBeenCalledTimes(1);
    const [, target, options] = attachPanZoom.mock.calls[0];
    expect(target).toBe(svg);
    expect(options.extent).toEqual([
      [0, 0],
      [1280, 800]
    ]);
    const fit = firstFit(controls);
    // The view can step back past the fit, and one finger rests at the fit.
    expect(options.min).toBeCloseTo(fit.k * 0.5);
    expect(options.max).toBeCloseTo(fit.k * 4);
    expect(options.rest).toBe(fit.k);
    expect(controls.fitTo.mock.calls[0][1]).toBeUndefined();

    const buttons = [
      ...element.shadowRoot.querySelectorAll(".graph-controls button")
    ];
    expect(buttons.map((button) => button.textContent.trim())).toEqual([
      "Zoom in",
      "Zoom out",
      "Fit",
      "Reset layout"
    ]);
    buttons.forEach((button) => expect(button.type).toBe("button"));
    expect(
      element.shadowRoot
        .querySelector(".graph-controls")
        .getAttribute("aria-label")
    ).toBe("Graph view controls");

    buttons[0].click();
    buttons[1].click();
    buttons[2].click();
    buttons[3].click();
    expect(controls.zoomIn).toHaveBeenCalledTimes(1);
    expect(controls.zoomOut).toHaveBeenCalledTimes(1);
    expect(controls.fitTo).toHaveBeenCalledTimes(3);

    // Hovering re-renders the graph but binds nothing new.
    graphNode(element, "a01S1").dispatchEvent(new CustomEvent("mouseenter"));
    await flushPromises();
    expect(attachPanZoom).toHaveBeenCalledTimes(1);
    expect(attachNodeDrag).toHaveBeenCalledTimes(1);
  });

  it("eases a button press over 250 ms, and moves at once under reduced motion", async () => {
    setMotion({ reduced: false });
    const controls = fakeControls();
    attachPanZoom.mockReturnValue(controls);
    const element = await mountWithData();
    await openGraph(element);

    element.shadowRoot.querySelector('[data-action="zoom-in"]').click();
    element.shadowRoot.querySelector('[data-action="zoom-out"]').click();
    element.shadowRoot.querySelector('[data-action="fit"]').click();
    element.shadowRoot.querySelector('[data-action="reset-layout"]').click();
    expect(controls.zoomIn).toHaveBeenCalledWith(250);
    expect(controls.zoomOut).toHaveBeenCalledWith(250);
    expect(controls.fitTo.mock.calls[1][1]).toBe(250);
    expect(controls.fitTo.mock.calls[2][1]).toBe(250);

    setMotion({ reduced: true });
    element.shadowRoot.querySelector('[data-action="zoom-in"]').click();
    element.shadowRoot.querySelector('[data-action="fit"]').click();
    expect(controls.zoomIn).toHaveBeenLastCalledWith(0);
    expect(controls.fitTo.mock.calls[3][1]).toBe(0);
  });

  it("fits the content inside the view and says the zoom against the fit", async () => {
    const controls = fakeControls();
    attachPanZoom.mockReturnValue(controls);
    const element = await mountWithData();
    await openGraph(element);
    const viewport = () => element.shadowRoot.querySelector(".graph-viewport");
    const level = () =>
      element.shadowRoot.querySelector(".zoom-level").textContent;

    const fit = firstFit(controls);
    expect(viewport().getAttribute("transform")).toBe(transformOf(fit));
    expect(level()).toBe("Zoom 100%");
    // Every node, drawn through the fit, lands inside the view.
    [...element.shadowRoot.querySelectorAll(".graph-node .node-dot")].forEach(
      (circle) => {
        const x = Number(circle.getAttribute("cx")) * fit.k + fit.x;
        const y = Number(circle.getAttribute("cy")) * fit.k + fit.y;
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(1280);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(800);
      }
    );

    const { onZoom } = attachPanZoom.mock.calls[0][2];
    onZoom({ x: -240, y: -210, k: fit.k * 1.5 });
    await flushPromises();

    expect(viewport().getAttribute("transform")).toBe(
      `translate(-240,-210) scale(${fit.k * 1.5})`
    );
    expect(level()).toBe("Zoom 150%");
    expect(
      element.shadowRoot.querySelector(".zoom-level").getAttribute("aria-live")
    ).toBe("polite");
  });

  it("opens fitted even when the library has no d3-zoom", async () => {
    const element = await mountWithData();
    await openGraph(element);

    expect(
      element.shadowRoot
        .querySelector(".graph-viewport")
        .getAttribute("transform")
    ).not.toBe("translate(0,0) scale(1)");
  });

  it("moves a dragged node and its edges, keeps it in the box, and resets the layout", async () => {
    const controls = fakeControls();
    attachPanZoom.mockReturnValue(controls);
    const element = await mountWithData();
    await openGraph(element);
    const size = layoutGraph.mock.calls[0][3].width;

    expect(attachNodeDrag).toHaveBeenCalledTimes(1);
    const [, nodes, options] = attachNodeDrag.mock.calls[0];
    expect(nodes).toHaveLength(EXPECTED.nodes);

    const start = options.position("a01S1");
    const circle = () => graphNode(element, "a01S1").querySelector(".node-dot");
    expect(Number(circle().getAttribute("cx"))).toBe(start.x);

    options.onDrag("a01S1", 400, 300);
    await flushPromises();
    expect(Number(circle().getAttribute("cx"))).toBe(400);
    expect(Number(circle().getAttribute("cy"))).toBe(300);
    expect(options.position("a01S1")).toEqual({ x: 400, y: 300 });

    graphNode(element, "a01S1").dispatchEvent(new CustomEvent("mouseenter"));
    await flushPromises();
    const edges = [...element.shadowRoot.querySelectorAll(".graph-edge")];
    expect(edges).toHaveLength(4);
    edges.forEach((edge) => {
      expect(Number(edge.getAttribute("x1"))).toBe(400);
      expect(Number(edge.getAttribute("y1"))).toBe(300);
    });

    options.onDrag("a01S1", -500, 5000);
    await flushPromises();
    const radius = Number(circle().getAttribute("r"));
    expect(Number(circle().getAttribute("cx"))).toBe(radius);
    expect(Number(circle().getAttribute("cy"))).toBe(size - radius);

    element.shadowRoot.querySelector('[data-action="reset-layout"]').click();
    await flushPromises();
    expect(Number(circle().getAttribute("cx"))).toBe(start.x);
    expect(controls.fitTo).toHaveBeenCalledTimes(2);
  });

  it("keeps dragged nodes for the visit and drops saved ids the data no longer has", async () => {
    const element = await mountWithData();
    await openGraph(element);
    const size = layoutGraph.mock.calls[0][3].width;
    const options = attachNodeDrag.mock.calls[0][2];
    trackEvent.mockClear();

    // A press with no move is a click: nothing is saved or sent.
    options.onEnd("a01S2");
    expect(window.sessionStorage.getItem("skillNetwork.positions")).toBeNull();

    options.onDrag("a01S1", 400, 300);
    options.onEnd("a01S1");
    const saved = JSON.parse(
      window.sessionStorage.getItem("skillNetwork.positions")
    );
    expect(saved).toEqual({
      size,
      positions: { a01S1: { x: 400, y: 300 } }
    });
    expect(trackEvent.mock.calls).toEqual([
      ["graph_layout_changed", { action: "drag" }]
    ]);

    // A new page in the same visit: the saved node comes back, a stale id is dropped.
    window.sessionStorage.setItem(
      "skillNetwork.positions",
      JSON.stringify({
        size,
        positions: { a01S1: { x: 410, y: 310 }, a01GONE: { x: 1, y: 1 } }
      })
    );
    document.body.removeChild(element);
    const next = await mountWithData();
    await openGraph(next);
    const nextOptions =
      attachNodeDrag.mock.calls[attachNodeDrag.mock.calls.length - 1][2];
    expect(nextOptions.position("a01S1")).toEqual({ x: 410, y: 310 });
    expect(nextOptions.position("a01GONE")).toBeUndefined();

    // Positions saved for a box of another size are all dropped.
    window.sessionStorage.setItem(
      "skillNetwork.positions",
      JSON.stringify({ size: size + 10, positions: { a01S1: { x: 5, y: 5 } } })
    );
    document.body.removeChild(next);
    const third = await mountWithData();
    await openGraph(third);
    const thirdOptions =
      attachNodeDrag.mock.calls[attachNodeDrag.mock.calls.length - 1][2];
    expect(thirdOptions.position("a01S1")).not.toEqual({ x: 5, y: 5 });
  });

  it("pans a little past the content at any zoom and leaves the plain wheel to the page", async () => {
    attachPanZoom.mockReturnValue(fakeControls());
    const element = await mountWithData();
    await openGraph(element);
    const size = layoutGraph.mock.calls[0][3].width;

    const options = attachPanZoom.mock.calls[0][2];
    const [[left, top], [right, bottom]] = options.translateExtent;
    expect(left).toBeLessThanOrEqual(-120);
    expect(top).toBeLessThanOrEqual(-120);
    expect(right).toBeGreaterThanOrEqual(size + 120);
    expect(bottom).toBeGreaterThanOrEqual(size + 120);
    expect(options.ctrlWheel).toBe(true);
    expect(
      element.shadowRoot.querySelector(".graph-hint").textContent
    ).toContain("Ctrl and the mouse wheel");
  });

  it("sends graph_zoom_used for zoom buttons and gestures and graph_layout_changed for fit and reset", async () => {
    const controls = fakeControls();
    attachPanZoom.mockReturnValue(controls);
    const element = await mountWithData();
    await openGraph(element);
    window.sessionStorage.setItem("skillNetwork.positions", "{}");
    trackEvent.mockClear();

    element.shadowRoot.querySelector('[data-action="zoom-in"]').click();
    element.shadowRoot.querySelector('[data-action="zoom-out"]').click();
    element.shadowRoot.querySelector('[data-action="fit"]').click();
    element.shadowRoot.querySelector('[data-action="reset-layout"]').click();
    const { onGestureEnd } = attachPanZoom.mock.calls[0][2];
    onGestureEnd("wheel");
    onGestureEnd("mouse");
    onGestureEnd("touch");
    onGestureEnd("pinch");

    expect(trackEvent.mock.calls).toEqual([
      ["graph_zoom_used", { control: "in" }],
      ["graph_zoom_used", { control: "out" }],
      ["graph_layout_changed", { action: "fit" }],
      ["graph_layout_changed", { action: "reset_layout" }],
      ["graph_zoom_used", { control: "wheel" }],
      ["graph_zoom_used", { control: "pinch" }]
    ]);
    // Reset layout forgets the visit's positions.
    expect(window.sessionStorage.getItem("skillNetwork.positions")).toBeNull();
  });

  it("pans with the arrow keys on the focused graph and shows how", async () => {
    const controls = fakeControls();
    attachPanZoom.mockReturnValue(controls);
    const element = await mountWithData();
    await openGraph(element);
    trackEvent.mockClear();

    const wrapper = element.shadowRoot.querySelector(".graph-wrapper");
    expect(wrapper.getAttribute("tabindex")).toBe("0");
    expect(wrapper.getAttribute("role")).toBe("group");
    expect(wrapper.getAttribute("aria-label")).toBe("Skill graph");
    const hint = element.shadowRoot.querySelector(".pan-hint");
    expect(hint.textContent.trim()).toBe(
      "Arrow keys pan the graph. Fit shows all of it again."
    );
    expect(wrapper.getAttribute("aria-describedby")).toBe(
      hint.getAttribute("id")
    );

    const press = (key, extra = {}) => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...extra
      });
      wrapper.dispatchEvent(event);
      return event;
    };
    expect(press("ArrowRight").defaultPrevented).toBe(true);
    press("ArrowLeft");
    press("ArrowUp");
    press("ArrowDown");
    expect(controls.panBy.mock.calls).toEqual([
      [-40, 0],
      [40, 0],
      [0, 40],
      [0, -40]
    ]);

    // Other keys, and arrows with a modifier, are left to the page.
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(press("ArrowDown", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(controls.panBy).toHaveBeenCalledTimes(4);

    // One event per focus, however many presses.
    expect(trackEvent.mock.calls).toEqual([
      ["graph_zoom_used", { control: "keyboard" }]
    ]);
    wrapper.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    press("ArrowRight");
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });

  it("keeps the graph out of the tab order when the library has no d3-zoom", async () => {
    const element = await mountWithData();
    await openGraph(element);

    const wrapper = element.shadowRoot.querySelector(".graph-wrapper");
    expect(wrapper.getAttribute("tabindex")).toBe("-1");
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true
    });
    wrapper.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("detaches zoom when the matrix opens and starts the next graph fitted", async () => {
    const first = fakeControls();
    const second = fakeControls();
    attachPanZoom.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const element = await mountWithData();
    await openGraph(element);
    const fit = firstFit(first);
    attachPanZoom.mock.calls[0][2].onZoom({ x: -10, y: -10, k: 2 });
    await flushPromises();

    switchButton(element, "matrix").click();
    await flushPromises();
    expect(first.detach).toHaveBeenCalledTimes(1);

    await openGraph(element);
    expect(attachPanZoom).toHaveBeenCalledTimes(2);
    expect(
      element.shadowRoot
        .querySelector(".graph-viewport")
        .getAttribute("transform")
    ).toBe(transformOf(fit));
  });

  // Persona filter. The test wire adapter hands every graphql wire the same payload,
  // so a payload with tags reaches both the skills query and the persona query.
  function taggedPayload() {
    const data = buildPayload();
    const tags = {
      a01S1: "Developer;Architect",
      a01S2: "Developer",
      a01S4: "Architect;Admin"
    };
    data.uiapi.query.Skill__c.edges.forEach((edge) => {
      edge.node.Persona_Tag__c = { value: tags[edge.node.Id] || null };
    });
    return data;
  }

  async function mountTagged() {
    const element = mount();
    graphql.emit({ data: taggedPayload(), errors: undefined });
    await flushPromises();
    return element;
  }

  function personaButton(element, label) {
    return [...element.shadowRoot.querySelectorAll(".persona-button")].find(
      (button) => button.textContent.trim() === label
    );
  }

  function chipNames(element) {
    return [...element.shadowRoot.querySelectorAll(".chip-name")].map(
      (node) => node.textContent
    );
  }

  it("shows no persona filter while no skill is tagged", async () => {
    const element = await mountWithData();

    expect(element.shadowRoot.querySelector(".persona-filter")).toBeNull();
    expect(count(element, "button.chip")).toBe(5);
  });

  it("shows the resume's personas once a skill is tagged, All first and pressed", async () => {
    const element = await mountTagged();

    const group = element.shadowRoot.querySelector(".persona-filter");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Filter skills by persona");
    const buttons = [...group.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent.trim())).toEqual([
      "All",
      "Platform Architect",
      "Salesforce Developer",
      "System Admin"
    ]);
    expect(
      buttons.map((button) => button.getAttribute("aria-pressed"))
    ).toEqual(["true", "false", "false", "false"]);
    expect(count(element, "button.chip")).toBe(5);
  });

  it("filters the matrix to the chosen persona, drops empty categories and tracks the change", async () => {
    const element = await mountTagged();

    personaButton(element, "Platform Architect").click();
    await flushPromises();

    expect(chipNames(element)).toEqual(["Apex", "Data Cloud"]);
    expect(
      [...element.shadowRoot.querySelectorAll(".row-name")].map(
        (node) => node.textContent
      )
    ).toEqual(["Backend", "Data"]);
    expect(
      personaButton(element, "Platform Architect").getAttribute("aria-pressed")
    ).toBe("true");
    const summary = element.shadowRoot.querySelector(".persona-summary");
    expect(summary.getAttribute("aria-live")).toBe("polite");
    expect(summary.textContent).toBe(
      "Showing 2 of 5 skills for Platform Architect."
    );
    expect(trackEvent).toHaveBeenCalledWith("skills_persona_filtered", {
      persona: "Architect"
    });

    personaButton(element, "All").click();
    await flushPromises();
    expect(count(element, "button.chip")).toBe(5);
    expect(trackEvent).toHaveBeenCalledWith("skills_persona_filtered", {
      persona: "All"
    });
  });

  it("closes a selected skill the persona hides and says when a persona has no skill", async () => {
    const data = taggedPayload();
    data.uiapi.query.Skill__c.edges.forEach((edge) => {
      if (edge.node.Persona_Tag__c.value) {
        edge.node.Persona_Tag__c.value = edge.node.Persona_Tag__c.value
          .split(";")
          .filter((tag) => tag !== "Admin")
          .join(";");
      }
    });
    const element = mount();
    graphql.emit({ data, errors: undefined });
    await flushPromises();

    chipByName(element, "Flow").click();
    await flushPromises();
    expect(element.shadowRoot.querySelector(".selection-panel")).not.toBeNull();

    personaButton(element, "Salesforce Developer").click();
    await flushPromises();
    expect(element.shadowRoot.querySelector(".selection-panel")).toBeNull();
    expect(chipNames(element)).toEqual(["Lightning Web Components", "Apex"]);

    personaButton(element, "System Admin").click();
    await flushPromises();
    expect(count(element, "button.chip")).toBe(0);
    expect(
      element.shadowRoot.querySelector(".persona-empty").textContent
    ).toContain("No skill is tagged for this persona yet.");
  });

  function drawnNodeIds(element) {
    return [...element.shadowRoot.querySelectorAll(".graph-node")].map(
      (node) => node.dataset.id
    );
  }

  it("shows the persona filter on the graph and draws only the persona's skills", async () => {
    const element = await mountTagged();
    await openGraph(element);
    expect(element.shadowRoot.querySelector(".persona-filter")).not.toBeNull();
    expect(drawnNodeIds(element)).toHaveLength(EXPECTED.nodes);
    expect(count(element, ".category-label")).toBe(EXPECTED.categories);
    trackEvent.mockClear();

    personaButton(element, "Platform Architect").click();
    await flushPromises();

    const ids = drawnNodeIds(element);
    // Apex and Data Cloud, plus every role and project.
    expect(ids.filter((id) => id.startsWith("a01S")).sort()).toEqual([
      "a01S1",
      "a01S4"
    ]);
    expect(ids).toHaveLength(EXPECTED.nodes - 3);
    expect(
      [...element.shadowRoot.querySelectorAll(".category-label")].map((node) =>
        node.textContent.trim()
      )
    ).toEqual(expect.arrayContaining(["Backend", "Data"]));
    expect(count(element, ".category-label")).toBe(2);
    expect(
      element.shadowRoot.querySelector(".persona-summary").textContent
    ).toBe("Showing 2 of 5 skills for Platform Architect.");
    expect(trackEvent).toHaveBeenCalledWith("skills_persona_filtered", {
      persona: "Architect"
    });
    expect(layoutGraph).toHaveBeenCalledTimes(1);

    // The Architect role links Apex and LWC. LWC is hidden, so only Apex shows.
    graphNode(element, "a05R2").dispatchEvent(new CustomEvent("click"));
    await flushPromises();
    expect(count(element, ".graph-edge")).toBe(1);
    expect(
      element.shadowRoot.querySelector(".graph-selection").textContent
    ).toContain("Architect: Apex.");

    // The text list follows the same rule.
    expect(count(element, ".network-node")).toBe(EXPECTED.nodes - 3);

    personaButton(element, "All").click();
    await flushPromises();
    expect(drawnNodeIds(element)).toHaveLength(EXPECTED.nodes);
    expect(count(element, ".category-label")).toBe(EXPECTED.categories);
  });

  it("clears a graph node the persona hides and binds drag to the nodes it draws", async () => {
    const element = await mountTagged();
    await openGraph(element);
    graphNode(element, "a01S3").dispatchEvent(new CustomEvent("click"));
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(".graph-selection").textContent
    ).toContain("Flow:");
    attachNodeDrag.mockClear();

    personaButton(element, "Salesforce Developer").click();
    await flushPromises();
    expect(graphNode(element, "a01S3")).toBeNull();
    expect(
      element.shadowRoot.querySelector(".graph-selection").textContent
    ).toBe("");
    expect(attachNodeDrag).toHaveBeenCalledTimes(1);
    expect(
      [...attachNodeDrag.mock.calls[0][1]].map((node) => node.dataset.id)
    ).toEqual(drawnNodeIds(element));
  });

  it("says on the graph when a persona has no skill", async () => {
    const data = taggedPayload();
    data.uiapi.query.Skill__c.edges.forEach((edge) => {
      if (edge.node.Persona_Tag__c.value) {
        edge.node.Persona_Tag__c.value = edge.node.Persona_Tag__c.value
          .split(";")
          .filter((tag) => tag !== "Admin")
          .join(";");
      }
    });
    const element = mount();
    graphql.emit({ data, errors: undefined });
    await flushPromises();
    await openGraph(element);

    personaButton(element, "System Admin").click();
    await flushPromises();
    expect(drawnNodeIds(element).filter((id) => id.startsWith("a01S"))).toEqual(
      []
    );
    expect(count(element, ".category-label")).toBe(0);
    expect(
      element.shadowRoot.querySelector(".persona-empty").textContent
    ).toContain("No skill is tagged for this persona yet.");
  });

  it("uses the resume builder's persona labels and values in the same order", () => {
    const read = (folder, file) =>
      fs.readFileSync(path.join(__dirname, "..", "..", folder, file), "utf8");
    const options = (text) =>
      [...text.matchAll(/\{ label: "([^"]+)", value: "([^"]+)" \}/g)].map(
        (match) => `${match[1]}=${match[2]}`
      );
    const resume = options(read("resumeBuilder", "resumeBuilder.js"));
    const skills = options(read("skillNetwork", "skillNetwork.js"));

    expect(resume).toHaveLength(3);
    expect(skills).toEqual(resume);
  });

  it("uses no hex colours in its CSS, template or JavaScript", () => {
    const folder = path.join(__dirname, "..");
    ["skillNetwork.css", "skillNetwork.js", "skillNetwork.html"].forEach(
      (file) => {
        const text = fs.readFileSync(path.join(folder, file), "utf8");
        expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      }
    );
  });
  // Certifications and evidence. The Apex wire hands over the certification links.
  async function mountWithCertifications() {
    const element = await mountWithData();
    getCertificationLinks.emit(JSON.parse(JSON.stringify(CERTIFICATIONS)));
    await flushPromises();
    return element;
  }

  it("draws each certification on the outer ring, a retired one marked retired", async () => {
    const element = await mountWithCertifications();
    await openGraph(element);

    const [, nodes, , options] = layoutGraph.mock.calls[0];
    const certifications = nodes.filter(
      (node) => node.kind === "certification"
    );
    expect(certifications.map((node) => node.id).sort()).toEqual([
      "a01C1",
      "a01C2"
    ]);
    // One outer ring holds roles, then projects, then certifications, at one radius.
    const centre = options.width / 2;
    const radius = (key) =>
      Math.hypot(
        options.anchors[key].x - centre,
        options.anchors[key].y - centre
      );
    expect(radius("work:a01C1")).toBeCloseTo(radius("work:a05R1"));
    expect(radius("work:a01C2")).toBeCloseTo(radius("work:a0AP1"));

    const retired = graphNode(element, "a01C2");
    expect(retired.getAttribute("class")).toContain("node-certification");
    expect(retired.getAttribute("class")).toContain("is-retired");
    expect(retired.querySelector("title").textContent).toBe(
      "Salesforce Certified AI Associate (Certification, retired)"
    );
    // The label leaves out the shared opening words.
    expect(retired.querySelector(".node-label").textContent.trim()).toBe(
      "AI Associate"
    );
    expect(graphNode(element, "a01C1").getAttribute("class")).not.toContain(
      "is-retired"
    );
    expect(count(element, ".graph-node")).toBe(EXPECTED.nodes + 2);
  });

  it("carries the kinds of evidence on each skill at rest and on its lines when shown", async () => {
    const element = await mountWithCertifications();
    await openGraph(element);
    const classOf = (id) => graphNode(element, id).getAttribute("class");

    // Apex: roles, projects and a certification. LWC: roles and projects. Flow: a role.
    // Data Cloud: a role and a certification. Agentforce: a project and a retired one.
    expect(classOf("a01S1")).toContain("evidence-3");
    expect(classOf("a01S2")).toContain("evidence-2");
    expect(classOf("a01S3")).toContain("evidence-1");
    expect(classOf("a01S4")).toContain("evidence-2");
    expect(classOf("a01S5")).toContain("evidence-2");
    expect(
      graphNode(element, "a01S1").querySelector(".evidence-ring")
    ).not.toBeNull();
    expect(
      Number(
        graphNode(element, "a01S1")
          .querySelector(".evidence-ring")
          .getAttribute("r")
      )
    ).toBeGreaterThan(
      Number(
        graphNode(element, "a01S1").querySelector(".node-dot").getAttribute("r")
      )
    );

    graphNode(element, "a01S1").dispatchEvent(new CustomEvent("mouseenter"));
    await flushPromises();
    const edges = [...element.shadowRoot.querySelectorAll(".graph-edge")];
    expect(edges).toHaveLength(5);
    edges.forEach((edge) =>
      expect(edge.getAttribute("class")).toBe("graph-edge edge-weight-3")
    );
    graphNode(element, "a01S1").dispatchEvent(new CustomEvent("mouseleave"));
    graphNode(element, "a01S3").dispatchEvent(new CustomEvent("mouseenter"));
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(".graph-edge").getAttribute("class")
    ).toBe("graph-edge edge-weight-1");
  });

  it("says the evidence in words in the graph, the detail and the text list, and shows a legend", async () => {
    const element = await mountWithCertifications();
    await openGraph(element);

    graphNode(element, "a01S1").dispatchEvent(new CustomEvent("click"));
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(".graph-selection").textContent.trim()
    ).toBe(
      "Apex: Architect, Senior Developer, Employer Hub, Portfolio, Salesforce Certified Platform Developer. Backed by a role, a project and a certification."
    );
    graphNode(element, "a01C2").dispatchEvent(new CustomEvent("click"));
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(".graph-selection").textContent.trim()
    ).toBe("Salesforce Certified AI Associate (retired): Agentforce.");

    const listed = [...element.shadowRoot.querySelectorAll(".network-node")];
    expect(
      listed.find((item) => item.textContent.startsWith("Agentforce,"))
        .textContent
    ).toContain("Backed by a project and a retired certification.");
    expect(
      listed.find((item) =>
        item.textContent.startsWith("Salesforce Certified AI")
      ).textContent
    ).toContain("Certification, retired.");

    const legend = element.shadowRoot.querySelector(".graph-legend");
    expect(legend.getAttribute("aria-label")).toBe("Graph legend");
    const items = [...legend.querySelectorAll(".legend-item")].map((item) =>
      item.textContent.replace(/\s+/g, " ").trim()
    );
    expect(items).toEqual([
      "Skill",
      "Role",
      "Project",
      "Certification",
      "Retired certification",
      "A heavier ring and line: more kinds of evidence (a role, a project, a certification) back the skill."
    ]);
  });

  it("keeps two kinds of node and no certification legend when the certifications fail to load", async () => {
    const element = await mountWithData();
    getCertificationLinks.error({ body: { message: "No access" } });
    await flushPromises();
    await openGraph(element);

    expect(count(element, ".node-certification")).toBe(0);
    expect(count(element, ".graph-node")).toBe(EXPECTED.nodes);
    const items = [
      ...element.shadowRoot.querySelectorAll(".graph-legend .legend-item")
    ].map((item) => item.textContent.trim());
    expect(items).not.toContain("Certification");
    expect(element.shadowRoot.querySelector(".state-error")).toBeNull();
  });

  it("lays the graph out again when the certifications arrive after it opened", async () => {
    const element = await mountWithData();
    await openGraph(element);
    expect(layoutGraph).toHaveBeenCalledTimes(1);

    getCertificationLinks.emit(JSON.parse(JSON.stringify(CERTIFICATIONS)));
    await flushPromises();
    expect(layoutGraph).toHaveBeenCalledTimes(2);
    expect(count(element, ".node-certification")).toBe(2);
  });

  it("opens the detail under the clicked row, moves focus to its heading and lists the certifications", async () => {
    const element = await mountWithCertifications();
    const scrolled = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrolled;

    chipByName(element, "Data Cloud").click();
    await flushPromises();

    const rows = [...element.shadowRoot.querySelectorAll(".matrix-row")];
    const dataRow = rows.find(
      (row) => row.querySelector(".row-name").textContent === "Data"
    );
    const panel = dataRow.querySelector(".selection-panel");
    expect(panel).not.toBeNull();
    expect(
      element.shadowRoot.querySelectorAll(".selection-panel")
    ).toHaveLength(1);
    const heading = panel.querySelector(".selection-title");
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(element.shadowRoot.activeElement).toBe(heading);
    expect(scrolled).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "auto"
    });
    expect(panel.querySelector(".selection-evidence").textContent).toBe(
      "Backed by a role and a certification."
    );
    expect(
      [...panel.querySelectorAll(".selection-certifications li")].map(
        (li) => li.textContent
      )
    ).toEqual(["Salesforce Certified Platform Developer"]);

    panel.querySelector(".selection-close").click();
    await flushPromises();
    expect(element.shadowRoot.querySelector(".selection-panel")).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      chipByName(element, "Data Cloud")
    );
    delete window.HTMLElement.prototype.scrollIntoView;
  });

  it("scrolls the detail in smoothly when motion is not reduced", async () => {
    setMotion({ reduced: false });
    const element = await mountWithData();
    const scrolled = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrolled;

    chipByName(element, "Apex").click();
    await flushPromises();
    expect(scrolled).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth"
    });
    delete window.HTMLElement.prototype.scrollIntoView;
  });

  it("names a skill with no evidence plainly", async () => {
    const data = buildPayload();
    data.uiapi.query.Project_Skill__c.edges =
      data.uiapi.query.Project_Skill__c.edges.filter(
        (edge) => edge.node.Skill__c.value !== "a01S5"
      );
    const element = mount();
    graphql.emit({ data, errors: undefined });
    await flushPromises();

    chipByName(element, "Agentforce").click();
    await flushPromises();
    const panel = element.shadowRoot.querySelector(".selection-panel");
    expect(panel.querySelector(".selection-evidence")).toBeNull();
    expect(panel.querySelector(".selection-none").textContent.trim()).toBe(
      "No role, project or certification is linked to this skill yet."
    );
  });

  it("keeps the persona summary's line while it is empty", async () => {
    const element = await mountTagged();

    const summary = element.shadowRoot.querySelector(".persona-summary");
    expect(summary).not.toBeNull();
    expect(summary.textContent).toBe("");
  });

  it("fades the chips that drop out on a persona change, then removes them", async () => {
    setMotion({ reduced: false });
    const element = await mountTagged();

    personaButton(element, "Platform Architect").click();
    await flushPromises();
    // Apex and Data Cloud stay. The other three fade, and are not buttons any more.
    expect(chipNames(element)).toEqual(["Apex", "Data Cloud"]);
    const leaving = [
      ...element.shadowRoot.querySelectorAll(".chip-item.is-leaving")
    ];
    expect(leaving.map((item) => item.textContent.trim()).sort()).toEqual([
      "Agentforce",
      "Flow",
      "Lightning Web Components"
    ]);
    leaving.forEach((item) =>
      expect(
        item.querySelector(".chip-ghost").getAttribute("aria-hidden")
      ).toBe("true")
    );
    expect(
      element.shadowRoot.querySelector(".matrix-row.is-leaving")
    ).not.toBeNull();

    jest.advanceTimersByTime(200);
    await flushPromises();
    expect(count(element, ".chip-item.is-leaving")).toBe(0);
    expect(count(element, ".matrix-row")).toBe(2);

    personaButton(element, "All").click();
    await flushPromises();
    expect(count(element, ".chip-item.is-entering")).toBe(3);
    jest.advanceTimersByTime(200);
    await flushPromises();
    expect(count(element, ".chip-item.is-entering")).toBe(0);
  });
});

describe("c-skill-network evidence words and label placement", () => {
  it("names each kind once, in order, with a retired certification called so", () => {
    const certifications = new Map([
      ["c1", { id: "c1", isRetired: false }],
      ["c2", { id: "c2", isRetired: true }]
    ]);
    const skill = (roles, projects, certs) => ({
      roleIds: roles,
      projectIds: projects,
      certificationIds: certs
    });
    expect(evidenceSentence(skill(["r1", "r2"], [], []), certifications)).toBe(
      "Backed by a role."
    );
    expect(evidenceSentence(skill(["r1"], ["p1"], []), certifications)).toBe(
      "Backed by a role and a project."
    );
    expect(
      evidenceSentence(skill(["r1"], ["p1"], ["c1", "c2"]), certifications)
    ).toBe("Backed by a role, a project and a certification.");
    expect(evidenceSentence(skill([], [], ["c2"]), certifications)).toBe(
      "Backed by a retired certification."
    );
    expect(evidenceSentence(skill([], [], []), certifications)).toBe("");
  });

  it("puts a label where it covers no other label or node, and the outward side first", () => {
    const circles = [
      { id: "a", x: 100, y: 100, r: 10 },
      { id: "b", x: 140, y: 100, r: 10 },
      { id: "c", x: 300, y: 100, r: 10 }
    ];
    const placed = placeLabels(
      [
        { id: "a", text: "Alpha", x: 100, y: 100, r: 10 },
        { id: "c", text: "Gamma", x: 300, y: 100, r: 10 }
      ],
      circles,
      [],
      { x: 200, y: 200 }
    );
    // a sits left of centre, so its label goes left. c sits right, so right.
    expect(placed.get("a").anchor).toBe("end");
    expect(placed.get("c").anchor).toBe("start");

    // With b on its left too, a's label moves above or below.
    const crowded = placeLabels(
      [{ id: "b", text: "Beta label", x: 140, y: 100, r: 10 }],
      circles,
      [{ left: 150, right: 260, top: 90, bottom: 110 }],
      { x: 200, y: 200 }
    );
    expect(crowded.get("b").anchor).toBe("middle");
  });
});
