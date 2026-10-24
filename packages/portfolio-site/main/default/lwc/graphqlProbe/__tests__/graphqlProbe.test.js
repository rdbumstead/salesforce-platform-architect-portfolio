/**
 * @description       : Unit tests for the footer's GraphQL probe. lightning/uiGraphQLApi passes the
 *                      universal mock through and replaces only graphql and gql.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { createElement } from "@lwc/engine-dom";
import GraphqlProbe from "c/graphqlProbe";
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { graphql } from "lightning/uiGraphQLApi";

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

const DATA = {
  uiapi: { query: { Skill__c: { edges: [{ node: { Id: "a01" } }] } } }
};

function render(handler) {
  const element = createElement("c-graphql-probe", { is: GraphqlProbe });
  element.addEventListener("probe", handler);
  document.body.appendChild(element);
  return element;
}

describe("c-graphql-probe", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.restoreAllMocks();
  });

  it("asks for one Skill__c Id", () => {
    render(jest.fn());
    expect(graphql.getLastConfig().query).toContain("Skill__c(first: 1)");
  });

  it("reports the time from creation to the first answer", () => {
    const clock = jest.spyOn(performance, "now").mockReturnValue(1000);
    const handler = jest.fn();
    render(handler);

    clock.mockReturnValue(1042.4);
    graphql.emit({ data: DATA });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ ms: 42 });
  });

  it("reports a failure when the query errors", () => {
    const handler = jest.fn();
    render(handler);

    graphql.emit({ errors: [{ message: "denied" }] });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ failed: true });
  });

  describe("with resource timing", () => {
    const GRAPHQL_URL =
      "https://example.com/portfolio/webruntime/api/services/data/v68.0/graphql?asGuest=true";
    let observers;
    let buffered;

    beforeEach(() => {
      observers = [];
      buffered = [];
      global.PerformanceObserver = class {
        constructor(callback) {
          this.callback = callback;
          this.pending = [];
          this.disconnected = false;
          observers.push(this);
        }
        observe() {}
        takeRecords() {
          const taken = this.pending;
          this.pending = [];
          return taken;
        }
        disconnect() {
          this.disconnected = true;
        }
      };
      performance.getEntriesByType = jest.fn(() => buffered);
    });

    afterEach(() => {
      delete global.PerformanceObserver;
      delete performance.getEntriesByType;
    });

    it("says cached when no GraphQL request started after it was created", () => {
      const clock = jest.spyOn(performance, "now").mockReturnValue(1000);
      const handler = jest.fn();
      render(handler);
      // A request from before the probe, and a request that is not GraphQL.
      buffered.push({ name: GRAPHQL_URL, startTime: 400 });
      observers[0].pending.push({
        name: "https://example.com/a.js",
        startTime: 1001
      });

      clock.mockReturnValue(1001);
      graphql.emit({ data: DATA });

      expect(handler.mock.calls[0][0].detail).toEqual({ ms: 1, cached: true });
    });

    it("says not cached when its GraphQL request went out", () => {
      const clock = jest.spyOn(performance, "now").mockReturnValue(1000);
      const handler = jest.fn();
      render(handler);
      observers[0].pending.push({ name: GRAPHQL_URL, startTime: 1003 });

      clock.mockReturnValue(1060);
      graphql.emit({ data: DATA });

      expect(handler.mock.calls[0][0].detail).toEqual({
        ms: 60,
        cached: false
      });
    });

    it("counts a request the observer already delivered", () => {
      jest.spyOn(performance, "now").mockReturnValue(1000);
      const handler = jest.fn();
      render(handler);
      observers[0].callback({
        getEntries: () => [{ name: GRAPHQL_URL, startTime: 1002 }]
      });

      graphql.emit({ data: DATA });

      expect(handler.mock.calls[0][0].detail.cached).toBe(false);
    });

    it("stops watching once it has reported, and when removed", () => {
      render(jest.fn());
      graphql.emit({ data: DATA });
      expect(observers[0].disconnected).toBe(true);

      render(jest.fn());
      document.body.removeChild(document.body.lastChild);
      expect(observers[1].disconnected).toBe(true);
    });

    it("sends no cached flag on a failure", () => {
      const handler = jest.fn();
      render(handler);
      graphql.emit({ errors: [{ message: "denied" }] });
      expect(handler.mock.calls[0][0].detail).toEqual({ failed: true });
    });
  });

  it("sends no cached flag where resource timing is missing", () => {
    expect(global.PerformanceObserver).toBeUndefined();
    const handler = jest.fn();
    render(handler);
    graphql.emit({ data: DATA });
    expect(handler.mock.calls[0][0].detail).not.toHaveProperty("cached");
  });

  it("reports once and stays quiet before any answer", () => {
    const handler = jest.fn();
    render(handler);

    graphql.emit({});
    expect(handler).not.toHaveBeenCalled();

    graphql.emit({ data: DATA });
    graphql.emit({ data: DATA });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
