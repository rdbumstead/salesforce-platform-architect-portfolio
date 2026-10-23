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
