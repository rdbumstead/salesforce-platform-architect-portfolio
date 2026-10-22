/**
 * @description       : The one GA4 event list and the one way to send an event (Round 4 plan L4,
 *                      pillars-design T8). trackEvent does nothing when window.gtag is absent
 *                      (no tag on the page, a blocker, Jest) and never throws, so analytics can
 *                      never break a component. Round 5 appends to EVENTS and edits nothing else.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/

/** Event names, literal and final. The comment after each is its params. */
export const EVENTS = Object.freeze({
  API_TEST_EXECUTED: "api_test_executed", // path, status
  API_REFERENCE_OPENED: "api_reference_opened", // spec: sapi or papi
  AI_GENERATION_COMPLETED: "ai_generation_completed", // provider, model, fallback, latency_ms, outcome
  AI_COMPLETE_FAILURE: "ai_complete_failure", // message_kind
  RESUME_DOWNLOADED: "resume_downloaded", // persona, format: pdf or ats
  ROADMAP_VIEWED: "roadmap_viewed", // none
  CHANGELOG_COMMIT_CLICKED: "changelog_commit_clicked", // sha
  GOVERNANCE_RUN_LINK_CLICKED: "governance_run_link_clicked", // workflow
  FINOPS_QUOTA_VISIBILITY: "finops_quota_visibility", // none
  THEME_CHANGED: "theme_changed", // theme
  RESILIENCE_TEST_TRIGGERED: "resilience_test_triggered" // source: changelog or roadmap
});

/**
 * Sends one GA4 event when the tag is on the page.
 * @param {string} name One of the EVENTS values.
 * @param {object} [params] Event parameters. Anything that is not a plain object is sent as {}.
 * @returns {boolean} True when the event was handed to gtag, false otherwise.
 */
export function trackEvent(name, params) {
  try {
    if (typeof name !== "string" || name.length === 0) {
      return false;
    }
    const gtag = typeof window === "undefined" ? undefined : window.gtag;
    if (typeof gtag !== "function") {
      return false;
    }
    const payload =
      params && typeof params === "object" && !Array.isArray(params)
        ? { ...params }
        : {};
    gtag("event", name, payload);
    return true;
  } catch {
    return false;
  }
}
