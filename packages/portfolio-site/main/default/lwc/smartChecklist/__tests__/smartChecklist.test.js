/**
 * @description       : Unit tests for smartChecklist LWC (Round 4 plan L11).
 *                      GovernanceController.getPipelineStatus is a mocked wire adapter, and
 *                      c/analyticsService is mocked because @Agent 1 provides it (L4).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SmartChecklist, { formatTime, shortSha } from "c/smartChecklist";
import getPipelineStatus from "@salesforce/apex/GovernanceController.getPipelineStatus";
import { refreshApex } from "@salesforce/apex";
import { trackEvent } from "c/analyticsService";

const fs = require("fs");
const path = require("path");

jest.mock(
  "@salesforce/apex/GovernanceController.getPipelineStatus",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/apex",
  () => ({ refreshApex: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: { GOVERNANCE_RUN_LINK_CLICKED: "governance_run_link_clicked" }
  }),
  { virtual: true }
);

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const RUN_URL =
  "https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/runs/101";

function run(workflow, status, overrides = {}) {
  return {
    workflow,
    status,
    runId: "101",
    runUrl: RUN_URL,
    commitSha: SHA,
    completedAt: "2026-10-21T08:00:00.000Z",
    ...overrides
  };
}

function item(key, state, itemRun = null) {
  return { key, label: key, state, passed: state === "PASS", run: itemRun };
}

function pipelineStatus(items, caches = {}) {
  return {
    items,
    runs: [],
    githubCacheAt: null,
    jiraCacheAt: null,
    generatedAt: "2026-10-21T12:00:00.000Z",
    ...caches
  };
}

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

function createComponent() {
  const element = createElement("c-smart-checklist", { is: SmartChecklist });
  document.body.appendChild(element);
  return element;
}

function rows(element) {
  return Array.from(element.shadowRoot.querySelectorAll("li.item"));
}

function row(element, key) {
  return element.shadowRoot.querySelector(`li[data-key="${key}"]`);
}

function stateText(element, key) {
  return row(element, key).querySelector(".state").textContent.trim();
}

function setVisibility(value) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value
  });
}

describe("c-smart-checklist", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
    setVisibility("visible");
  });

  describe("module source", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "smartChecklist.js"),
      "utf8"
    );

    it("never imports lightning/empApi", () => {
      expect(source).not.toMatch(/lightning\/empApi/);
    });

    it("uses no setInterval or setTimeout", () => {
      expect(source).not.toMatch(/setInterval/);
      expect(source).not.toMatch(/setTimeout/);
    });

    it("has no Live Connected badge in the template", () => {
      const html = fs.readFileSync(
        path.join(__dirname, "..", "smartChecklist.html"),
        "utf8"
      );
      expect(html).not.toMatch(/Live Connected/);
    });
  });

  it("shows the three items as No signal yet when there is no data", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus([
        item("deploy", "NO_SIGNAL"),
        item("heartbeat", "NO_SIGNAL"),
        item("caches", "NO_SIGNAL")
      ])
    );
    await flushPromises();

    expect(rows(element)).toHaveLength(3);
    ["deploy", "heartbeat", "caches"].forEach((key) => {
      expect(stateText(element, key)).toBe("No signal yet");
      expect(row(element, key).querySelector(".state").dataset.ticked).toBe(
        "false"
      );
    });
    expect(element.shadowRoot.querySelector("a.run-link")).toBeNull();
  });

  it("shows No signal yet for every item while the wire returns an error", async () => {
    const element = createComponent();
    getPipelineStatus.error();
    await flushPromises();

    ["deploy", "heartbeat", "caches"].forEach((key) => {
      expect(stateText(element, key)).toBe("No signal yet");
    });
    expect(element.shadowRoot.textContent).toContain("could not be loaded");
  });

  it("ticks a passed deploy and shows the short sha linking to the run and the time", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus([
        item("deploy", "PASS", run("deploy", "Success")),
        item("heartbeat", "NO_SIGNAL"),
        item("caches", "NO_SIGNAL")
      ])
    );
    await flushPromises();

    const deploy = row(element, "deploy");
    expect(stateText(element, "deploy")).toBe("Passed");
    expect(deploy.querySelector(".state").dataset.ticked).toBe("true");
    const link = deploy.querySelector("a.run-link");
    expect(link.textContent).toBe("a1b2c3d");
    expect(link.getAttribute("href")).toBe(RUN_URL);
    expect(link.getAttribute("title")).toBe(SHA);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(deploy.textContent).toContain("2026-10-21 08:00 UTC");
  });

  it("never ticks a Failure", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus([
        item("deploy", "FAIL", run("deploy", "Failure")),
        item("heartbeat", "STALE", run("heartbeat", "Success")),
        item("caches", "NO_SIGNAL")
      ])
    );
    await flushPromises();

    expect(stateText(element, "deploy")).toBe("Failed");
    expect(row(element, "deploy").querySelector(".state").dataset.ticked).toBe(
      "false"
    );
    expect(stateText(element, "heartbeat")).toBe("Out of date");
  });

  it("never ticks a PASS that arrives without evidence", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus([
        item("deploy", "PASS", null),
        item("heartbeat", "NO_SIGNAL"),
        item("caches", "NO_SIGNAL")
      ])
    );
    await flushPromises();

    expect(stateText(element, "deploy")).toBe("No signal yet");
  });

  it("shows both cache times as the evidence for the cache item", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus(
        [
          item("deploy", "NO_SIGNAL"),
          item("heartbeat", "NO_SIGNAL"),
          item("caches", "PASS")
        ],
        {
          githubCacheAt: "2026-10-21T11:50:00.000Z",
          jiraCacheAt: "2026-10-21T11:45:00.000Z"
        }
      )
    );
    await flushPromises();

    expect(stateText(element, "caches")).toBe("Passed");
    expect(row(element, "caches").textContent).toContain(
      "GitHub cache 2026-10-21 11:50 UTC. Jira cache 2026-10-21 11:45 UTC."
    );
  });

  it("shows the sha as text when the run has no link", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus([
        item("deploy", "PASS", run("deploy", "Success", { runUrl: null })),
        item("heartbeat", "NO_SIGNAL"),
        item("caches", "NO_SIGNAL")
      ])
    );
    await flushPromises();

    const deploy = row(element, "deploy");
    expect(deploy.querySelector("a.run-link")).toBeNull();
    expect(deploy.querySelector(".sha").textContent).toBe("a1b2c3d");
  });

  it("refreshes with refreshApex when the tab becomes visible", async () => {
    createComponent();
    getPipelineStatus.emit(pipelineStatus([]));
    await flushPromises();

    setVisibility("hidden");
    document.dispatchEvent(new CustomEvent("visibilitychange"));
    expect(refreshApex).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new CustomEvent("visibilitychange"));
    expect(refreshApex).toHaveBeenCalledTimes(1);
  });

  it("stops listening for visibility changes when removed", async () => {
    const element = createComponent();
    getPipelineStatus.emit(pipelineStatus([]));
    await flushPromises();
    document.body.removeChild(element);

    document.dispatchEvent(new CustomEvent("visibilitychange"));
    expect(refreshApex).not.toHaveBeenCalled();
  });

  it("tracks the workflow when a run link is clicked", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus([
        item("deploy", "PASS", run("deploy", "Success")),
        item("heartbeat", "NO_SIGNAL"),
        item("caches", "NO_SIGNAL")
      ])
    );
    await flushPromises();

    element.shadowRoot.querySelector("a.run-link").click();
    expect(trackEvent).toHaveBeenCalledWith("governance_run_link_clicked", {
      workflow: "deploy"
    });
  });

  it("states honestly how the panel refreshes", async () => {
    const element = createComponent();
    getPipelineStatus.emit(pipelineStatus([]));
    await flushPromises();

    expect(element.shadowRoot.textContent).toContain(
      "Updated by a platform event from the pipeline."
    );
    expect(element.shadowRoot.textContent).not.toContain("Live Connected");
  });

  describe("helpers", () => {
    it("formats times in UTC and tolerates bad input", () => {
      expect(formatTime("2026-10-21T08:05:00.000Z")).toBe(
        "2026-10-21 08:05 UTC"
      );
      expect(formatTime(null)).toBe("");
      expect(formatTime("not a date")).toBe("");
    });

    it("shortens a sha to seven characters", () => {
      expect(shortSha(SHA)).toBe("a1b2c3d");
      expect(shortSha(null)).toBe("");
    });
  });
});
