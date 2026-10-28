/**
 * @description       : Roadmap board for the Delivery page. Reads the newest Jira cache row
 *                      through DeliveryController.getRoadmap.
 *                      Columns are keyed on Jira's statusCategory, never on status names,
 *                      so a renamed workflow status cannot empty a column. The "Simulate an
 *                      outage" switch (ADR-022) sits beside the "Last updated" label and is the
 *                      one switch for this board and for Latest Updates, shared through
 *                      c/outageSimulation. It re-reads the feed with
 *                      simulate=true, which returns the same cached board marked SIMULATED.
 *                      DEGRADED means the Jira circuit breaker is open. roadmap_viewed is sent
 *                      once when the board is first shown on the page, and turning the switch
 *                      on sends resilience_test_triggered. Epic
 *                      cards come first in each column, a story names its epic as
 *                      "Part of {name}" (the key when the name is missing), and an
 *                      empty feed says so instead of reading as an outage. The outage line is
 *                      kept for a real wire error. Every column
 *                      shows at most the feed's columnLimit cards (COLUMN_LIMIT when the feed
 *                      has none) with its own "Show all N" button and state. Done keeps its
 *                      newest cards by updatedAt and its "Show all N shipped" label. To Do and
 *                      In Progress keep the feed order and cut there. Below 768 px the three
 *                      columns become tabs (To Do, In Progress, Done) that open on In Progress,
 *                      with the arrow keys, Home and End moving between them. On wider screens
 *                      all three columns show and none of the tab roles apply.
 *                      The tour's "Show me" for stop E opens the In Progress tab and moves focus to
 *                      its tab on a phone, or to the In Progress column heading otherwise.
 *                      The c-view-source control is the last item of the title row, at the right.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/03/2026
 **/
import { LightningElement, wire } from "lwc";
import getRoadmap from "@salesforce/apex/DeliveryController.getRoadmap";
import { trackEvent, EVENTS } from "c/analyticsService";
import { onShowMe, revealAnchor } from "c/tourShowMe";
import {
  isSimulating,
  setSimulating,
  onSimulatingChange
} from "c/outageSimulation";

// The width below which the columns become tabs. The stylesheet stacks them at the same width.
export const PHONE_QUERY = "(max-width: 767px)";
export const DEFAULT_TAB = "indeterminate";
// The tour's stop E points at the In Progress column, or its tab on a phone.
export const TOUR_STOP = "E";
export const SIMULATE_HINT =
  "See how the roadmap and Latest Updates behave if Jira or GitHub is down.";

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

// Cards per column when the feed carries no columnLimit of its own.
export const COLUMN_LIMIT = 8;
export const EMPTY_TEXT =
  "Nothing on the roadmap yet. It fills in from Jira after the next sync.";

export function ageLabel(ageMinutes) {
  if (ageMinutes === null || ageMinutes === undefined) {
    return "";
  }
  return `Last updated ${ageMinutes} min ago`;
}

// "Part of {name}", or "Part of {key}" for an old cache row or a parent with no name.
export function parentLabel(epicName, epicKey) {
  if (!epicKey) {
    return "";
  }
  return epicName ? `Part of ${epicName}` : `Part of ${epicKey}`;
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

// A whole number of 1 or more from the feed, else COLUMN_LIMIT.
export function columnLimitOf(feed) {
  const value = feed ? feed.columnLimit : undefined;
  return Number.isInteger(value) && value >= 1 ? value : COLUMN_LIMIT;
}

// The newest limit items by updatedAt, and the rest. Ties keep the feed order.
function splitNewest(items, limit) {
  const newest = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) => updatedTime(b.item) - updatedTime(a.item) || a.index - b.index
    )
    .slice(0, limit)
    .map((entry) => entry.item);
  const shown = new Set(newest);
  return {
    visible: items.filter((item) => shown.has(item)),
    hidden: items.filter((item) => !shown.has(item))
  };
}

// The first limit items in feed order, and the rest.
function splitFirst(items, limit) {
  return {
    visible: items.slice(0, limit),
    hidden: items.slice(limit)
  };
}

export default class RoadmapViewer extends LightningElement {
  feed;
  hasError = false;
  simulate = false;
  viewTracked = false;
  // Which columns show every card, keyed by category. Each column has its own state.
  expanded = {};
  // Whether the screen is phone width, and which tab is open there.
  isPhone = false;
  activeCategory = DEFAULT_TAB;
  simulateHint = SIMULATE_HINT;
  phoneQuery;
  stopListening;
  stopShowMe;

  handlePhoneChange = (event) => {
    this.isPhone = Boolean(event.matches);
  };

  connectedCallback() {
    if (!this.viewTracked) {
      this.viewTracked = true;
      trackEvent(EVENTS.ROADMAP_VIEWED);
    }
    this.simulate = isSimulating();
    this.stopListening = onSimulatingChange((value) => {
      this.simulate = value;
    });
    this.watchPhoneWidth();
    this.stopShowMe = onShowMe(TOUR_STOP, () => this.showInProgress());
  }

  // Opens the In Progress tab where there are tabs, then scrolls to and focuses the marked
  // control: the tab on a phone, the column heading beside the other columns.
  showInProgress() {
    this.activeCategory = DEFAULT_TAB;
    revealAnchor(this.template);
  }

  disconnectedCallback() {
    if (this.stopShowMe) {
      this.stopShowMe();
      this.stopShowMe = undefined;
    }
    if (this.stopListening) {
      this.stopListening();
      this.stopListening = undefined;
    }
    if (this.phoneQuery && this.phoneQuery.removeEventListener) {
      this.phoneQuery.removeEventListener("change", this.handlePhoneChange);
    }
    this.phoneQuery = undefined;
  }

  // matchMedia is missing in some test and embedded settings. Then the board stays a board.
  watchPhoneWidth() {
    try {
      if (typeof window === "undefined" || !window.matchMedia) {
        return;
      }
      this.phoneQuery = window.matchMedia(PHONE_QUERY);
      this.isPhone = Boolean(this.phoneQuery.matches);
      if (this.phoneQuery.addEventListener) {
        this.phoneQuery.addEventListener("change", this.handlePhoneChange);
      }
    } catch {
      this.isPhone = false;
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
    // The shared state tells this board and Latest Updates, this board's own listener included.
    setSimulating(event.target.checked);
    if (event.target.checked) {
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
    const limit = columnLimitOf(this.feed);
    return COLUMNS.map((column) => {
      const items = this.items.filter(
        (item) => item.statusCategory === column.category
      );
      const isDone = column.category === "done";
      const isCapped = items.length > limit;
      const isExpanded = Boolean(this.expanded[column.category]);
      let split = { visible: items, hidden: [] };
      if (isCapped) {
        split = isDone ? splitNewest(items, limit) : splitFirst(items, limit);
      }
      const hiddenCards =
        isCapped && isExpanded ? epicsFirst(split.hidden.map(toCard)) : [];
      const showAllLabel = isDone
        ? `Show all ${items.length} shipped`
        : `Show all ${items.length}`;
      const isActive = column.category === this.activeCategory;
      return {
        ...column,
        isActive,
        panelId: `panel-${column.category}`,
        // A column is a tab panel only where the tabs show.
        columnClass:
          this.isPhone && !isActive
            ? "roadmap-column column-hidden"
            : "roadmap-column",
        panelRole: this.isPhone ? "tabpanel" : undefined,
        panelLabelledBy: this.isPhone ? `tab-${column.category}` : undefined,
        panelHidden: this.isPhone && !isActive,
        tabId: `tab-${column.category}`,
        tabLabel: column.label,
        tabCount: ` (${items.length})`,
        tabSelected: String(isActive),
        tabIndex: isActive ? "0" : "-1",
        headingId: `roadmap-column-${column.category}`,
        // The tour's anchor is the heading beside the other columns, and the tab on a phone.
        columnTourAnchor:
          column.category === DEFAULT_TAB && !this.isPhone ? "true" : undefined,
        titleTabIndex:
          column.category === DEFAULT_TAB && !this.isPhone ? "-1" : undefined,
        tourAnchor:
          column.category === DEFAULT_TAB && this.isPhone ? "true" : undefined,
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

  handleTabClick(event) {
    this.activeCategory = event.currentTarget.dataset.category;
  }

  // Arrow keys move between the tabs, Home and End jump to the first and last.
  handleTabKeydown(event) {
    const last = COLUMNS.length - 1;
    const current = COLUMNS.findIndex(
      (column) => column.category === this.activeCategory
    );
    let next = -1;
    if (event.key === "ArrowRight") {
      next = current >= last ? 0 : current + 1;
    } else if (event.key === "ArrowLeft") {
      next = current <= 0 ? last : current - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = last;
    }
    if (next < 0) {
      return;
    }
    event.preventDefault();
    this.activeCategory = COLUMNS[next].category;
    this.focusTab = COLUMNS[next].category;
  }

  renderedCallback() {
    if (this.focusTab) {
      const tab = this.template.querySelector(`[data-tab="${this.focusTab}"]`);
      this.focusTab = "";
      if (tab) {
        tab.focus();
      }
    }
  }

  get tabs() {
    return this.columns.map((column) => ({
      category: column.category,
      tabId: column.tabId,
      tabLabel: column.tabLabel,
      tabCount: column.tabCount,
      tabSelected: column.tabSelected,
      tabIndex: column.tabIndex,
      panelId: column.panelId,
      tourAnchor: column.tourAnchor,
      className: column.isActive ? "tab tab-active" : "tab"
    }));
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
