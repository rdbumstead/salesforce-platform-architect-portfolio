/**
 * @description       : Roadmap board for the Delivery page. Reads the newest Jira cache row
 *                      through DeliveryController.getRoadmap (plan K3, pillar-e-design section
 *                      4.3). Columns are keyed on Jira's statusCategory, never on status names,
 *                      so a renamed workflow status cannot empty a column. The "Simulate an
 *                      outage" switch (Round 4 plan L10, ADR-022) re-reads the feed with
 *                      simulate=true, which returns the same cached board marked SIMULATED.
 *                      DEGRADED means the Jira circuit breaker is open. roadmap_viewed is sent
 *                      once when the board is first shown on the page (plan L4).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { LightningElement, wire } from "lwc";
import getRoadmap from "@salesforce/apex/DeliveryController.getRoadmap";
import { trackEvent, EVENTS } from "c/analyticsService";

export const COLUMNS = [
  { category: "new", label: "To Do" },
  { category: "indeterminate", label: "In Progress" },
  { category: "done", label: "Done" }
];

const STATUS_BADGES = {
  SIMULATED: { label: "Simulated", className: "status-badge badge-simulated" },
  DEGRADED: { label: "Degraded", className: "status-badge badge-degraded" }
};

export const STATUS_NOTES = {
  SIMULATED:
    "Simulated outage. This is the last cached roadmap, and no call was made to Jira.",
  DEGRADED:
    "Jira is not answering right now. This is the last roadmap we saved."
};

export function ageLabel(ageMinutes) {
  if (ageMinutes === null || ageMinutes === undefined) {
    return "";
  }
  return `Last updated ${ageMinutes} min ago`;
}

function toCard(item) {
  const isEpic = item.type === "Epic";
  return {
    key: item.key,
    summary: item.summary,
    type: item.type,
    isEpic,
    epicKey: isEpic ? null : item.epicKey,
    className: isEpic ? "roadmap-card card-epic" : "roadmap-card"
  };
}

export default class RoadmapViewer extends LightningElement {
  feed;
  hasError = false;
  simulate = false;
  viewTracked = false;

  connectedCallback() {
    if (!this.viewTracked) {
      this.viewTracked = true;
      trackEvent(EVENTS.ROADMAP_VIEWED);
    }
  }

  @wire(getRoadmap, { simulate: "$simulate" })
  wiredRoadmap({ data, error }) {
    if (data) {
      this.feed = data;
      this.hasError = false;
    } else if (error) {
      this.feed = undefined;
      this.hasError = true;
    }
  }

  handleSimulateChange(event) {
    this.simulate = event.target.checked;
  }

  get isLoading() {
    return !this.feed && !this.hasError;
  }

  get status() {
    return this.feed ? this.feed.status : null;
  }

  get items() {
    if (!this.feed || this.status === "EMPTY") {
      return [];
    }
    return this.feed.items || [];
  }

  get showBoard() {
    return this.items.length > 0;
  }

  get showUnavailable() {
    return this.hasError || (!!this.feed && !this.showBoard);
  }

  get columns() {
    return COLUMNS.map((column) => {
      const cards = this.items
        .filter((item) => item.statusCategory === column.category)
        .map(toCard);
      return {
        ...column,
        headingId: `roadmap-column-${column.category}`,
        cards,
        count: cards.length,
        isEmpty: cards.length === 0
      };
    });
  }

  get ageText() {
    return this.status && this.status !== "EMPTY"
      ? ageLabel(this.feed.ageMinutes)
      : "";
  }

  get ageClass() {
    return this.status === "STALE" ? "age-label age-stale" : "age-label";
  }

  get statusBadge() {
    return STATUS_BADGES[this.status] || null;
  }

  get statusNote() {
    return STATUS_NOTES[this.status] || "";
  }
}
