/**
 * @description       : The one GA4 event list and the one way to send an event.
 *                      A component cannot see the page's window.gtag: on the site it reads as
 *                      undefined inside the component sandbox. So trackEvent dispatches a
 *                      cancelable portfolio-analytics event on the document with the name and
 *                      params, and the site's head script, which can see gtag, sends it and
 *                      cancels the event to say so. When no listener takes it (no head script,
 *                      Jest), trackEvent calls window.gtag directly if one is there. It does
 *                      nothing when neither is present and never throws, so analytics can never
 *                      break a component. New events are appended to EVENTS.
 *                      Every call also leaves a record in a short in page list for this visit: the
 *                      name, a copy of the params, the local time and how it went ("head_script",
 *                      "gtag" or "not_sent"). The list holds the last 100 and is gone on reload.
 *                      recentEvents() returns copies of it, and onAnalyticsEvent(listener) tells a
 *                      listener about each new record and returns a function that stops it. A
 *                      listener that throws is ignored. c/analyticsEvents shows the list.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
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
  TIMELINE_EXPANDED: "timeline_expanded", // tab, expanded
  MOTION_TOGGLED: "motion_toggled", // motion: reduce or full
  DOCS_OPENED: "docs_opened", // doc_key
  API_LAB_SECTION_TOGGLED: "api_lab_section_toggled", // section, expanded
  CASE_STUDY_LINK_FOLLOWED: "case_study_link_followed", // name
  GRAPH_LAYOUT_CHANGED: "graph_layout_changed", // action: drag, fit or reset_layout
  CAREER_ROLE_OPENED: "career_role_opened", // position: 1 is the newest stop on the career line
  CAREER_TIMELINE_TOGGLED: "career_timeline_toggled", // expanded
  CAREER_TIMELINE_FILTERED: "career_timeline_filtered", // kind: all, work, education or certifications
  TOUR_OPENED: "tour_opened", // source: hero or section. Kept for past data, the tour journey no longer sends it
  TOUR_STEP_VIEWED: "tour_step_viewed", // stop: A to E, pillar: the pillar key
  TOUR_EXITED: "tour_exited", // stop: A to E, the stop the visitor left from
  TOUR_FINISHED: "tour_finished", // none
  COVER_LETTER_DOWNLOADED: "cover_letter_downloaded", // provider
  COVER_LETTER_COPIED: "cover_letter_copied", // provider
  CAREER_TIMELINE_SHOW_ALL: "career_timeline_show_all", // kind: all, work, education or certifications
  POSTMAN_RUN_CLICKED: "postman_run_clicked", // source: api_lab or reference
  POSTMAN_COLLECTION_DOWNLOADED: "postman_collection_downloaded", // source: api_lab or reference
  CURL_COPIED: "curl_copied", // example: token, health or data
  STORAGE_PANEL_OPENED: "storage_panel_opened", // none
  ANALYTICS_EVENTS_OPENED: "analytics_events_opened" // count: events listed when it opened
});

/** The document event the site's head script listens for and passes to gtag. */
export const BRIDGE_EVENT = "portfolio-analytics";

/** How an event went. */
export const OUTCOMES = Object.freeze({
  HEAD_SCRIPT: "head_script",
  GTAG: "gtag",
  NOT_SENT: "not_sent"
});

/** The most events kept for this visit. The oldest is dropped past it. */
export const MAX_RECENT_EVENTS = 100;

const recent = [];
const listeners = new Set();

function copyRecord(entry) {
  return {
    id: entry.id,
    name: entry.name,
    params: { ...entry.params },
    time: new Date(entry.time.getTime()),
    outcome: entry.outcome
  };
}

let nextId = 1;

/**
 * Keeps one record of an event and tells the listeners. Never throws.
 * @param {string} name The event name.
 * @param {object} payload The event parameters, already copied.
 * @param {string} outcome One of OUTCOMES.
 */
function record(name, payload, outcome) {
  try {
    recent.push({
      id: nextId++,
      name,
      params: { ...payload },
      time: new Date(),
      outcome
    });
    while (recent.length > MAX_RECENT_EVENTS) {
      recent.shift();
    }
    const latest = recent[recent.length - 1];
    Array.from(listeners).forEach((listener) => {
      try {
        listener(copyRecord(latest));
      } catch {
        // A listener cannot break analytics or another listener.
      }
    });
  } catch {
    // Recording is a convenience and never stops an event.
  }
}

/**
 * The events this page has sent since it loaded, oldest first.
 * @returns {Array<{id: number, name: string, params: object, time: Date, outcome: string}>} Copies.
 */
export function recentEvents() {
  return recent.map(copyRecord);
}

/**
 * Calls the listener with a copy of each event recorded from now on.
 * @param {Function} listener Called with one record.
 * @returns {Function} Stops the listening. Safe to call twice.
 */
export function onAnalyticsEvent(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Hands the event to the head script's listener.
 * @param {string} name The event name.
 * @param {object} payload The event parameters, already copied.
 * @returns {boolean} True when a listener sent it and cancelled the event.
 */
function sendThroughBridge(name, payload) {
  if (typeof document === "undefined" || typeof CustomEvent !== "function") {
    return false;
  }
  const event = new CustomEvent(BRIDGE_EVENT, {
    cancelable: true,
    detail: { name, params: payload }
  });
  return document.dispatchEvent(event) === false;
}

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
    const payload =
      params && typeof params === "object" && !Array.isArray(params)
        ? { ...params }
        : {};
    if (sendThroughBridge(name, payload)) {
      record(name, payload, OUTCOMES.HEAD_SCRIPT);
      return true;
    }
    const gtag = typeof window === "undefined" ? undefined : window.gtag;
    if (typeof gtag !== "function") {
      record(name, payload, OUTCOMES.NOT_SENT);
      return false;
    }
    gtag("event", name, payload);
    record(name, payload, OUTCOMES.GTAG);
    return true;
  } catch {
    return false;
  }
}
