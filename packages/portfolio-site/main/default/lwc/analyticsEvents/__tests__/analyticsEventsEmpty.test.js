/**
 * @description       : Unit test for the empty state of c-analytics-events. The analytics
 *                      service is replaced here with one that holds no events, because the real
 *                      one records the opening of the dialog itself and so is never empty once
 *                      the dialog is open.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/29/2026
 **/
import { createElement } from "@lwc/engine-dom";
import AnalyticsEvents, { WORDING } from "c/analyticsEvents";

jest.mock("c/analyticsService", () => ({
  __esModule: true,
  EVENTS: { ANALYTICS_EVENTS_OPENED: "analytics_events_opened" },
  OUTCOMES: { HEAD_SCRIPT: "head_script", GTAG: "gtag", NOT_SENT: "not_sent" },
  recentEvents: () => [],
  onAnalyticsEvent: () => () => {},
  trackEvent: jest.fn()
}));

describe("c-analytics-events with no events", () => {
  it("shows a zero count and says the list is empty", async () => {
    const element = createElement("c-analytics-events", {
      is: AnalyticsEvents
    });
    document.body.appendChild(element);
    const button = element.shadowRoot.querySelector(".open-button");
    expect(button.textContent.trim()).toBe(`${WORDING.BUTTON} (0)`);
    button.click();
    await Promise.resolve();
    const empty = element.shadowRoot.querySelector('[data-id="empty"]');
    expect(empty.textContent).toBe(WORDING.EMPTY);
    expect(element.shadowRoot.querySelector('[data-id="event"]')).toBeNull();
    document.body.removeChild(element);
  });
});
