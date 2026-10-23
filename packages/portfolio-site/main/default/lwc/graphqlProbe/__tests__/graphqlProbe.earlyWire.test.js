/**
 * @description       : A wire adapter that already holds the answer (the Skills page
 *                      ran the same GraphQL read earlier) can deliver it as soon as the wire
 *                      connects, which the engine does before connectedCallback runs. This mock
 *                      adapter does exactly that, so the probe must time from its own creation and
 *                      still report a finite number.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { createElement } from "@lwc/engine-dom";
import GraphqlProbe from "c/graphqlProbe";

jest.mock(
  "lightning/uiGraphQLApi",
  () => {
    // Emits on the first config update, inside the wire's connect, before connectedCallback.
    class EarlyAdapter {
      constructor(dataCallback) {
        this.dataCallback = dataCallback;
      }
      update() {
        this.dataCallback({
          data: {
            uiapi: { query: { Skill__c: { edges: [{ node: { Id: "a01" } }] } } }
          },
          errors: undefined
        });
      }
      connect() {}
      disconnect() {}
    }
    return {
      __esModule: true,
      graphql: EarlyAdapter,
      gql: jest.fn((strings) => strings.join(""))
    };
  },
  { virtual: true }
);

describe("c-graphql-probe when the wire answers before connect", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.restoreAllMocks();
  });

  it("reports a finite time, never NaN", () => {
    const clock = jest.spyOn(performance, "now").mockReturnValue(500);
    const handler = jest.fn();
    const element = createElement("c-graphql-probe", { is: GraphqlProbe });
    element.addEventListener("probe", handler);
    clock.mockReturnValue(512.6);
    document.body.appendChild(element);

    expect(handler).toHaveBeenCalledTimes(1);
    const { ms } = handler.mock.calls[0][0].detail;
    expect(Number.isFinite(ms)).toBe(true);
    expect(ms).toBe(13);
  });
});
