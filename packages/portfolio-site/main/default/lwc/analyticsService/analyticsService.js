/**
 * @description       : The one GA4 event list and the one way to send an event.
 *                      trackEvent does nothing when window.gtag is absent
 *                      (no tag on the page, a blocker, Jest) and never throws, so analytics can
 *                      never break a component. New events are appended to EVENTS, and nothing
 *                      else in this file is edited when one is added.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/

/** Event names, literal and final. The comment after each is its params. */
export const EVENTS = Object.freeze({
  API_TEST_EXECUTED: "api_test_executed", // path, status, param_count
  API_REFERENCE_OPENED: "api_reference_opened", // spec: sapi or papi
  AI_GENERATION_COMPLETED: "ai_generation_completed", // provider, model, fallback, latency_ms, outcome
  AI_COMPLETE_FAILURE: "ai_complete_failure", // message_kind
  RESUME_DOWNLOADED: "resume_downloaded", // persona, format: pdf or ats
  ROADMAP_VIEWED: "roadmap_viewed", // none
  CHANGELOG_COMMIT_CLICKED: "changelog_commit_clicked", // sha
  GOVERNANCE_RUN_LINK_CLICKED: "governance_run_link_clicked", // workflow
  FINOPS_QUOTA_VISIBILITY: "finops_quota_visibility", // none
  THEME_CHANGED: "theme_changed", // theme
  RESILIENCE_TEST_TRIGGERED: "resilience_test_triggered", // source: changelog or roadmap
  SKILLS_VIEW_CHANGED: "skills_view_changed", // view
  SKILL_SELECTED: "skill_selected", // skill, years
  SKILLS_PERSONA_FILTERED: "skills_persona_filtered", // persona
  ERD_SCOPE_CHANGED: "erd_scope_changed", // scope
  ERD_NODE_SELECTED: "erd_node_selected", // object
  GALLERY_ASSET_OPENED: "gallery_asset_opened", // type, pillar
  MATRIX_WEIGHT_CHANGED: "matrix_weight_changed", // criterion
  MATRIX_RESET: "matrix_reset", // none
  TIMELINE_TAB_CHANGED: "timeline_tab_changed", // tab
  VIEW_SOURCE_OPENED: "view_source_opened", // source_key
  VIEW_SOURCE_FILE_SELECTED: "view_source_file_selected", // source_key, file_label
  CONTACT_FORM_SUBMITTED: "contact_form_submitted", // outcome: accepted, rate_limited or invalid
  TESTIMONIAL_SUBMITTED: "testimonial_submitted", // vibe, outcome
  TESTIMONIALS_FILTERED: "testimonials_filtered", // filter
  CASE_STUDY_OPENED: "case_study_opened", // pillar
  START_PATH_FOLLOWED: "start_path_followed", // path: resume, pillars or api
  GRAPH_ZOOM_USED: "graph_zoom_used", // control: in, out, reset, wheel or keyboard
  BACK_TO_TOP_USED: "back_to_top_used", // none
  TIMELINE_EXPANDED: "timeline_expanded" // tab, expanded
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
