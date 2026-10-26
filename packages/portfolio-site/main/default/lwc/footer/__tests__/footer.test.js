/**
 * @description       : Unit tests for the Glass Box footer, its caption, its four metric groups
 *                      in plain words with the quotas in a closed disclosure, and its links.
 *                      getLinks is a
 *                      mocked wire adapter, getSystemSnapshot a mocked imperative call, and
 *                      requestIdleCallback is captured so a test decides when the page is idle.
 *                      lightning/uiGraphQLApi passes the universal mock through and replaces only
 *                      graphql and gql. The probe is the real c/graphqlProbe, which the
 *                      footer imports on demand after idle.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { createElement } from "@lwc/engine-dom";
import Footer, {
  ACTIONS_URL,
  BADGE_URL,
  formatNumber,
  formatTime,
  integrationLabel,
  providerLabel,
  quotaLabel
} from "c/footer";
import getLinks from "@salesforce/apex/FooterController.getLinks";
import getSystemSnapshot from "@salesforce/apex/FooterController.getSystemSnapshot";
import { trackEvent } from "c/analyticsService";
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { graphql } from "lightning/uiGraphQLApi";

jest.mock(
  "@salesforce/apex/FooterController.getLinks",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/FooterController.getSystemSnapshot",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

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
      gql: jest.fn((strings) => strings.join(""))
    };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    EVENTS: {
      FINOPS_QUOTA_VISIBILITY: "finops_quota_visibility",
      BACK_TO_TOP_USED: "back_to_top_used"
    },
    trackEvent: jest.fn()
  }),
  { virtual: true }
);

const PROVIDERS_FLAG_OFF = [
  {
    provider: "Gemini",
    model: "gemma-4-31b-it",
    enabled: true,
    state: "on",
    sortOrder: 2
  },
  {
    provider: "Agentforce",
    model: null,
    enabled: false,
    state: "off",
    sortOrder: 1
  },
  {
    provider: "Local",
    model: "local-template",
    enabled: true,
    state: "on",
    sortOrder: 3
  }
];

function snapshot(overrides = {}) {
  return {
    cpuTimeMs: 12,
    cpuTimeLimitMs: 10000,
    heapBytes: 51200,
    heapLimitBytes: 6291456,
    soqlQueries: 3,
    soqlQueryLimit: 100,
    providers: PROVIDERS_FLAG_OFF,
    aiRequestsToday: 7,
    ...overrides
  };
}

const INTEGRATIONS = [
  { key: "github", label: "GitHub", open: false, openUntil: null },
  {
    key: "jira",
    label: "Jira",
    open: true,
    openUntil: "2026-10-23T14:05:00.000Z"
  }
];

const ORG_QUOTAS = [
  {
    name: "DailyApiRequests",
    label: "API requests today",
    used: 739,
    max: 5000000
  },
  {
    name: "DailyAsyncApexExecutions",
    label: "async Apex today",
    used: 0,
    max: 250000
  }
];

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

let idleCallbacks;

function createComponent() {
  const element = createElement("c-footer", { is: Footer });
  document.body.appendChild(element);
  return element;
}

async function runIdle() {
  idleCallbacks.splice(0).forEach((callback) => callback());
  // The probe component is a dynamic import, which takes a few more turns to settle.
  for (let i = 0; i < 4; i++) {
    await flushPromises();
  }
}

function q(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function all(element, selector) {
  return Array.from(element.shadowRoot.querySelectorAll(selector));
}

describe("c-footer", () => {
  beforeEach(() => {
    idleCallbacks = [];
    window.requestIdleCallback = jest.fn((callback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    window.cancelIdleCallback = jest.fn();
    getSystemSnapshot.mockResolvedValue(snapshot());
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
    jest.clearAllMocks();
  });

  it("shows the copyright year", () => {
    const element = createComponent();
    const text = q(element, ".copyright").textContent;
    expect(text).toContain("Ryan Bumstead");
    expect(text).toContain(String(new Date().getFullYear()));
  });

  it("renders the profile links from the getLinks wire", async () => {
    const element = createComponent();
    getLinks.emit({
      gitHubUrl: "https://github.com/wired-owner",
      linkedInUrl: "https://www.linkedin.com/in/wired-owner"
    });
    await flushPromises();

    const gitHub = q(element, '[data-id="github"]');
    const linkedIn = q(element, '[data-id="linkedin"]');
    expect(gitHub.getAttribute("href")).toBe("https://github.com/wired-owner");
    expect(linkedIn.getAttribute("href")).toBe(
      "https://www.linkedin.com/in/wired-owner"
    );
    expect(gitHub.getAttribute("target")).toBe("_blank");
    expect(gitHub.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders no profile link the wire did not return", async () => {
    const element = createComponent();
    getLinks.emit({ gitHubUrl: null, linkedInUrl: null });
    await flushPromises();

    expect(q(element, '[data-id="github"]')).toBeNull();
    expect(q(element, '[data-id="linkedin"]')).toBeNull();
  });

  it("shows the production deploy badge for main", () => {
    const element = createComponent();
    const badge = q(element, '[data-id="badge"]');
    expect(badge.getAttribute("src")).toBe(BADGE_URL);
    expect(BADGE_URL).toBe(
      "https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/deploy.yml/badge.svg?branch=main"
    );
    expect(badge.getAttribute("alt")).toBe("Production deploy status");
  });

  it("swaps the badge for a text link to the Actions page when it fails", async () => {
    const element = createComponent();
    q(element, '[data-id="badge"]').dispatchEvent(new CustomEvent("error"));
    await flushPromises();

    expect(q(element, '[data-id="badge"]')).toBeNull();
    const fallback = q(element, '[data-id="badge-fallback"]');
    expect(fallback.textContent).toBe("Production deploy status");
    expect(fallback.getAttribute("href")).toBe(ACTIONS_URL);
  });

  it("requests the snapshot only after the page is idle", async () => {
    const element = createComponent();
    await flushPromises();

    expect(window.requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(getSystemSnapshot).not.toHaveBeenCalled();
    expect(q(element, '[data-id="ai-requests"]')).toBeNull();
    expect(all(element, '[data-id="provider"]')).toHaveLength(0);

    await runIdle();

    expect(getSystemSnapshot).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="ai-requests"]').textContent).toBe(
      "AI requests today: 7"
    );
  });

  it("waits for the load event when the page is still loading", async () => {
    const readyState = jest
      .spyOn(document, "readyState", "get")
      .mockReturnValue("loading");
    createComponent();
    await flushPromises();
    expect(window.requestIdleCallback).not.toHaveBeenCalled();

    window.dispatchEvent(new CustomEvent("load"));
    expect(window.requestIdleCallback).toHaveBeenCalledTimes(1);
    readyState.mockRestore();
  });

  it("shows Agentforce: off with the flag off, in dispatch order", async () => {
    const element = createComponent();
    await runIdle();

    const rows = all(element, '[data-id="provider"]').map((n) => n.textContent);
    expect(rows).toEqual(["Agentforce: off", "Gemini: on", "Local: on"]);
  });

  it("shows no provider text that is not from the data", async () => {
    getSystemSnapshot.mockResolvedValue(
      snapshot({
        providers: [
          { provider: "TestProvider", state: "test-state", sortOrder: 1 }
        ]
      })
    );
    const element = createComponent();
    await runIdle();

    const rows = all(element, '[data-id="provider"]').map((n) => n.textContent);
    expect(rows).toEqual(["TestProvider: test-state"]);
    // The rows only: the group label "Quotas and limits" is fixed text, not data.
    const text = all(element, ".group-list")
      .map((list) => list.textContent)
      .join(" ");
    expect(text).not.toMatch(/Agentforce|Gemini|Local|quota/i);
  });

  it("shows when an open circuit closes", async () => {
    const until = "2026-10-21T14:05:00.000Z";
    getSystemSnapshot.mockResolvedValue(
      snapshot({
        providers: [
          {
            provider: "Gemini",
            state: "on",
            sortOrder: 2,
            circuitOpenUntil: until
          }
        ]
      })
    );
    const element = createComponent();
    await runIdle();

    expect(q(element, '[data-id="provider"]').textContent).toBe(
      `Gemini: paused until ${formatTime(until)}`
    );
  });

  it("shows the limits used against their ceilings", async () => {
    const element = createComponent();
    await runIdle();

    const rows = all(element, '[data-id="limit"]').map((n) => n.textContent);
    expect(rows).toEqual([
      "CPU time: 12 of 10,000 ms",
      "Memory: 50 of 6,144 KB",
      "Database queries: 3 of 100"
    ]);
  });

  it("says the status is unavailable when the snapshot call fails", async () => {
    getSystemSnapshot.mockRejectedValue(new Error("boom"));
    const element = createComponent();
    await runIdle();

    expect(q(element, '[data-id="snapshot-error"]').textContent).toBe(
      "status unavailable"
    );
    expect(q(element, '[data-id="ai-requests"]')).toBeNull();
  });

  it("tracks finops_quota_visibility once on hover or focus", async () => {
    const element = createComponent();
    await runIdle();

    const line = q(element, '[data-id="ai-requests"]');
    expect(line.getAttribute("tabindex")).toBe("0");
    line.dispatchEvent(new CustomEvent("mouseenter"));
    line.dispatchEvent(new CustomEvent("focus"));
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("finops_quota_visibility");
  });

  it("tracks finops_quota_visibility on keyboard focus", async () => {
    const element = createComponent();
    await runIdle();

    q(element, '[data-id="ai-requests"]').dispatchEvent(
      new CustomEvent("focus")
    );
    expect(trackEvent).toHaveBeenCalledWith("finops_quota_visibility");
  });

  it("scrolls to the top from Back to top", () => {
    window.scrollTo = jest.fn();
    const element = createComponent();
    q(element, '[data-id="back-to-top"]').click();
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto"
    });
  });

  it("sends back_to_top_used with no parameters from Back to top", () => {
    window.scrollTo = jest.fn();
    const element = createComponent();
    q(element, '[data-id="back-to-top"]').click();
    expect(trackEvent).toHaveBeenCalledWith("back_to_top_used");
    expect(trackEvent.mock.calls.at(-1)).toHaveLength(1);
  });

  it("cancels the deferred load when removed before idle", () => {
    const element = createComponent();
    document.body.removeChild(element);
    expect(window.cancelIdleCallback).toHaveBeenCalledTimes(1);
  });

  it("falls back to one timeout without requestIdleCallback", async () => {
    delete window.requestIdleCallback;
    jest.useFakeTimers();
    try {
      createComponent();
      expect(getSystemSnapshot).not.toHaveBeenCalled();
      jest.runOnlyPendingTimers();
      expect(getSystemSnapshot).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows no GraphQL line before the page is idle", async () => {
    const element = createComponent();
    graphql.emit({ data: { uiapi: { query: { Skill__c: { edges: [] } } } } });
    await flushPromises();

    expect(q(element, '[data-id="graphql"]')).toBeNull();
  });

  it("measures the GraphQL probe and shows it live with its time", async () => {
    const clock = jest.spyOn(performance, "now");
    clock.mockReturnValue(1000);
    const element = createComponent();
    await runIdle();

    clock.mockReturnValue(1042.4);
    graphql.emit({
      data: {
        uiapi: { query: { Skill__c: { edges: [{ node: { Id: "a01" } }] } } }
      }
    });
    await flushPromises();

    expect(q(element, '[data-id="graphql"]').textContent).toBe(
      "GraphQL: live, 42 ms"
    );
    clock.mockRestore();
  });

  it("renders the GraphQL probe only once the page is idle", async () => {
    const element = createComponent();
    await flushPromises();
    expect(q(element, '[data-id="graphql-probe"]')).toBeNull();

    await runIdle();
    expect(q(element, '[data-id="graphql-probe"]')).not.toBeNull();
    expect(graphql.getLastConfig().query).toContain("Skill__c(first: 1)");
  });

  it("says cached, with no time, when the probe answered from the cache", async () => {
    const element = createComponent();
    await runIdle();
    const probe = q(element, '[data-id="graphql-probe"]');
    probe.dispatchEvent(
      new CustomEvent("probe", { detail: { ms: 0, cached: true } })
    );
    await flushPromises();

    expect(q(element, '[data-id="graphql"]').textContent).toBe(
      "GraphQL: cached, no request made"
    );
  });

  it("shows the live time when the probe says a request went out", async () => {
    const element = createComponent();
    await runIdle();
    const probe = q(element, '[data-id="graphql-probe"]');
    probe.dispatchEvent(
      new CustomEvent("probe", { detail: { ms: 61, cached: false } })
    );
    await flushPromises();

    expect(q(element, '[data-id="graphql"]').textContent).toBe(
      "GraphQL: live, 61 ms"
    );
  });

  it("shows GraphQL unavailable when the probe errors", async () => {
    const element = createComponent();
    await runIdle();

    graphql.emit({ errors: [{ message: "denied" }] });
    await flushPromises();

    expect(q(element, '[data-id="graphql"]').textContent).toBe(
      "GraphQL: unavailable"
    );
  });

  it("labels a provider row from its own fields", () => {
    expect(providerLabel({ provider: "Agentforce", state: "not built" })).toBe(
      "Agentforce: not built"
    );
    expect(formatTime("not a date")).toBe("");
  });
  it("shows the GitHub and Jira breakers next to the AI providers", async () => {
    getSystemSnapshot.mockResolvedValue(
      snapshot({ integrations: INTEGRATIONS })
    );
    const element = createComponent();
    await runIdle();

    const rows = all(element, '[data-id="integration"]').map(
      (n) => n.textContent
    );
    expect(rows).toEqual([
      "GitHub: connected",
      `Jira: paused until ${formatTime(INTEGRATIONS[1].openUntil)}`
    ]);
    const lastProvider = all(element, '[data-id="provider"]').pop();
    expect(lastProvider.nextElementSibling.dataset.id).toBe("integration");
  });

  it("shows the org quotas from the snapshot", async () => {
    getSystemSnapshot.mockResolvedValue(snapshot({ orgQuotas: ORG_QUOTAS }));
    const element = createComponent();
    await runIdle();

    const rows = all(element, '[data-id="quota"]').map((n) => n.textContent);
    expect(rows).toEqual([
      "API requests today: 739 of 5,000,000",
      "async Apex today: 0 of 250,000"
    ]);
  });

  it("drops a quota whose numbers are not finite and shows none without data", async () => {
    getSystemSnapshot.mockResolvedValue(
      snapshot({
        orgQuotas: [
          { name: "A", label: "broken", used: NaN, max: 10 },
          { name: "B", label: "missing", used: 1 },
          ORG_QUOTAS[0]
        ]
      })
    );
    const element = createComponent();
    await runIdle();

    const rows = all(element, '[data-id="quota"]').map((n) => n.textContent);
    expect(rows).toEqual(["API requests today: 739 of 5,000,000"]);
    expect(q(element, '[data-id="metrics"]').textContent).not.toMatch(/NaN/);
  });

  it("shows no breaker or quota row when the snapshot has none", async () => {
    const element = createComponent();
    await runIdle();

    expect(all(element, '[data-id="integration"]')).toHaveLength(0);
    expect(all(element, '[data-id="quota"]')).toHaveLength(0);
  });

  it("shows no GraphQL time when the probe reports a number that is not finite", () => {
    const element = createComponent();
    const footer = q(element, ".footer");
    expect(footer).not.toBeNull();
    // The probe event bubbles from the dynamic child. Send a NaN answer straight to the handler.
    const probeEvent = new CustomEvent("probe", { detail: { ms: NaN } });
    return runIdle().then(async () => {
      const probe = q(element, '[data-id="graphql-probe"]');
      probe.dispatchEvent(probeEvent);
      await flushPromises();
      expect(q(element, '[data-id="graphql"]')).toBeNull();
    });
  });

  describe("metric groups", () => {
    function groups(element) {
      return all(element, ".metric-group").map((group) => {
        const label = group.querySelector(".group-label");
        const list = group.querySelector("ul.group-list");
        return {
          group,
          label: label.textContent.trim(),
          labelled: list.getAttribute("aria-labelledby") === label.id,
          ids: Array.from(list.children).map(
            (li) =>
              li.dataset.id ||
              (li.querySelector("[data-id]") || {}).dataset?.id ||
              li.className
          )
        };
      });
    }

    async function loadEverything() {
      getSystemSnapshot.mockResolvedValue(
        snapshot({ integrations: INTEGRATIONS, orgQuotas: ORG_QUOTAS })
      );
      const element = createComponent();
      await runIdle();
      graphql.emit({
        data: { uiapi: { query: { Skill__c: { edges: [] } } } }
      });
      await flushPromises();
      return element;
    }

    it("shows four labelled groups in order once everything has loaded", async () => {
      const element = await loadEverything();
      const found = groups(element);
      expect(found.map((g) => g.label)).toEqual([
        "Deploy",
        "Platform",
        "Integrations",
        "Quotas and limits"
      ]);
      found.forEach((g) => {
        expect(g.labelled).toBe(true);
        expect(g.group.querySelector(".group-label").id).not.toBe("");
      });
    });

    it("puts each metric in its group, each one a list item", async () => {
      const element = await loadEverything();
      const [deploy, platform, integrations, quotas] = groups(element);
      expect(deploy.group.querySelector('[data-id="badge"]')).not.toBeNull();
      expect(platform.ids).toEqual(["graphql"]);
      expect(integrations.ids).toEqual([
        "provider",
        "provider",
        "provider",
        "integration",
        "integration"
      ]);
      expect(quotas.ids).toEqual([
        "ai-requests",
        "quota",
        "quota",
        "limit",
        "limit",
        "limit"
      ]);
      all(element, ".group-list > *").forEach((child) => {
        expect(child.tagName).toBe("LI");
      });
    });

    it("shows only Deploy before the page is idle", () => {
      const element = createComponent();
      expect(groups(element).map((g) => g.label)).toEqual(["Deploy"]);
    });

    it("shows the snapshot error under Platform and no empty group when the call fails", async () => {
      getSystemSnapshot.mockRejectedValue(new Error("boom"));
      const element = createComponent();
      await runIdle();
      const found = groups(element);
      expect(found.map((g) => g.label)).toEqual(["Deploy", "Platform"]);
      expect(found[1].ids).toEqual(["snapshot-error"]);
    });

    it("leaves Integrations out when the snapshot has no provider or breaker", async () => {
      getSystemSnapshot.mockResolvedValue(snapshot({ providers: [] }));
      const element = createComponent();
      await runIdle();
      expect(groups(element).map((g) => g.label)).toEqual([
        "Deploy",
        "Quotas and limits"
      ]);
    });
  });

  it("says in one caption what the readings are", () => {
    const element = createComponent();
    const caption = q(element, '[data-id="metrics-caption"]');
    expect(caption.textContent.trim()).toBe(
      "Live readings from the Salesforce org serving this page"
    );
    expect(caption.nextElementSibling).toBe(q(element, '[data-id="metrics"]'));
  });

  it("drops the bare deploy word beside the badge", () => {
    const element = createComponent();
    const deploy = q(element, ".metric.deploy");
    expect(deploy.textContent.trim()).toBe("");
    expect(q(element, '[data-id="badge"]').getAttribute("alt")).toBe(
      "Production deploy status"
    );
  });

  it("groups numbers by thousands and shows 0 for a missing number", () => {
    expect(formatNumber(5000000)).toBe("5,000,000");
    expect(formatNumber(739)).toBe("739");
    expect(formatNumber(undefined)).toBe("0");
    expect(formatNumber(NaN)).toBe("0");
  });

  it("formats the AI requests count", async () => {
    getSystemSnapshot.mockResolvedValue(snapshot({ aiRequestsToday: 12345 }));
    const element = createComponent();
    await runIdle();
    expect(q(element, '[data-id="ai-requests"]').textContent).toBe(
      "AI requests today: 12,345"
    );
  });

  it("keeps the quotas in a disclosure that starts closed", async () => {
    const element = createComponent();
    await runIdle();
    const details = q(element, 'details[data-group="quotas"]');
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    const summary = details.querySelector("summary");
    expect(summary.textContent.trim()).toBe("Quotas and limits");
    expect(details.querySelector('[data-id="ai-requests"]')).not.toBeNull();
  });

  it("tracks finops_quota_visibility once when the quotas are opened", async () => {
    const element = createComponent();
    await runIdle();
    const details = q(element, 'details[data-group="quotas"]');
    details.open = true;
    details.dispatchEvent(new CustomEvent("toggle"));
    q(element, '[data-id="ai-requests"]').dispatchEvent(
      new CustomEvent("focus")
    );
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("finops_quota_visibility");
  });

  it("sends nothing when the quotas are closed again", async () => {
    const element = createComponent();
    await runIdle();
    const details = q(element, 'details[data-group="quotas"]');
    details.open = false;
    details.dispatchEvent(new CustomEvent("toggle"));
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("links Skills and Testimonials first, before Contact", () => {
    const element = createComponent();
    const skills = q(element, '[data-id="skills"]');
    const testimonials = q(element, '[data-id="testimonials"]');
    expect(skills.textContent).toBe("Skills");
    expect(skills.getAttribute("href")).toBe("/portfolio/skills");
    expect(testimonials.textContent).toBe("Testimonials");
    expect(testimonials.getAttribute("href")).toBe("/portfolio/testimonials");
    expect(skills.parentElement.firstElementChild).toBe(skills);
    expect(skills.nextElementSibling).toBe(testimonials);
    expect(testimonials.nextElementSibling).toBe(
      q(element, '[data-id="contact"]')
    );
  });

  it("sits in the same 1024 px column as the header", () => {
    const element = createComponent();
    const inner = q(element, ".footer__inner");
    expect(inner.parentElement).toBe(q(element, "footer"));
    expect(inner.querySelector(".copyright")).not.toBeNull();
    expect(inner.querySelector('[data-id="back-to-top"]')).not.toBeNull();
  });

  it("links Docs to the /docs page, right after Contact", () => {
    const element = createComponent();
    const link = q(element, '[data-id="docs"]');
    expect(link.textContent).toBe("Docs");
    expect(link.getAttribute("href")).toBe("/portfolio/docs");
    expect(link.getAttribute("target")).toBeNull();
    expect(q(element, '[data-id="contact"]').nextElementSibling).toBe(link);
  });

  it("links Contact to the /contact page", () => {
    const element = createComponent();
    const link = q(element, '[data-id="contact"]');
    expect(link.textContent).toBe("Contact");
    expect(link.getAttribute("href")).toBe("/portfolio/contact");
    expect(link.getAttribute("target")).toBeNull();
  });

  it("labels breaker and quota rows from their own fields", () => {
    expect(integrationLabel({ label: "GitHub", open: true })).toBe(
      "GitHub: paused"
    );
    expect(integrationLabel({ label: "Jira", open: false })).toBe(
      "Jira: connected"
    );
    expect(quotaLabel(null)).toBeNull();
    expect(
      quotaLabel({ label: "API requests today", used: 1, max: Infinity })
    ).toBeNull();
  });
});
