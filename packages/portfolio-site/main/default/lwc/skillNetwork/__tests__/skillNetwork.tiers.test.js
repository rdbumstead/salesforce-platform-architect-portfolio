/**
 * @description       : Unit tests for the skill tiers on the Skills page: the native radio
 *                      choice, Core as the default view, widening to Core and Extended and then
 *                      to every skill, the polite count, the evidence rule with certification
 *                      links, the empty state, the persona filter beside it, and the graph's list.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/14/2026
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
import getCertificationLinks from "@salesforce/apex/SkillGraphController.getCertificationLinks";

const PAYLOAD = require("./data/skillNetworkPayload.json");

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

// The payload's links: Apex has two roles and two projects (4), LWC (shown as Lightning Web
// Components) a role and a project (2), Flow one role, Data Cloud one role and Agentforce one
// project.
// Priorities: Apex 1 and LWC 1 (Core), Flow 1 with one link (Extended), Data Cloud 3 (Full
// toolkit), Agentforce blank (2, Extended).
const PRIORITIES = {
  a01S1: "1",
  a01S2: "1",
  a01S3: "1",
  a01S4: "3",
  a01S5: null
};

// The test wire adapter hands every graphql wire the same payload, so the priorities ride on
// the skill rows and reach the tier query.
function payload(priorities = PRIORITIES, tags = {}) {
  const data = JSON.parse(JSON.stringify(PAYLOAD));
  data.uiapi.query.Skill__c.edges.forEach((edge) => {
    if (priorities) {
      edge.node.Selection_Priority__c = {
        value:
          priorities[edge.node.Id] === undefined
            ? null
            : priorities[edge.node.Id]
      };
    }
    edge.node.Persona_Tag__c = { value: tags[edge.node.Id] || null };
  });
  return data;
}

async function flushPromises() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

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

async function mount(data = payload()) {
  const element = createElement("c-skill-network", { is: SkillNetwork });
  document.body.appendChild(element);
  graphql.emit({ data, errors: undefined });
  await flushPromises();
  return element;
}

function chipNames(element) {
  return [...element.shadowRoot.querySelectorAll(".chip-name")].map(
    (node) => node.textContent
  );
}

function radios(element) {
  return [...element.shadowRoot.querySelectorAll("input.tier-input")];
}

async function choose(element, value) {
  const radio = radios(element).find((input) => input.value === value);
  radio.checked = true;
  radio.dispatchEvent(new CustomEvent("change"));
  await flushPromises();
}

function summary(element) {
  return element.shadowRoot.querySelector(".persona-summary").textContent;
}

describe("c-skill-network tiers", () => {
  beforeEach(() => {
    window.matchMedia = jest.fn((query) => ({
      matches: query.includes("reduce")
    }));
    loadGraphEngine.mockResolvedValue({ forceSimulation: jest.fn() });
    layoutGraph.mockImplementation(fakeLayout);
    attachPanZoom.mockReturnValue(undefined);
    attachNodeDrag.mockReturnValue(true);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
    delete window.matchMedia;
  });

  it("shows no tier choice and every skill while no skill has a priority", async () => {
    const element = await mount(payload(null));

    expect(element.shadowRoot.querySelector(".tier-filter")).toBeNull();
    expect(chipNames(element)).toHaveLength(5);
  });

  it("offers the views as native radios under a visible legend, Core chosen", async () => {
    const element = await mount();

    const fieldset = element.shadowRoot.querySelector("fieldset.tier-filter");
    expect(fieldset.querySelector("legend").textContent).toBe("Show skills");
    const inputs = radios(element);
    expect(inputs.map((input) => input.type)).toEqual([
      "radio",
      "radio",
      "radio"
    ]);
    expect(
      inputs.map((input) => input.closest("label").textContent.trim())
    ).toEqual(["Core", "Core and Extended", "Full toolkit"]);
    expect(inputs.map((input) => input.checked)).toEqual([true, false, false]);
    expect(new Set(inputs.map((input) => input.name)).size).toBe(1);
  });

  it("opens on Core: priority 1 with at least two links", async () => {
    const element = await mount();

    expect(chipNames(element).sort()).toEqual([
      "Apex",
      "Lightning Web Components"
    ]);
    expect(summary(element)).toBe("Showing 2 of 5 skills in Core.");
    expect(
      element.shadowRoot
        .querySelector(".persona-summary")
        .getAttribute("aria-live")
    ).toBe("polite");
  });

  it("widens to Core and Extended, then to every skill, and counts each", async () => {
    const element = await mount();

    await choose(element, "extended");
    expect(chipNames(element).sort()).toEqual([
      "Agentforce",
      "Apex",
      "Flow",
      "Lightning Web Components"
    ]);
    expect(summary(element)).toBe(
      "Showing 4 of 5 skills in Core and Extended."
    );

    await choose(element, "full");
    expect(chipNames(element)).toHaveLength(5);
    expect(summary(element)).toBe("Showing 5 of 5 skills.");

    await choose(element, "core");
    expect(chipNames(element).sort()).toEqual([
      "Apex",
      "Lightning Web Components"
    ]);
  });

  it("counts certification links toward Core", async () => {
    const element = await mount(payload({ ...PRIORITIES, a01S5: "1" }));
    expect(chipNames(element)).not.toContain("Agentforce");

    getCertificationLinks.emit([
      {
        id: "a01C2",
        name: "Salesforce Certified AI Associate",
        isRetired: false,
        earnedYear: 2023,
        skillIds: ["a01S5"]
      }
    ]);
    await flushPromises();

    expect(chipNames(element)).toContain("Agentforce");
  });

  it("says so when Core is empty and names the way to every skill", async () => {
    const element = await mount(
      payload({ a01S1: "2", a01S2: "2", a01S3: "2", a01S4: "2", a01S5: "2" })
    );

    expect(chipNames(element)).toEqual([]);
    expect(element.shadowRoot.querySelector(".persona-empty").textContent).toBe(
      "No skill shows in Core yet. Choose Full toolkit to see every skill."
    );
    expect(summary(element)).toBe("Showing 0 of 5 skills in Core.");

    await choose(element, "full");
    expect(chipNames(element)).toHaveLength(5);
    expect(element.shadowRoot.querySelector(".persona-empty")).toBeNull();
  });

  it("closes an open skill the narrower view hides", async () => {
    const element = await mount();
    await choose(element, "full");
    const chip = [...element.shadowRoot.querySelectorAll("button.chip")].find(
      (button) => button.querySelector(".chip-name").textContent === "Flow"
    );
    chip.click();
    await flushPromises();
    expect(element.shadowRoot.querySelector(".selection-panel")).not.toBeNull();

    await choose(element, "core");
    expect(element.shadowRoot.querySelector(".selection-panel")).toBeNull();
  });

  it("applies the persona filter and the tier together in one count", async () => {
    const element = await mount(
      payload(PRIORITIES, { a01S1: "Architect", a01S3: "Architect" })
    );
    const architect = [
      ...element.shadowRoot.querySelectorAll(".persona-button")
    ].find((button) => button.textContent.trim() === "Platform Architect");
    architect.click();
    await flushPromises();

    expect(chipNames(element)).toEqual(["Apex"]);
    expect(summary(element)).toBe(
      "Showing 1 of 5 skills in Core for Platform Architect."
    );

    await choose(element, "extended");
    expect(chipNames(element).sort()).toEqual(["Apex", "Flow"]);
  });

  it("lists only the shown skills in the graph's text list", async () => {
    const element = await mount();
    element.shadowRoot.querySelector('.view-button[data-view="graph"]').click();
    await flushPromises();

    const items = [...element.shadowRoot.querySelectorAll(".network-node")].map(
      (item) => item.textContent
    );
    const skills = items.filter((text) => text.includes(", Skill."));
    expect(skills.map((text) => text.split(",")[0]).sort()).toEqual([
      "Apex",
      "Lightning Web Components"
    ]);
    expect(items.some((text) => text.includes(", Role."))).toBe(true);
  });

  it("never names a tier low, weak or minor", async () => {
    const element = await mount();
    await choose(element, "full");
    const text = element.shadowRoot.textContent.toLowerCase();
    ["low", "weak", "minor"].forEach((word) =>
      expect(text).not.toMatch(new RegExp(`\\b${word}\\b`))
    );
  });
});
