/**
 * @description       : Unit tests for skillNetwork LWC on the Large form factor (the Jest default). Covers the
 *                      matrix, the years rule, chip selection, the view switch, the lazy graph and its engine
 *                      load, the accessible list, the analytics calls and the no hex rule (Round 5 plan M2).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SkillNetwork from "c/skillNetwork";
// Same module as the component, which the Round 3 plan pins.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { graphql } from "lightning/uiGraphQLApi";
import { loadGraphEngine, layoutGraph } from "c/graphEngine";
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
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.useRealTimers();
    jest.clearAllMocks();
    delete window.matchMedia;
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
