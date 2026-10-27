/**

 * @description       : Unit tests for decisionMatrix. DecisionMatrixController.getMatrix is a

 *                      mocked wire adapter fed with the shipped placeholder scores, so the

 *                      totals here match the records in the nonprofit-literacy package.

 * @author            : Ryan Bumstead

 * @githubRepo        : https://github.com/rdbumstead

 * @portfolio         : https://ryanbumstead.com

 * @Created           : 10/22/2026

 **/

import { readFileSync } from "fs";

import { join } from "path";

import { createElement } from "@lwc/engine-dom";

import DecisionMatrix, {
  computeTotals,
  findFlip,
  leaderKey,
  PLACEHOLDER_BANNER
} from "c/decisionMatrix";

import getMatrix from "@salesforce/apex/DecisionMatrixController.getMatrix";

import { trackEvent } from "c/analyticsService";

import { isReduced } from "c/motionPreference";

import { showMe } from "c/tourShowMe";

jest.mock(
  "c/motionPreference",

  () => ({
    isReduced: jest.fn(() => false),

    scrollBehavior: jest.fn(() => "auto")
  }),

  { virtual: true }
);

jest.mock(
  "@salesforce/apex/DecisionMatrixController.getMatrix",

  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");

    return { default: createApexTestWireAdapter(jest.fn()) };
  },

  { virtual: true }
);

jest.mock(
  "c/analyticsService",

  () => ({
    trackEvent: jest.fn(),

    EVENTS: {
      MATRIX_WEIGHT_CHANGED: "matrix_weight_changed",

      MATRIX_RESET: "matrix_reset"
    }
  }),

  { virtual: true }
);

const OPTIONS = [
  ["NPSP_PMM", "NPSP and PMM", 1],

  ["Education_Cloud", "Education Cloud", 2],

  ["Nonprofit_Cloud", "Nonprofit Cloud", 3]
].map(([developerName, label, sortOrder]) => ({
  developerName,

  label,

  summary: `${label} summary`,

  sortOrder
}));

// Criterion, label, scores for NPSP and PMM, Education Cloud, Nonprofit Cloud.

const ROWS = [
  ["Licence_Cost", "Licence cost at ten users", [5, 2, 2]],

  ["Class_Fit", "Fit to classes and attendance", [5, 2, 5]],

  ["Volunteer_Tutors", "Volunteer tutors", [5, 2, 5]],

  ["Outcome_Reporting", "Outcome and compliance reporting", [2, 5, 5]],

  ["Admin_Capacity", "Admin capacity and adoption risk", [5, 2, 3]],

  ["Fundraising", "Fundraising", [3, 3, 3]],

  ["Product_Direction", "Product direction", [2, 5, 5]],

  ["Person_Model", "Person model", [3, 3, 3]],

  ["Unlicensed_Users", "Users without licences", [3, 3, 3]],

  ["Time_To_Value", "Time to value on a small budget", [5, 2, 3]]
];

function matrix(hasPlaceholders = true) {
  return {
    options: OPTIONS,

    criteria: ROWS.map(([developerName, label], i) => ({
      developerName,

      label,

      description: `${label} description`,

      defaultWeight: 5,

      sortOrder: i + 1
    })),

    scores: ROWS.flatMap(([criterionName, label, scores]) =>
      scores.map((score, i) => ({
        optionName: OPTIONS[i].developerName,

        criterionName,

        score,

        rationale: `PLACEHOLDER: ${label} for ${OPTIONS[i].label}`,

        evidence: "Public source",

        isPlaceholder: hasPlaceholders
      }))
    ),

    hasPlaceholders
  };
}

const DEFAULT_RANKING =
  "1. NPSP and PMM, 2. Nonprofit Cloud, 3. Education Cloud";

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

async function createComponent(data = matrix()) {
  const element = createElement("c-decision-matrix", { is: DecisionMatrix });

  document.body.appendChild(element);

  getMatrix.emit(data);

  await flushPromises();

  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);

const qa = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));

function slider(element, criterion) {
  return q(element, `input.weight-slider[data-criterion="${criterion}"]`);
}

async function moveSlider(element, criterion, value) {
  const input = slider(element, criterion);

  input.value = String(value);

  input.dispatchEvent(new CustomEvent("input"));

  input.dispatchEvent(new CustomEvent("change"));

  await flushPromises();
}

const rankingText = (element) =>
  q(element, '[data-id="ranking"]').textContent.replace(/\s+/g, " ").trim();

describe("c-decision-matrix", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }

    jest.clearAllMocks();
  });

  it("places View source in the card's title row, after the title", async () => {
    const element = await createComponent();

    const control = q(element, ".card-header c-view-source");

    expect(control).not.toBeNull();

    expect(control.sourceKey).toBe("decisionMatrix");

    const title = q(element, ".card-header h3.card-title");

    expect(title.textContent.trim()).toBe("Decision matrix");

    expect(
      title.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    expect(q(element, ".card-tools")).toBeNull();
  });

  it("labels each score and total with its option for the phone cards", async () => {
    const element = await createComponent();

    const labels = qa(element, "td.score-cell summary").map(
      (s) => s.dataset.label
    );

    expect(labels).toHaveLength(30);

    expect(new Set(labels)).toEqual(
      new Set(["NPSP and PMM", "Education Cloud", "Nonprofit Cloud"])
    );

    expect(qa(element, "td.total-cell").map((c) => c.dataset.label)).toEqual([
      "NPSP and PMM",

      "Education Cloud",

      "Nonprofit Cloud"
    ]);
  });

  it("draws its own open marker on the score summary", () => {
    const css = readFileSync(
      join(__dirname, "..", "decisionMatrix.css"),

      "utf8"
    );

    expect(css).toMatch(/\.score-summary::after/);

    expect(css).toMatch(/\.score-details\[open\] > \.score-summary::after/);

    expect(css).toMatch(/max-width:\s*599\.98px/);
  });

  it("tints and tags the leading option, and moves the tint with the lead", async () => {
    const element = await createComponent();

    const leading = () =>
      qa(element, "th.option-head.leading").map((th) =>
        th.querySelector(".option-label").textContent.trim()
      );

    expect(leading()).toHaveLength(1);

    expect(q(element, ".leading-tag").textContent.trim()).toBe("Leading");

    expect(qa(element, "td.total-cell.leading")).toHaveLength(1);

    const before = leading()[0];

    // Nonprofit Cloud now scores highest, ahead of both other options.

    await moveSlider(element, "Product_Direction", 10);

    await moveSlider(element, "Outcome_Reporting", 10);

    await moveSlider(element, "Class_Fit", 10);

    await moveSlider(element, "Volunteer_Tutors", 10);

    await moveSlider(element, "Licence_Cost", 0);

    await moveSlider(element, "Admin_Capacity", 0);

    await moveSlider(element, "Time_To_Value", 0);

    expect(leading()).toHaveLength(1);

    expect(leading()[0]).not.toBe(before);
  });

  it("tints no option when the top two are tied", () => {
    const m = matrix();

    const zero = {};

    m.criteria.forEach((c) => {
      zero[c.developerName] = 0;
    });

    expect(leaderKey(m, computeTotals(m, zero))).toBeNull();
  });

  it("highlights only the totals that change, and again on the next change", async () => {
    const element = await createComponent();

    const flashed = () =>
      qa(element, "td.total-cell")
        .filter((c) => /total-flash-/.test(c.className))

        .map((c) => c.dataset.option);

    expect(flashed()).toEqual([]);

    // Licence_Cost scores 5, 2, 2, so all three totals move.

    await moveSlider(element, "Licence_Cost", 8);

    expect(flashed()).toHaveLength(3);

    const first = q(element, "td.total-cell").className;

    await moveSlider(element, "Licence_Cost", 9);

    expect(q(element, "td.total-cell").className).not.toBe(first);

    // Fundraising scores 3, 3, 3 and Person_Model the same, so a total moves by the same

    // amount for each, and every one still changes.

    await moveSlider(element, "Licence_Cost", 9);

    expect(flashed()).toHaveLength(3);
  });

  it("shows no highlight under reduced motion", async () => {
    isReduced.mockReturnValue(true);

    const element = await createComponent();

    await moveSlider(element, "Licence_Cost", 8);

    expect(
      qa(element, "td.total-cell").filter((c) =>
        /total-flash-/.test(c.className)
      )
    ).toHaveLength(0);

    isReduced.mockReturnValue(false);
  });

  it("keeps the highlight to opacity and switches it off by media query", () => {
    const css = readFileSync(
      join(__dirname, "..", "decisionMatrix.css"),

      "utf8"
    );

    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);

    const frames = css.match(/@keyframes total-highlight-a \{[^]*?\n\}/)[0];

    expect(frames).toMatch(/opacity/);

    expect(frames).not.toMatch(/background|color|width|height|top|left/);
  });

  it("renders an accessible table with a caption, column and row headers", async () => {
    const element = await createComponent();

    const table = q(element, "table");

    expect(table.querySelector("caption").textContent).toContain(
      "Weighted scores for three platform options"
    );

    expect(qa(element, 'thead th[scope="col"]')).toHaveLength(5);

    expect(qa(element, 'tbody th[scope="row"]')).toHaveLength(10);

    expect(qa(element, "details.score-details")).toHaveLength(30);
  });

  it("gives every criterion a labelled native range slider at the default weight", async () => {
    const element = await createComponent();

    const sliders = qa(element, 'input[type="range"]');

    expect(sliders).toHaveLength(10);

    sliders.forEach((input) => {
      expect(input.min).toBe("0");

      expect(input.max).toBe("10");

      expect(input.value).toBe("5");

      expect(input.getAttribute("aria-valuetext")).toBe("5 of 10");

      expect(input.closest("label").textContent).toContain("Weight for ");
    });
  });

  it("shows the rationale and source inside each score cell", async () => {
    const element = await createComponent();

    const first = q(element, "details.score-details");

    expect(first.querySelector("summary").textContent.trim()).toBe("5");

    expect(first.querySelector(".rationale").textContent).toBe(
      "PLACEHOLDER: Licence cost at ten users for NPSP and PMM"
    );

    expect(first.querySelector(".evidence").textContent).toBe(
      "Source: Public source"
    );
  });

  it("ranks the options from the default weights", async () => {
    const element = await createComponent();

    expect(rankingText(element)).toBe(`Ranking: ${DEFAULT_RANKING}`);

    const totals = qa(element, ".total-cell").map((td) =>
      td.textContent.trim()
    );

    expect(totals).toEqual(["190", "145", "185"]);
  });

  it("changes the ranking when a weight moves and sends one event", async () => {
    const element = await createComponent();

    await moveSlider(element, "Product_Direction", 10);

    expect(rankingText(element)).toBe(
      "Ranking: 1. Nonprofit Cloud, 2. NPSP and PMM, 3. Education Cloud"
    );

    expect(
      slider(element, "Product_Direction").getAttribute("aria-valuetext")
    ).toBe("10 of 10");

    expect(trackEvent).toHaveBeenCalledTimes(1);

    expect(trackEvent).toHaveBeenCalledWith("matrix_weight_changed", {
      criterion: "Product_Direction"
    });
  });

  it("resets to the starting weights and the original ranking", async () => {
    const element = await createComponent();

    await moveSlider(element, "Product_Direction", 10);

    await moveSlider(element, "Licence_Cost", 0);

    trackEvent.mockClear();

    q(element, "button.reset-button").click();

    await flushPromises();

    expect(rankingText(element)).toBe(`Ranking: ${DEFAULT_RANKING}`);

    qa(element, 'input[type="range"]').forEach((input) =>
      expect(input.value).toBe("5")
    );

    expect(q(element, "button.reset-button").textContent.trim()).toBe(
      "Reset to the starting weights"
    );

    expect(trackEvent).toHaveBeenCalledTimes(1);

    expect(trackEvent).toHaveBeenCalledWith("matrix_reset", {});
  });

  it("names the criterion whose weight change would first swap the top two", async () => {
    const element = await createComponent();

    const text = q(element, '[data-id="sensitivity"]').textContent;

    expect(text).toContain(
      "Moving the weight of Licence cost at ten users from 5 to 3 would put Nonprofit Cloud ahead of NPSP and PMM."
    );
  });

  it("says so when no single weight can swap the top two", () => {
    const lopsided = matrix();

    lopsided.scores = lopsided.scores.map((s) => ({
      ...s,

      score: s.optionName === "NPSP_PMM" ? 5 : 1
    }));

    const weights = {};

    lopsided.criteria.forEach((c) => {
      weights[c.developerName] = 5;
    });

    expect(findFlip(lopsided, weights)).toBeNull();

    expect(computeTotals(lopsided, weights).NPSP_PMM).toBe(250);
  });

  it("shows the placeholder banner when hasPlaceholders is true", async () => {
    const element = await createComponent(matrix(true));

    const banner = q(element, '[data-id="placeholder-banner"]');

    expect(banner).not.toBeNull();

    expect(banner.textContent.trim()).toBe(PLACEHOLDER_BANNER);

    expect(PLACEHOLDER_BANNER).toBe(
      "Scores and weights are provisional placeholders pending the owner's review."
    );
  });

  it("hides the placeholder banner when hasPlaceholders is false", async () => {
    const element = await createComponent(matrix(false));

    expect(q(element, '[data-id="placeholder-banner"]')).toBeNull();
  });

  it("shows an error line when the matrix cannot load", async () => {
    const element = createElement("c-decision-matrix", { is: DecisionMatrix });

    document.body.appendChild(element);

    getMatrix.error();

    await flushPromises();

    expect(q(element, '[role="alert"]').textContent).toContain(
      "could not load"
    );

    expect(q(element, "table")).toBeNull();
  });

  it("styles only with design tokens, never a hex colour", () => {
    const css = readFileSync(
      join(__dirname, "..", "decisionMatrix.css"),

      "utf8"
    );

    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);

    expect(css).toMatch(/min-height: 44px/);

    expect(css).toMatch(/min-height: 24px/);
  });

  it("marks the first weight control as the tour anchor and answers stop B only", async () => {
    const element = await createComponent();
    const anchors = qa(element, "[data-tour-anchor]");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toBe(qa(element, "input.weight-slider")[0]);
    anchors[0].focus = jest.fn();
    anchors[0].scrollIntoView = jest.fn();

    showMe("A");
    expect(anchors[0].focus).not.toHaveBeenCalled();
    showMe("B");
    expect(anchors[0].scrollIntoView).toHaveBeenCalledTimes(1);
    expect(anchors[0].focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("stops listening for the tour when it leaves the page", async () => {
    const element = await createComponent();
    const anchor = q(element, "[data-tour-anchor]");
    anchor.focus = jest.fn();
    document.body.removeChild(element);

    showMe("B");
    expect(anchor.focus).not.toHaveBeenCalled();
  });
});
