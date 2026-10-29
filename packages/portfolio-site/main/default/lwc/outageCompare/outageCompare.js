/**
 * @description       : The before and after for the Delivery page's "Simulate an outage"
 *                      switch (ADR-022). The roadmap and Latest Updates each place one above
 *                      their content while their feed is SIMULATED. The left part, "Without
 *                      resilience", is a static illustration of a panel with no saved copy and
 *                      no breaker, labelled as an illustration for sighted and screen reader
 *                      users. The right part, "With resilience", is a numbered trace of what
 *                      this panel does: no call is made, a real outage is counted by the
 *                      circuit breaker, and the panel shows the last saved copy with its age.
 *                      The age comes from the feed's ageMinutes, else from fetchedAt, and reads
 *                      "N min ago" like the panel's own "Last updated" label. Side by side from
 *                      768 px and stacked below that. No motion. Every visible string is in
 *                      WORDING below, so the wording is reviewed in one place.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/29/2026
 **/
import { LightningElement, api } from "lwc";

/**
 * Every visible string. The facts in the breaker step come from the Apex. CircuitBreaker
 * FAILURE_THRESHOLD is 3 and OPEN_MINUTES is 30 (code defaults, lines 38 and 39, and no
 * setting record in the repo overrides them). recordFailure counts a failed refresh and opens
 * the circuit at the threshold (lines 116 to 131). The refresh jobs skip their callout while
 * the circuit is open (JiraCacheRefreshJob line 41, GitHubCacheRefreshJob line 45), and a
 * failed call inserts nothing, so the newest good cache row keeps serving.
 */
export const WORDING = Object.freeze({
  heading: "What the outage switch shows",
  withoutHeading: "Without resilience",
  withoutLabel: "Illustration only, not a real error",
  withoutLabelSr:
    "This is an illustration of a panel with no saved copy and no circuit breaker. It is not a real error.",
  failureLine: "Couldn't load {subject}. {source} didn't answer.",
  withHeading: "With resilience",
  stepNoCall: "The switch is on, so no call was made to {source}.",
  stepBreaker:
    "In a real outage, the refresh that calls {source} fails and the breaker counts it. After 3 failures in a row it opens for 30 minutes, and the refresh stops calling {source} until then.",
  stepCopy: "{Subject} shows the copy saved {age}.",
  ageUnknown: "earlier",
  fallbackSubject: "this panel",
  fallbackSource: "the source"
});

const MS_PER_MINUTE = 60000;

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : match;
  });
}

/**
 * The age as the panels write it, "N min ago". Uses ageMinutes when the feed has it, else works
 * it out from fetchedAt, else says "earlier".
 * @param {number} ageMinutes minutes from the feed
 * @param {string|number|Date} fetchedAt when the copy was saved
 * @returns {string} the age text
 */
export function formatAge(ageMinutes, fetchedAt) {
  if (Number.isFinite(ageMinutes) && ageMinutes >= 0) {
    return `${ageMinutes} min ago`;
  }
  if (fetchedAt) {
    const time = new Date(fetchedAt).getTime();
    if (!Number.isNaN(time)) {
      const minutes = Math.max(
        0,
        Math.floor((Date.now() - time) / MS_PER_MINUTE)
      );
      return `${minutes} min ago`;
    }
  }
  return WORDING.ageUnknown;
}

export default class OutageCompare extends LightningElement {
  /** "Jira" or "GitHub". */
  @api source;
  /** What the panel is called in a sentence, for example "the roadmap" or "Latest Updates". */
  @api subject;
  @api fetchedAt;
  @api ageMinutes;

  wording = WORDING;

  get values() {
    const subject = this.subject || WORDING.fallbackSubject;
    return {
      source: this.source || WORDING.fallbackSource,
      subject,
      Subject: subject.charAt(0).toUpperCase() + subject.slice(1),
      age: formatAge(this.ageMinutes, this.fetchedAt)
    };
  }

  get failureLine() {
    return fill(WORDING.failureLine, this.values);
  }

  get steps() {
    const values = this.values;
    return [
      { id: "no-call", text: fill(WORDING.stepNoCall, values) },
      { id: "breaker", text: fill(WORDING.stepBreaker, values) },
      { id: "copy", text: fill(WORDING.stepCopy, values) }
    ];
  }
}
