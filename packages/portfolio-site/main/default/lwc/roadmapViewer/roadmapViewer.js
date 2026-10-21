/**
 * @description       : Roadmap board for the Delivery page. Reads the newest Jira cache row
 *                      through DeliveryController.getRoadmap (plan K3, pillar-e-design section
 *                      4.3). Columns are keyed on Jira's statusCategory, never on status names,
 *                      so a renamed workflow status cannot empty a column.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { LightningElement, wire } from "lwc";
import getRoadmap from "@salesforce/apex/DeliveryController.getRoadmap";

export const COLUMNS = [
  { category: "new", label: "To Do" },
  { category: "indeterminate", label: "In Progress" },
  { category: "done", label: "Done" }
];

const STATUS_BADGES = {
  SIMULATED: { label: "Simulated", className: "status-badge badge-simulated" },
  DEGRADED: { label: "Degraded", className: "status-badge badge-degraded" }
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

  @wire(getRoadmap)
  wiredRoadmap({ data, error }) {
    if (data) {
      this.feed = data;
      this.hasError = false;
    } else if (error) {
      this.feed = undefined;
      this.hasError = true;
    }
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
}
