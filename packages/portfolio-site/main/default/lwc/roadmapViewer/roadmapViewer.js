/**
 * @description       : Roadmap board for the Delivery page. Reads the newest Jira cache row
 *                      through DeliveryController.getRoadmap (plan K3, pillar-e-design section
 *                      4.3). Columns are keyed on Jira's statusCategory, never on status names,
 *                      so a renamed workflow status cannot empty a column. The "Simulate an
 *                      outage" switch (Round 4 plan L10, ADR-022) re-reads the feed with
 *                      simulate=true, which returns the same cached board marked SIMULATED.
 *                      DEGRADED means the Jira circuit breaker is open. roadmap_viewed is sent
 *                      once when the board is first shown on the page, and turning the switch
 *                      on sends resilience_test_triggered (plan L4). Round 6 plan N8: epic
 *                      cards come first in each column, a story names its epic as
 *                      "Part of {name} | {key}" (the key alone when the name is missing), and an
 *                      empty feed says so instead of reading as an outage. The outage line is
 *                      kept for a real wire error. Round 7 F7 (owner, 2026-10-23): every column
 *                      shows at most COLUMN_LIMIT cards with its own "Show all N" button and
 *                      state. Done keeps its newest COLUMN_LIMIT by updatedAt and its "Show all
 *                      N shipped" label. To Do and In Progress keep the feed order and cut there.
 *                      The c-view-source control (contract P2) sits in the header.
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

export const COLUMN_LIMIT = 8;
export const EMPTY_TEXT =
  "Nothing on the roadmap yet. It fills in from Jira after the next sync.";

export function ageLabel(ageMinutes) {
  if (ageMinutes === null || ageMinutes === undefined) {
    return "";
  }
  return `Last updated ${ageMinutes} min ago`;
}

// "Part of {name} | {key}", or "Part of {key}" for an old cache row or a parent with no name.
export function parentLabel(epicName, epicKey) {
  if (!epicKey) {
    return "";
  }
  return epicName ? `Part of ${epicName} | ${epicKey}` : `Part of ${epicKey}`;
}

function toCard(item) {
  const isEpic = item.type === "Epic";
  return {
    key: item.key,
    summary: item.summary,
    type: item.type,
    isEpic,
    parentText: isEpic ? "" : parentLabel(item.epicName, item.epicKey),
    className: isEpic ? "roadmap-card card-epic" : "roadmap-card"
  };
}

// Epic cards above story cards. Otherwise the order given is kept (the sort is stable).
function epicsFirst(cards) {
  return [...cards].sort((a, b) => Number(b.isEpic) - Number(a.isEpic));
}

function updatedTime(item) {
  const time = Date.parse(item.updatedAt);
  return Number.isNaN(time) ? 0 : time;
}

// The newest COLUMN_LIMIT items by updatedAt, and the rest. Ties keep the feed order.
function splitNewest(items) {
  const newest = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) => updatedTime(b.item) - updatedTime(a.item) || a.index - b.index
    )
    .slice(0, COLUMN_LIMIT)
    .map((entry) => entry.item);
  const shown = new Set(newest);
  return {
    visible: items.filter((item) => shown.has(item)),
    hidden: items.filter((item) => !shown.has(item))
  };
}

// The first COLUMN_LIMIT items in feed order, and the rest.
function splitFirst(items) {
  return {
    visible: items.slice(0, COLUMN_LIMIT),
    hidden: items.slice(COLUMN_LIMIT)
  };
}

export default class RoadmapViewer extends LightningElement {
  feed;
  hasError = false;
  simulate = false;
  viewTracked = false;
  // Which columns show every card, keyed by category. Each column has its own state.
  expanded = {};

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
    if (this.simulate) {
      trackEvent(EVENTS.RESILIENCE_TEST_TRIGGERED, { source: "roadmap" });
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

  // A failed read. An empty feed is not an outage and gets its own line.
  get showUnavailable() {
    return this.hasError;
  }

  get showEmpty() {
    return !this.hasError && !!this.feed && !this.showBoard;
  }

  get emptyText() {
    return EMPTY_TEXT;
  }

  get columns() {
    return COLUMNS.map((column) => {
      const items = this.items.filter(
        (item) => item.statusCategory === column.category
      );
      const isDone = column.category === "done";
      const isCapped = items.length > COLUMN_LIMIT;
      const isExpanded = Boolean(this.expanded[column.category]);
      let split = { visible: items, hidden: [] };
      if (isCapped) {
        split = isDone ? splitNewest(items) : splitFirst(items);
      }
      const hiddenCards =
        isCapped && isExpanded ? epicsFirst(split.hidden.map(toCard)) : [];
      const showAllLabel = isDone
        ? `Show all ${items.length} shipped`
        : `Show all ${items.length}`;
      return {
        ...column,
        headingId: `roadmap-column-${column.category}`,
        moreId: `roadmap-${column.category}-more`,
        cards: epicsFirst(split.visible.map(toCard)),
        hiddenCards,
        hasHidden: hiddenCards.length > 0,
        isCapped,
        toggleLabel: isExpanded ? "Show fewer" : showAllLabel,
        toggleExpanded: String(isExpanded),
        count: items.length,
        isEmpty: items.length === 0
      };
    });
  }

  handleToggle(event) {
    const category = event.currentTarget.dataset.category;
    this.expanded = {
      ...this.expanded,
      [category]: !this.expanded[category]
    };
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
