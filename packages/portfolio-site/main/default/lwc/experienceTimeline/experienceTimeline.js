/**
 * @description       : Work, Certifications and Education timeline on the home page.
 *                      Reads ResumeController.getTimeline and shows roles, current
 *                      certifications and schools under an accessible tab list, in that order,
 *                      with Work selected first. Renders nothing when every
 *                      list is empty and hides a tab whose list is empty.
 *                      Each tab shows its first tabLimit entries (from the server, 5 when it
 *                      sends nothing usable). A longer tab gets a real "View all N" button with
 *                      aria-expanded and aria-controls that shows the rest in place and then
 *                      reads "Show fewer". Each tab keeps its own state and focus stays on the
 *                      button. The Certifications tab ends with one "Verify on Trailhead" link
 *                      when the server sends a verification link, used exactly as sent.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { LightningElement, wire } from "lwc";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import { trackEvent, EVENTS } from "c/analyticsService";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

const WORK = "work";
const EDUCATION = "education";
const CERTIFICATIONS = "certifications";

// Tab order and labels: Work, Certifications, Education. The arrow, Home and End keys follow
// this order. The keys are also the analytics tab values.
const TAB_LABELS = [
  [WORK, "Work"],
  [CERTIFICATIONS, "Certifications"],
  [EDUCATION, "Education"]
];

// Entries per tab before "View all" when the server sends no usable limit.
const DEFAULT_TAB_LIMIT = 5;

const HTTP_URL = /^https?:\/\//i;

/**
 * Formats an Apex Date ("YYYY-MM-DD") as "Mon YYYY" without the browser time zone, which can
 * move a first-of-month date into the previous month.
 * @param {string} value Apex Date
 * @returns {string} "Mon YYYY", or "" when there is no date
 */
export function formatMonthYear(value) {
  if (!value) {
    return "";
  }
  const match = /^(\d{4})-(\d{2})/.exec(String(value));
  if (!match) {
    return "";
  }
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : match[1];
}

/**
 * "Mon YYYY to Present" for a current role, "Mon YYYY to Mon YYYY" for a past one.
 * @param {object} role TimelineRole
 * @returns {string} date range
 */
export function formatRoleDates(role) {
  const start = formatMonthYear(role.startDate);
  const end =
    role.isCurrent || !role.endDate ? "Present" : formatMonthYear(role.endDate);
  return start ? `${start} to ${end}` : end;
}

/**
 * The number of entries a tab shows at first: a whole number of 1 or more, else the default.
 * @param {*} value tabLimit from the server
 * @returns {number} the limit
 */
export function toTabLimit(value) {
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_TAB_LIMIT;
}

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export default class ExperienceTimeline extends LightningElement {
  work = [];
  education = [];
  certifications = [];
  verificationUrl = null;
  tabLimit = DEFAULT_TAB_LIMIT;
  selectedTab = WORK;
  expandedTabs = {};
  focusTabOnRender = false;
  focusToggleOnRender = null;
  newTabNote = ", opens in a new tab";

  @wire(getTimeline)
  wiredTimeline({ data, error }) {
    if (data) {
      this.work = (data.work || []).map((role, index) => ({
        key: role.key || `role-${index}`,
        title: clean(role.title),
        org: clean(role.employer),
        dates: formatRoleDates(role)
      }));
      this.education = (data.education || []).map((school, index) => ({
        key: school.key || `school-${index}`,
        title: clean(school.school),
        org: [clean(school.credential), clean(school.fieldOfStudy)]
          .filter((part) => part)
          .join(", "),
        dates: formatMonthYear(school.completedDate)
      }));
      this.certifications = (data.certifications || []).map(
        (certification, index) => ({
          key: certification.id || `certification-${index}`,
          title: clean(certification.name),
          org: clean(certification.issuer),
          dates: formatMonthYear(certification.earnedDate)
        })
      );
      this.verificationUrl =
        typeof data.verificationUrl === "string" &&
        HTTP_URL.test(data.verificationUrl)
          ? data.verificationUrl
          : null;
      this.tabLimit = toTabLimit(data.tabLimit);
      const first = this.visibleTabs[0];
      if (first && !this.entriesFor(this.selectedTab).length) {
        this.selectedTab = first;
      }
    } else if (error) {
      // The timeline is an extra on the home page. On an error it stays hidden.
      this.work = [];
      this.education = [];
      this.certifications = [];
      this.verificationUrl = null;
    }
  }

  entriesFor(tab) {
    if (tab === WORK) {
      return this.work;
    }
    if (tab === EDUCATION) {
      return this.education;
    }
    if (tab === CERTIFICATIONS) {
      return this.certifications;
    }
    return [];
  }

  get hasAny() {
    return this.visibleTabs.length > 0;
  }

  get visibleTabs() {
    return TAB_LABELS.map(([key]) => key).filter(
      (key) => this.entriesFor(key).length > 0
    );
  }

  get activeTab() {
    const tabs = this.visibleTabs;
    return tabs.includes(this.selectedTab) ? this.selectedTab : tabs[0];
  }

  get tabs() {
    const active = this.activeTab;
    const limit = this.tabLimit;
    return TAB_LABELS.filter(([key]) => this.entriesFor(key).length > 0).map(
      ([key, label]) => {
        const entries = this.entriesFor(key);
        const isActive = key === active;
        const hasMore = entries.length > limit;
        const expanded = hasMore && Boolean(this.expandedTabs[key]);
        return {
          key,
          label,
          tabId: `timeline-tab-${key}`,
          panelId: `timeline-panel-${key}`,
          listId: `timeline-list-${key}`,
          selected: String(isActive),
          tabIndex: isActive ? "0" : "-1",
          hidden: !isActive,
          entries: expanded ? entries : entries.slice(0, limit),
          hasMore,
          expandedText: String(expanded),
          toggleLabel: expanded ? "Show fewer" : `View all ${entries.length}`,
          showVerify: key === CERTIFICATIONS && this.verificationUrl !== null
        };
      }
    );
  }

  selectTab(tab, moveFocus) {
    if (tab === this.activeTab) {
      return;
    }
    this.selectedTab = tab;
    this.focusTabOnRender = moveFocus;
    trackEvent(EVENTS.TIMELINE_TAB_CHANGED, { tab });
  }

  handleTabClick(event) {
    this.selectTab(event.currentTarget.dataset.tab, false);
  }

  handleTabKeydown(event) {
    const tabs = this.visibleTabs;
    const index = tabs.indexOf(this.activeTab);
    let next;
    switch (event.key) {
      case "ArrowRight":
        next = tabs[(index + 1) % tabs.length];
        break;
      case "ArrowLeft":
        next = tabs[(index - 1 + tabs.length) % tabs.length];
        break;
      case "Home":
        next = tabs[0];
        break;
      case "End":
        next = tabs[tabs.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    this.selectTab(next, true);
  }

  handleToggle(event) {
    const tab = event.currentTarget.dataset.tab;
    const expanded = !this.expandedTabs[tab];
    this.expandedTabs = { ...this.expandedTabs, [tab]: expanded };
    this.focusToggleOnRender = tab;
    trackEvent(EVENTS.TIMELINE_EXPANDED, { tab, expanded });
  }

  renderedCallback() {
    if (this.focusToggleOnRender) {
      const toggleTab = this.focusToggleOnRender;
      this.focusToggleOnRender = null;
      const toggle = this.template.querySelector(
        `[data-toggle][data-tab="${toggleTab}"]`
      );
      if (toggle && this.template.activeElement !== toggle) {
        toggle.focus();
      }
    }
    if (!this.focusTabOnRender) {
      return;
    }
    this.focusTabOnRender = false;
    const tab = this.template.querySelector(
      `[role="tab"][data-tab="${this.activeTab}"]`
    );
    if (tab) {
      tab.focus();
    }
  }
}
