/**
 * @description       : The roadmap's one switch drives both Delivery panels. Mounts the roadmap
 *                      and Latest Updates together, turns the switch on in the roadmap and
 *                      checks that both re-read with simulate true and show the compare.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/29/2026
 **/
import { createElement } from "@lwc/engine-dom";
import RoadmapViewer from "c/roadmapViewer";
import Changelog from "c/changelog";
import getRoadmap from "@salesforce/apex/DeliveryController.getRoadmap";
import getRecentCommits from "@salesforce/apex/DeliveryController.getRecentCommits";
import { setSimulating } from "c/outageSimulation";

jest.mock(
  "@salesforce/apex/DeliveryController.getRoadmap",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/DeliveryController.getRecentCommits",
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
      ROADMAP_VIEWED: "roadmap_viewed",
      CHANGELOG_COMMIT_CLICKED: "changelog_commit_clicked",
      RESILIENCE_TEST_TRIGGERED: "resilience_test_triggered"
    }
  }),
  { virtual: true }
);

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

function board(status) {
  return {
    items: [
      {
        key: "SPAP-1",
        summary: "A card",
        status: "Ready",
        statusCategory: "new",
        type: "Story",
        updatedAt: "2026-10-21T07:10:00.000Z"
      }
    ],
    fetchedAt: "2026-10-21T08:05:00.000Z",
    ageMinutes: 6,
    status
  };
}

function commits(status) {
  return {
    items: [
      {
        sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        message: "fix(api): a change",
        url: "https://github.com/example/commit/a1b2c3d",
        committedAt: "2026-10-21T08:00:00.000Z"
      }
    ],
    fetchedAt: "2026-10-21T08:05:00.000Z",
    ageMinutes: 6,
    status
  };
}

describe("the outage switch across both panels", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
    setSimulating(false);
  });

  it("one click in the roadmap switches both panels and shows both compares", async () => {
    const roadmap = createElement("c-roadmap-viewer", { is: RoadmapViewer });
    const changelog = createElement("c-changelog", { is: Changelog });
    document.body.appendChild(roadmap);
    document.body.appendChild(changelog);
    getRoadmap.emit(board("FRESH"));
    getRecentCommits.emit(commits("FRESH"));
    await flushPromises();
    expect(roadmap.shadowRoot.querySelector("c-outage-compare")).toBeNull();
    expect(changelog.shadowRoot.querySelector("c-outage-compare")).toBeNull();

    roadmap.shadowRoot.querySelector('[data-id="simulate-switch"]').click();
    await flushPromises();
    expect(getRoadmap.getLastConfig()).toEqual({ simulate: true });
    expect(getRecentCommits.getLastConfig()).toEqual({ simulate: true });

    getRoadmap.emit(board("SIMULATED"));
    getRecentCommits.emit(commits("SIMULATED"));
    await flushPromises();
    const jira = roadmap.shadowRoot.querySelector("c-outage-compare");
    const github = changelog.shadowRoot.querySelector("c-outage-compare");
    expect(jira.source).toBe("Jira");
    expect(github.source).toBe("GitHub");
  });
});
