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
import SkillNetwork from "c/skillNetwork";
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
  "c/graphEngine",
  () => ({
    loadGraphEngine: jest.fn(),
    layoutGraph: jest.fn(),
    attachPanZoom: jest.fn(),
    attachNodeDrag: jest.fn()
  }),
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
      GRAPH_ZOOM_USED: "graph_zoom_used"
    }
  }),
  { virtual: true }
);

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
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.useRealTimers();
    jest.clearAllMocks();
    delete window.matchMedia;
  });

  it("places View source with the skillNetwork key at the top of the card (contract P2)", () => {
    const element = mount();

    const control = element.shadowRoot.querySelector(
      ".card-tools c-view-source"
    );
    expect(control).not.toBeNull();
    expect(control.sourceKey).toBe("skillNetwork");
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
      "Agentforce, proficiency 3 of 5"
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
    window.matchMedia = jest.fn(() => ({ matches: true }));
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

  it("wires zoom to the graph once and drives it from three named buttons", async () => {
    const controls = fakeControls();
    attachPanZoom.mockReturnValue(controls);
    const element = await mountWithData();
    await openGraph(element);

    const svg = element.shadowRoot.querySelector(".graph-svg");
    expect(attachPanZoom).toHaveBeenCalledTimes(1);
    const [, target, options] = attachPanZoom.mock.calls[0];
    expect(target).toBe(svg);
    expect(options.extent).toEqual([
      [-150, 0],
      [1110, 840]
    ]);

    const buttons = [
      ...element.shadowRoot.querySelectorAll(".graph-controls button")
    ];
    expect(buttons.map((button) => button.textContent.trim())).toEqual([
      "Zoom in",
      "Zoom out",
      "Reset view"
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
    expect(controls.zoomIn).toHaveBeenCalledTimes(1);
    expect(controls.zoomOut).toHaveBeenCalledTimes(1);
    expect(controls.reset).toHaveBeenCalledTimes(1);

    // Hovering re-renders the graph but binds nothing new.
    graphNode(element, "a01S1").dispatchEvent(new CustomEvent("mouseenter"));
    await flushPromises();
    expect(attachPanZoom).toHaveBeenCalledTimes(1);
    expect(attachNodeDrag).toHaveBeenCalledTimes(1);
  });

  it("draws the zoom transform it is given and says the zoom level", async () => {
    attachPanZoom.mockReturnValue(fakeControls());
    const element = await mountWithData();
    await openGraph(element);
    const viewport = () => element.shadowRoot.querySelector(".graph-viewport");
    const level = () =>
      element.shadowRoot.querySelector(".zoom-level").textContent;

    expect(viewport().getAttribute("transform")).toBe(
      "translate(0,0) scale(1)"
    );
    expect(level()).toBe("Zoom 100%");

    const { onZoom } = attachPanZoom.mock.calls[0][2];
    onZoom({ x: -240, y: -210, k: 1.5 });
    await flushPromises();

    expect(viewport().getAttribute("transform")).toBe(
      "translate(-240,-210) scale(1.5)"
    );
    expect(level()).toBe("Zoom 150%");
    expect(
      element.shadowRoot.querySelector(".zoom-level").getAttribute("aria-live")
    ).toBe("polite");
  });

  it("moves a dragged node and its edges, keeps it in the box, and resets the view", async () => {
    const controls = fakeControls();
    attachPanZoom.mockReturnValue(controls);
    const element = await mountWithData();
    await openGraph(element);

    expect(attachNodeDrag).toHaveBeenCalledTimes(1);
    const [, nodes, options] = attachNodeDrag.mock.calls[0];
    expect(nodes).toHaveLength(EXPECTED.nodes);

    const start = options.position("a01S1");
    const circle = () => graphNode(element, "a01S1").querySelector("circle");
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
    expect(Number(circle().getAttribute("cy"))).toBe(840 - radius);

    element.shadowRoot.querySelector('[data-action="reset"]').click();
    await flushPromises();
    expect(Number(circle().getAttribute("cx"))).toBe(start.x);
    expect(controls.reset).toHaveBeenCalledTimes(1);
  });

  it("pans a little past the drawn box at any zoom and leaves the plain wheel to the page", async () => {
    attachPanZoom.mockReturnValue(fakeControls());
    const element = await mountWithData();
    await openGraph(element);

    const options = attachPanZoom.mock.calls[0][2];
    expect(options.translateExtent).toEqual([
      [-270, -120],
      [1230, 960]
    ]);
    expect(options.ctrlWheel).toBe(true);
    expect(
      element.shadowRoot.querySelector(".graph-hint").textContent
    ).toContain("Ctrl and the mouse wheel");
  });

  it("sends graph_zoom_used for each button and for a wheel gesture, nothing for a drag", async () => {
    attachPanZoom.mockReturnValue(fakeControls());
    const element = await mountWithData();
    await openGraph(element);
    trackEvent.mockClear();

    element.shadowRoot.querySelector('[data-action="zoom-in"]').click();
    element.shadowRoot.querySelector('[data-action="zoom-out"]').click();
    element.shadowRoot.querySelector('[data-action="reset"]').click();
    const { onGestureEnd } = attachPanZoom.mock.calls[0][2];
    onGestureEnd("wheel");
    onGestureEnd("mouse");
    onGestureEnd("touch");

    expect(trackEvent.mock.calls).toEqual([
      ["graph_zoom_used", { control: "in" }],
      ["graph_zoom_used", { control: "out" }],
      ["graph_zoom_used", { control: "reset" }],
      ["graph_zoom_used", { control: "wheel" }]
    ]);
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
      "Arrow keys pan the graph. Reset view centres it again."
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

  it("detaches zoom when the matrix opens and starts the next graph unzoomed", async () => {
    const first = fakeControls();
    const second = fakeControls();
    attachPanZoom.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const element = await mountWithData();
    await openGraph(element);
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
    ).toBe("translate(0,0) scale(1)");
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
});
