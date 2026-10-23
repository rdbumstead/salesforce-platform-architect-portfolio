/**
 * @description       : Work and Education timeline on the home page.
 *                      Reads ResumeController.getTimeline and shows roles and
 *                      schools under an accessible tab list. Renders nothing when both lists are
 *                      empty and hides a tab whose list is empty.
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

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export default class ExperienceTimeline extends LightningElement {
  work = [];
  education = [];
  selectedTab = WORK;
  focusTabOnRender = false;

  @wire(getTimeline)
  wiredTimeline({ data, error }) {
    if (data) {
      this.work = (data.work || []).map((role, index) => ({
        key: role.key || `role-${index}`,
        title: clean(role.title),
        employer: clean(role.employer),
        dates: formatRoleDates(role)
      }));
      this.education = (data.education || []).map((school, index) => ({
        key: school.key || `school-${index}`,
        school: clean(school.school),
        credential: [clean(school.credential), clean(school.fieldOfStudy)]
          .filter((part) => part)
          .join(", "),
        completed: formatMonthYear(school.completedDate)
      }));
      if (!this.hasWork && this.hasEducation) {
        this.selectedTab = EDUCATION;
      }
    } else if (error) {
      // The timeline is an extra on the home page. On an error it stays hidden.
      this.work = [];
      this.education = [];
    }
  }

  get hasWork() {
    return this.work.length > 0;
  }

  get hasEducation() {
    return this.education.length > 0;
  }

  get hasAny() {
    return this.hasWork || this.hasEducation;
  }

  get visibleTabs() {
    const tabs = [];
    if (this.hasWork) {
      tabs.push(WORK);
    }
    if (this.hasEducation) {
      tabs.push(EDUCATION);
    }
    return tabs;
  }

  get activeTab() {
    const tabs = this.visibleTabs;
    return tabs.includes(this.selectedTab) ? this.selectedTab : tabs[0];
  }

  get isWorkActive() {
    return this.activeTab === WORK;
  }

  get isEducationActive() {
    return this.activeTab === EDUCATION;
  }

  get workSelected() {
    return String(this.isWorkActive);
  }

  get educationSelected() {
    return String(this.isEducationActive);
  }

  get workTabIndex() {
    return this.isWorkActive ? "0" : "-1";
  }

  get educationTabIndex() {
    return this.isEducationActive ? "0" : "-1";
  }

  get workPanelHidden() {
    return !this.isWorkActive;
  }

  get educationPanelHidden() {
    return !this.isEducationActive;
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

  renderedCallback() {
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
