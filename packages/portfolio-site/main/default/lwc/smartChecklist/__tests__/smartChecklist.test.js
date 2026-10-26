/**
 * @description       : Unit tests for smartChecklist LWC.
 *                      GovernanceController.getPipelineStatus is a mocked wire adapter, and
 *                      c/analyticsService is mocked so the bundle tests on its own.
 *                      Intl.DateTimeFormat is pinned to America/New_York, so the local time
 *                      beside each UTC time does not depend on the machine's zone.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SmartChecklist, {
  formatTime,
  localTime,
  localDateTime,
  shortSha,
  timeView
} from "c/smartChecklist";
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

// The zone every test sees as the browser's own.
const PINNED_ZONE = "America/New_York";
const RealDateTimeFormat = Intl.DateTimeFormat;

function pinZone(timeZone) {
  jest
    .spyOn(Intl, "DateTimeFormat")
    .mockImplementation(
      (locale, options) =>
        new RealDateTimeFormat(locale, { ...options, timeZone })
    );
}

describe("c-smart-checklist", () => {
  beforeEach(() => {
    pinZone(PINNED_ZONE);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it("labels the three items, plain sentences for the heartbeat and the caches", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus([
        item("deploy", "NO_SIGNAL"),
        item("heartbeat", "NO_SIGNAL"),
        item("caches", "NO_SIGNAL")
      ])
    );
    await flushPromises();

    const label = (key) =>
      row(element, key).querySelector(".label").textContent.trim();
    expect(label("deploy")).toBe("Production deploy green");
    expect(label("heartbeat")).toBe("Daily health check passed");
    expect(label("caches")).toBe(
      "Jira and GitHub data refreshed in the last 30 minutes"
    );
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
    expect(deploy.textContent).toContain("Oct 21, 4:00 AM EDT");
  });

  it("shows the visitor's own time first and keeps the UTC time in the title", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus([
        item("deploy", "PASS", run("deploy", "Success")),
        item("heartbeat", "NO_SIGNAL"),
        item("caches", "NO_SIGNAL")
      ])
    );
    await flushPromises();

    const time = row(element, "deploy").querySelector("time.time");
    expect(time.textContent).toBe("Oct 21, 4:00 AM EDT");
    expect(time.getAttribute("title")).toBe("2026-10-21 08:00 UTC");
    expect(time.getAttribute("datetime")).toBe("2026-10-21T08:00:00.000Z");
  });

  it("shows no time when the run has no completion time or an unreadable one", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus([
        item("deploy", "PASS", run("deploy", "Success", { completedAt: null })),
        item(
          "heartbeat",
          "PASS",
          run("heartbeat", "Success", { completedAt: "not a date" })
        ),
        item("caches", "NO_SIGNAL")
      ])
    );
    await flushPromises();

    ["deploy", "heartbeat"].forEach((key) => {
      expect(row(element, key).querySelector("time")).toBeNull();
      expect(row(element, key).textContent).not.toMatch(/UTC|EDT/);
    });
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
    const lines = Array.from(
      row(element, "caches").querySelectorAll("p.cache")
    ).map((line) => line.textContent.replace(/\s+/g, " ").trim());
    expect(lines).toEqual([
      "GitHub cache Oct 21, 7:50 AM EDT",
      "Jira cache Oct 21, 7:45 AM EDT"
    ]);
    const times = Array.from(row(element, "caches").querySelectorAll("time"));
    expect(times.map((time) => time.getAttribute("datetime"))).toEqual([
      "2026-10-21T11:50:00.000Z",
      "2026-10-21T11:45:00.000Z"
    ]);
  });

  it("says none for a cache with no time, beside one that has a time", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus(
        [
          item("deploy", "NO_SIGNAL"),
          item("heartbeat", "NO_SIGNAL"),
          item("caches", "PASS")
        ],
        { githubCacheAt: "2026-10-21T11:50:00.000Z", jiraCacheAt: null }
      )
    );
    await flushPromises();

    const lines = Array.from(
      row(element, "caches").querySelectorAll("p.cache")
    ).map((line) => line.textContent.replace(/\s+/g, " ").trim());
    expect(lines[1]).toBe("Jira cache none");
    expect(row(element, "caches").querySelectorAll("time")).toHaveLength(1);
  });

  it("shows no cache line and no tick when neither cache has a time", async () => {
    const element = createComponent();
    getPipelineStatus.emit(
      pipelineStatus([
        item("deploy", "NO_SIGNAL"),
        item("heartbeat", "NO_SIGNAL"),
        item("caches", "PASS")
      ])
    );
    await flushPromises();

    expect(row(element, "caches").querySelector("p.cache")).toBeNull();
    expect(stateText(element, "caches")).toBe("No signal yet");
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

    it("gives the local time and short zone in the pinned zone", () => {
      expect(localTime("2026-10-24T12:06:00.000Z")).toBe("8:06 AM EDT");
      expect(localTime("2026-12-24T12:06:00.000Z")).toBe("7:06 AM EST");
      expect(localTime(null)).toBe("");
      expect(localTime("not a date")).toBe("");
    });

    it("follows whatever zone the browser is in", () => {
      jest.restoreAllMocks();
      pinZone("Europe/London");
      expect(localTime("2026-10-24T12:06:00.000Z")).toBe("1:06 PM GMT+1");
      pinZone("UTC");
      expect(localTime("2026-10-24T12:06:00.000Z")).toBe("12:06 PM UTC");
    });

    it("gives the local date and time with the zone", () => {
      expect(localDateTime("2026-10-24T12:06:00.000Z")).toBe(
        "Oct 24, 8:06 AM EDT"
      );
      expect(localDateTime(null)).toBe("");
      expect(localDateTime("not a date")).toBe("");
    });

    it("builds the local text, the UTC title and the ISO value", () => {
      expect(timeView("2026-10-24T12:06:00.000Z")).toEqual({
        text: "Oct 24, 8:06 AM EDT",
        title: "2026-10-24 12:06 UTC",
        iso: "2026-10-24T12:06:00.000Z"
      });
      expect(timeView(undefined)).toBeNull();
      expect(timeView("not a date")).toBeNull();
    });

    it("keeps the UTC time alone when Intl cannot format", () => {
      jest.restoreAllMocks();
      jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
        throw new RangeError("no zone data");
      });
      expect(timeView("2026-10-24T12:06:00.000Z").text).toBe(
        "2026-10-24 12:06 UTC"
      );
      expect(localDateTime("2026-10-24T12:06:00.000Z")).toBe("");
    });

    it("shortens a sha to seven characters", () => {
      expect(shortSha(SHA)).toBe("a1b2c3d");
      expect(shortSha(null)).toBe("");
    });
  });
});
