/**
 * @description       : Unit tests for governanceEvidence. GovernanceController.getGovernanceEvidence
 *                      is a mocked wire adapter. The tests read the rendered list: the total, a
 *                      deploy row with its commit, permit, approver, checks, tests, coverage and
 *                      run link, a drill row with its deny id and failed check, and the honest
 *                      states for a failed read, an unreadable total and an empty list. They also
 *                      pin the link guards, the tour anchor and the text rules.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/21/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import GovernanceEvidence, {
  TOUR_STOP,
  countText,
  coverageText,
  testsText,
  safeRunUrl,
  commitUrl,
  approverUrl,
  checkRows,
  runView
} from "c/governanceEvidence";
import getGovernanceEvidence from "@salesforce/apex/GovernanceController.getGovernanceEvidence";
import { showMe } from "c/tourShowMe";

jest.mock(
  "@salesforce/apex/GovernanceController.getGovernanceEvidence",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const RUN_URL = "https://github.com/seed-owner/sample-repo/actions/runs/101";

function deploy(overrides = {}) {
  return {
    runId: "d1",
    runUrl: RUN_URL,
    commitSha: SHA,
    completedAt: "2026-11-20T21:40:00.000Z",
    workflow: "deploy",
    status: "Success",
    permitId: "sample-permit-1",
    approver: "seed-owner",
    checks: [
      { rule: "validate_passed", outcome: "pass" },
      { rule: "coverage_min", outcome: "pass" },
      { rule: "separation_of_duties", outcome: "skipped" }
    ],
    testsRun: 122,
    testsPassed: 122,
    coverage: 86.44,
    ...overrides
  };
}

function drill(overrides = {}) {
  return {
    runId: "x1",
    runUrl: "https://github.com/seed-owner/sample-repo/actions/runs/202",
    commitSha: SHA,
    completedAt: "2026-11-21T11:30:00.000Z",
    workflow: "drill",
    status: "Denied",
    permitId: "sample-deny-1",
    approver: null,
    checks: [{ rule: "coverage_min", outcome: "fail" }],
    testsRun: null,
    testsPassed: null,
    coverage: null,
    ...overrides
  };
}

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

function create() {
  const element = createElement("c-governance-evidence", {
    is: GovernanceEvidence
  });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));
const text = (node) => node.textContent.replace(/\s+/g, " ").trim();

async function render(data) {
  const element = create();
  getGovernanceEvidence.emit(data);
  await flushPromises();
  return element;
}

describe("c-governance-evidence helpers", () => {
  it("exposes the tour stop it answers to", () => {
    expect(TOUR_STOP).toBe("F");
  });

  it("formats a whole total and refuses anything else", () => {
    expect(countText(1234)).toBe("1,234");
    expect(countText(0)).toBe("0");
    [null, undefined, "7", 1.5, -1, NaN].forEach((value) => {
      expect(countText(value)).toBeNull();
    });
  });

  it("formats coverage to one decimal and says when it is not recorded", () => {
    expect(coverageText(86.44)).toBe("86.4% coverage");
    expect(coverageText(100)).toBe("100% coverage");
    [null, undefined, "80", NaN, -1, 101].forEach((value) => {
      expect(coverageText(value)).toBe("Coverage not recorded");
    });
  });

  it("formats the tests, with and without a passed count", () => {
    expect(testsText(122, 120)).toBe("122 run, 120 passed");
    expect(testsText(122, null)).toBe("122 run");
    expect(testsText(null, 5)).toBe("Tests not recorded");
  });

  it("links a run only on GitHub", () => {
    expect(safeRunUrl(RUN_URL)).toBe(RUN_URL);
    [
      "http://github.com/x",
      "https://example.com/x",
      "https://github.com/a b",
      'https://github.com/a"b',
      "",
      null
    ].forEach((value) => {
      expect(safeRunUrl(value)).toBeNull();
    });
  });

  it("links a commit only when it is a hash", () => {
    expect(commitUrl(SHA)).toBe(
      `https://github.com/rdbumstead/salesforce-platform-architect-portfolio/commit/${SHA}`
    );
    ["zzzzzzz", "abc", "", null, "a1b2c3d; rm"].forEach((value) => {
      expect(commitUrl(value)).toBeNull();
    });
  });

  it("links an approver only when it is a GitHub login", () => {
    expect(approverUrl("seed-owner")).toBe("https://github.com/seed-owner");
    ["-bad", "bad-", "a--b", "has space", "", null, "a".repeat(40)].forEach(
      (value) => {
        expect(approverUrl(value)).toBeNull();
      }
    );
  });

  it("keeps only checks with a rule and a known outcome", () => {
    expect(checkRows("nope")).toEqual([]);
    const rows = checkRows([
      { rule: "a", outcome: "pass" },
      { rule: "b", outcome: "fail" },
      { rule: "c", outcome: "skipped" },
      { rule: "s", outcome: "satisfied_by_approval" },
      { rule: "w", outcome: "waived_by_config" },
      { rule: "d", outcome: "maybe" },
      { rule: "", outcome: "pass" },
      null
    ]);
    expect(rows.map((row) => [row.rule, row.text, row.failed])).toEqual([
      ["a", "Passed", false],
      ["b", "Failed", true],
      ["c", "Skipped", false],
      ["s", "Approved", false],
      ["w", "Waived", false]
    ]);
  });

  it("builds a view that says what is missing", () => {
    const view = runView(
      {
        workflow: "deploy",
        status: "Weird",
        runUrl: "https://example.com",
        checks: null
      },
      2
    );
    expect(view.key).toBe("run-3");
    expect(view.time).toBe("Date not recorded");
    expect(view.hasTime).toBe(false);
    expect(view.statusText).toBe("Weird");
    expect(view.sha).toBe("not recorded");
    expect(view.id).toBe("not recorded");
    expect(view.approver).toBe("not recorded");
    expect(view.hasRunLink).toBe(false);
    expect(view.hasChecks).toBe(false);
    expect(view.tests).toBe("Tests not recorded");
    expect(view.coverage).toBe("Coverage not recorded");
    expect(runView({ status: "" }, 0).statusText).toBe("Unknown");
  });
});

describe("c-governance-evidence", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("says it is loading before the read answers", () => {
    const element = create();
    expect(text(q(element, '[data-id="loading"]'))).toContain("Loading");
    expect(q(element, '[data-id="total"]')).toBeNull();
  });

  it("labels the section Outcome and draws the running total", async () => {
    const element = await render({ governedTotal: 1234, runs: [deploy()] });
    expect(text(q(element, '[data-id="part-label"]'))).toBe("Outcome");
    expect(text(q(element, "h2"))).toBe("The record from production");
    expect(text(q(element, '[data-id="total-value"]'))).toBe("1,234");
    expect(text(q(element, '[data-id="total"]'))).toBe(
      "1,234 governed production deploys in total"
    );
  });

  it("never draws a zero when the total cannot be read", async () => {
    const element = await render({ governedTotal: null, runs: [deploy()] });
    expect(q(element, '[data-id="total-value"]')).toBeNull();
    expect(text(q(element, '[data-id="total-unread"]'))).toBe(
      "The running total could not be read just now."
    );
    expect(qa(element, '[data-id="deploy"]')).toHaveLength(1);
  });

  it("says plainly that the read failed, and shows no deploy or total", async () => {
    const element = create();
    getGovernanceEvidence.error();
    await flushPromises();
    expect(text(q(element, '[data-id="error"]'))).toBe(
      "The record could not be read. No deploy is shown, and no total is claimed."
    );
    expect(q(element, '[data-id="total"]')).toBeNull();
    expect(q(element, '[data-id="deploys"]')).toBeNull();
    expect(q(element, '[data-id="loading"]')).toBeNull();
  });

  it("draws a deploy with every fact and a link to the run", async () => {
    const element = await render({ governedTotal: 3, runs: [deploy()] });
    const row = q(element, '[data-id="deploy"]');
    expect(text(row.querySelector("time"))).toMatch(/2026/);
    expect(row.querySelector("time").getAttribute("title")).toBe(
      "2026-11-20 21:40 UTC"
    );
    expect(row.querySelector("time").getAttribute("datetime")).toBe(
      "2026-11-20T21:40:00.000Z"
    );
    expect(text(row.querySelector('[data-id="status"]'))).toBe("Success");
    const commit = row.querySelector('[data-id="commit-link"]');
    expect(commit.getAttribute("href")).toBe(
      `https://github.com/rdbumstead/salesforce-platform-architect-portfolio/commit/${SHA}`
    );
    expect(commit.getAttribute("target")).toBe("_blank");
    expect(commit.getAttribute("rel")).toBe("noopener noreferrer");
    expect(text(commit)).toContain("a1b2c3d");
    expect(text(commit)).toContain("opens in a new tab");
    expect(text(row.querySelector('[data-id="permit"]'))).toBe(
      "sample-permit-1"
    );
    const approver = row.querySelector('[data-id="approver-link"]');
    expect(approver.getAttribute("href")).toBe("https://github.com/seed-owner");
    expect(text(row.querySelector('[data-id="tests"]'))).toBe(
      "122 run, 122 passed"
    );
    expect(text(row.querySelector('[data-id="coverage"]'))).toBe(
      "86.4% coverage"
    );
    const checks = Array.from(row.querySelectorAll('[data-id="check"]')).map(
      text
    );
    expect(checks).toEqual([
      "validate_passed Passed",
      "coverage_min Passed",
      "separation_of_duties Skipped"
    ]);
    const run = row.querySelector('[data-id="run-link"]');
    expect(run.getAttribute("href")).toBe(RUN_URL);
    expect(text(run)).toBe("Open the run for commit a1b2c3d on GitHub");
    expect(run.getAttribute("aria-label")).toBeNull();
  });

  it("falls back to plain text for a commit or approver that cannot be linked", async () => {
    const element = await render({
      governedTotal: 1,
      runs: [
        deploy({
          commitSha: "not-a-hash",
          approver: "has space",
          runUrl: "https://example.com/run",
          checks: [],
          completedAt: null,
          testsRun: null,
          coverage: null
        })
      ]
    });
    const row = q(element, '[data-id="deploy"]');
    expect(row.querySelector('[data-id="commit-link"]')).toBeNull();
    expect(row.querySelector('[data-id="approver-link"]')).toBeNull();
    expect(text(row.querySelector('[data-id="approver-text"]'))).toBe(
      "has space"
    );
    expect(row.querySelector('[data-id="run-link"]')).toBeNull();
    expect(row.querySelector("time")).toBeNull();
    expect(text(row.querySelector(".run-time"))).toBe("Date not recorded");
    expect(text(row.querySelector('[data-id="no-checks"]'))).toBe(
      "No checks were recorded for this deploy."
    );
    expect(text(row.querySelector('[data-id="tests"]'))).toBe(
      "Tests not recorded"
    );
    expect(text(row.querySelector('[data-id="coverage"]'))).toBe(
      "Coverage not recorded"
    );
  });

  it("shows a missing commit and permit as not recorded", async () => {
    const element = await render({
      governedTotal: 1,
      runs: [deploy({ commitSha: null, permitId: null, approver: null })]
    });
    const row = q(element, '[data-id="deploy"]');
    expect(text(row.querySelector('[data-id="commit-text"]'))).toBe(
      "not recorded"
    );
    expect(text(row.querySelector('[data-id="permit"]'))).toBe("not recorded");
    expect(text(row.querySelector('[data-id="approver-text"]'))).toBe(
      "not recorded"
    );
  });

  it("draws a drill as a deny with its failed check, never as a permit", async () => {
    const element = await render({
      governedTotal: 1,
      runs: [drill(), deploy()]
    });
    expect(qa(element, '[data-id="deploy"]')).toHaveLength(1);
    const row = q(element, '[data-id="drill"]');
    expect(text(row.querySelector('[data-id="status"]'))).toBe("Denied");
    expect(text(row.querySelector('[data-id="deny"]'))).toBe("sample-deny-1");
    expect(text(row)).not.toMatch(/Permit/);
    expect(text(row.querySelector('[data-id="failed-rule"]'))).toBe(
      "coverage_min"
    );
    expect(text(row.querySelector('[data-id="check"]'))).toBe(
      "coverage_min Failed"
    );
    expect(row.querySelector('[data-id="run-link"]').getAttribute("href")).toBe(
      "https://github.com/seed-owner/sample-repo/actions/runs/202"
    );
    expect(text(q(element, '[data-id="drills-lead"]'))).toContain(
      "never counted in the total above"
    );
  });

  it("says when a drill has no recorded failed check or links", async () => {
    const element = await render({
      governedTotal: 1,
      runs: [drill({ checks: [], runUrl: null, commitSha: null })]
    });
    const row = q(element, '[data-id="drill"]');
    expect(text(row.querySelector('[data-id="failed-unknown"]'))).toBe(
      "not recorded"
    );
    expect(row.querySelector('[data-id="checks"]')).toBeNull();
    expect(row.querySelector('[data-id="run-link"]')).toBeNull();
    expect(row.querySelector('[data-id="commit-text"]')).not.toBeNull();
  });

  it("says plainly when no deploy or drill is on record", async () => {
    const element = await render({ governedTotal: 0, runs: [] });
    expect(text(q(element, '[data-id="total-value"]'))).toBe("0");
    expect(text(q(element, '[data-id="no-deploys"]'))).toBe(
      "No governed deploy is on record yet."
    );
    expect(text(q(element, '[data-id="no-drills"]'))).toBe(
      "No drill is on record yet."
    );
  });

  it("treats a read with no runs list as empty", async () => {
    const element = await render({ governedTotal: 2 });
    expect(q(element, '[data-id="no-deploys"]')).not.toBeNull();
    expect(q(element, '[data-id="deploys"]')).toBeNull();
  });

  it("ignores a run that is neither a deploy nor a drill", async () => {
    const element = await render({
      governedTotal: 1,
      runs: [null, { workflow: "other" }, deploy()]
    });
    expect(qa(element, '[data-id="deploy"]')).toHaveLength(1);
    expect(qa(element, '[data-id="drill"]')).toHaveLength(0);
  });

  it("keeps the order of the read, newest first", async () => {
    const element = await render({
      governedTotal: 2,
      runs: [
        deploy({ runId: "new", permitId: "permit-new" }),
        deploy({ runId: "old", permitId: "permit-old" })
      ]
    });
    expect(qa(element, '[data-id="permit"]').map((node) => text(node))).toEqual(
      ["permit-new", "permit-old"]
    );
  });

  it("draws no as of the last build note on the Salesforce site", async () => {
    const element = await render({ governedTotal: 1, runs: [deploy()] });
    expect(q(element, '[data-id="static-note"]')).toBeNull();
  });

  describe("the tour", () => {
    let scrolled;

    beforeEach(() => {
      scrolled = jest.fn();
      Element.prototype.scrollIntoView = scrolled;
    });

    it("anchors stop F on the first run link and focuses it", async () => {
      const element = await render({
        governedTotal: 2,
        runs: [deploy({ runId: "a" }), deploy({ runId: "b" })]
      });
      const anchors = qa(element, "[data-tour-anchor]");
      expect(anchors).toHaveLength(1);
      expect(anchors[0].getAttribute("data-id")).toBe("run-link");
      expect(showMe("F")).toBe(true);
      expect(scrolled).toHaveBeenCalledTimes(1);
      expect(element.shadowRoot.activeElement).toBe(anchors[0]);
    });

    it("anchors the first deploy that has a run link", async () => {
      const element = await render({
        governedTotal: 2,
        runs: [deploy({ runUrl: null }), deploy({ runId: "b" })]
      });
      const anchor = q(element, "[data-tour-anchor]");
      expect(anchor.closest('[data-id="deploy"]')).toBe(
        qa(element, '[data-id="deploy"]')[1]
      );
    });

    it("anchors the empty note when there is no run link", async () => {
      const element = await render({ governedTotal: 0, runs: [] });
      const anchor = q(element, "[data-tour-anchor]");
      expect(anchor.getAttribute("data-id")).toBe("no-deploys");
      showMe("F");
      expect(element.shadowRoot.activeElement).toBe(anchor);
    });

    it("does not answer for another stop, or after it is removed", async () => {
      const element = await render({ governedTotal: 1, runs: [deploy()] });
      showMe("E");
      expect(scrolled).not.toHaveBeenCalled();
      document.body.removeChild(element);
      showMe("F");
      expect(scrolled).not.toHaveBeenCalled();
    });
  });

  describe("the template and styles", () => {
    const read = (name) => readFileSync(join(__dirname, "..", name), "utf8");

    it("uses only design tokens for colour", () => {
      const css = read("governanceEvidence.css").replace(
        /\/\*[\s\S]*?\*\//g,
        ""
      );
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/\brgba?\(/);
    });

    it("has no dash punctuation or semicolon in the page copy", () => {
      const template = read("governanceEvidence.html")
        .replace(/&#32;/g, " ")
        .replace(/<[^>]*>/g, " ");
      expect(template).not.toMatch(/[–—;]/);
      expect(template).not.toMatch(/ - /);
    });

    it("names no client, employer or org", () => {
      const template = read("governanceEvidence.html").toLowerCase();
      ["telus", "00dfj", "0afhp"].forEach((name) => {
        expect(template).not.toContain(name);
      });
    });
  });
});
