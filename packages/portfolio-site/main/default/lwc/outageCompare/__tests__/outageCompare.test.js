/**
 * @description       : Unit tests for the outageCompare LWC. It is static markup fed by four
 *                      public properties, so the tests set them and read the rendered text.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/29/2026
 **/
import { createElement } from "@lwc/engine-dom";
import OutageCompare, { WORDING, formatAge, countOf } from "c/outageCompare";

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

async function mount(props) {
  const element = createElement("c-outage-compare", { is: OutageCompare });
  Object.assign(element, props);
  document.body.appendChild(element);
  await flushPromises();
  return element;
}

function q(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function stepTexts(element) {
  return [...element.shadowRoot.querySelectorAll("ol li .step-text")].map(
    (span) => span.textContent.trim()
  );
}

describe("c-outage-compare", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("keeps every visible string in one frozen WORDING constant", () => {
    expect(Object.isFrozen(WORDING)).toBe(true);
  });

  it("writes the Jira wording for the roadmap", async () => {
    const element = await mount({
      source: "Jira",
      subject: "the roadmap",
      ageMinutes: 12,
      failureThreshold: 3,
      openMinutes: 30
    });
    expect(q(element, '[data-id="failure-line"]').textContent.trim()).toBe(
      "Couldn't load the roadmap. Jira didn't answer."
    );
    const steps = stepTexts(element);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toBe("The switch is on, so no call was made to Jira.");
    expect(steps[1]).toContain("the refresh that calls Jira fails");
    expect(steps[1]).toContain(
      "After 3 failures in a row it opens for 30 minutes"
    );
    expect(steps[2]).toBe("The roadmap shows the copy saved 12 min ago.");
  });

  it("writes the GitHub wording for Latest Updates", async () => {
    const element = await mount({
      source: "GitHub",
      subject: "Latest Updates",
      ageMinutes: 4,
      failureThreshold: 3,
      openMinutes: 30
    });
    expect(q(element, '[data-id="failure-line"]').textContent.trim()).toBe(
      "Couldn't load Latest Updates. GitHub didn't answer."
    );
    const steps = stepTexts(element);
    expect(steps[0]).toBe("The switch is on, so no call was made to GitHub.");
    expect(steps[1]).toContain("calls GitHub");
    expect(steps[2]).toBe("Latest Updates shows the copy saved 4 min ago.");
  });

  it("builds step two from the numbers the feed carries", async () => {
    const element = await mount({
      source: "Jira",
      subject: "the roadmap",
      failureThreshold: 5,
      openMinutes: 45
    });
    expect(stepTexts(element)[1]).toBe(
      "In a real outage, the refresh that calls Jira fails and the breaker counts it. After 5 failures in a row it opens for 45 minutes, and the refresh stops calling Jira until then."
    );
  });

  it("reads step two without the numbers when the feed has none", async () => {
    const element = await mount({ source: "Jira", subject: "the roadmap" });
    const text = stepTexts(element)[1];
    expect(text).toBe(
      "In a real outage, the refresh that calls Jira fails and the breaker counts it. After repeated failures in a row it opens, and the refresh stops calling Jira until then."
    );
    expect(text).not.toMatch(/\d/);
  });

  it("leaves out only the number that is missing or not a whole count", async () => {
    const noMinutes = await mount({
      source: "GitHub",
      subject: "Latest Updates",
      failureThreshold: 4
    });
    expect(stepTexts(noMinutes)[1]).toContain(
      "After 4 failures in a row it opens, and the refresh"
    );
    const noThreshold = await mount({
      source: "GitHub",
      subject: "Latest Updates",
      failureThreshold: 0,
      openMinutes: 20
    });
    expect(stepTexts(noThreshold)[1]).toContain(
      "After repeated failures in a row it opens for 20 minutes, and"
    );
  });

  it("countOf accepts whole counts of 1 or more only", () => {
    expect(countOf(3)).toBe(3);
    expect(countOf("30")).toBe(30);
    expect(countOf(0)).toBeNull();
    expect(countOf(-1)).toBeNull();
    expect(countOf(2.5)).toBeNull();
    expect(countOf(null)).toBeNull();
    expect(countOf(undefined)).toBeNull();
    expect(countOf("")).toBeNull();
    expect(countOf("abc")).toBeNull();
  });

  it("takes the age from ageMinutes first, then from fetchedAt", async () => {
    const withMinutes = await mount({
      source: "Jira",
      subject: "the roadmap",
      ageMinutes: 0,
      fetchedAt: "2020-01-01T00:00:00.000Z"
    });
    expect(stepTexts(withMinutes)[2]).toContain("saved 0 min ago");

    const fetchedAt = new Date(Date.now() - 30 * 60000 - 5000).toISOString();
    const fromDate = await mount({
      source: "Jira",
      subject: "the roadmap",
      fetchedAt
    });
    expect(stepTexts(fromDate)[2]).toContain("saved 30 min ago");
  });

  it("formatAge says earlier when it has neither value", () => {
    expect(formatAge(undefined, undefined)).toBe(WORDING.ageUnknown);
    expect(formatAge(null, "not a date")).toBe(WORDING.ageUnknown);
    expect(formatAge(7, null)).toBe("7 min ago");
  });

  it("labels the illustration for sight and for screen readers", async () => {
    const element = await mount({ source: "Jira", subject: "the roadmap" });
    expect(q(element, '[data-id="illustration-label"]').textContent).toContain(
      "Illustration only"
    );
    const illustration = q(element, '[data-id="illustration"]');
    expect(illustration.getAttribute("role")).toBe("img");
    expect(illustration.getAttribute("aria-label")).toBe(
      WORDING.withoutLabelSr
    );
    expect(WORDING.withoutLabelSr).toContain("not a real error");
    // The fake error line is hidden from the reader, so it is never announced as an error.
    expect(
      q(element, '[data-id="failure-line"]').getAttribute("aria-hidden")
    ).toBe("true");
  });

  it("shows each step's number as visible text and hides it from readers", async () => {
    const element = await mount({ source: "Jira", subject: "the roadmap" });
    const numbers = [
      ...element.shadowRoot.querySelectorAll("ol li .step-number")
    ];
    expect(numbers.map((n) => n.textContent.trim())).toEqual(["1", "2", "3"]);
    numbers.forEach((n) => expect(n.getAttribute("aria-hidden")).toBe("true"));
  });

  it("has both headings, with the steps as a numbered list", async () => {
    const element = await mount({ source: "Jira", subject: "the roadmap" });
    const headings = [...element.shadowRoot.querySelectorAll("h4")].map((h) =>
      h.textContent.trim()
    );
    expect(headings).toEqual(["Without resilience", "With resilience"]);
    expect(q(element, "ol")).not.toBeNull();
  });

  it("falls back to plain words when source and subject are missing", async () => {
    const element = await mount({});
    expect(stepTexts(element)[0]).toBe(
      "The switch is on, so no call was made to the source."
    );
    expect(stepTexts(element)[2]).toBe(
      "This panel shows the copy saved earlier."
    );
  });
});
