/**
 * @description       : The career line under the home hero, so a visitor sees the arc of the
 *                      work history at a glance. The roles come from ResumeController.getTimeline,
 *                      newest first, each with the employer, the role title and its years
 *                      ("2026 to now"). Each role's highlights come from
 *                      ResumeController.getResume for the Architect persona, the resume page's
 *                      default read, matched by the role's Experience Id.
 *                      At 768 px and up the roles sit on one horizontal line that scrolls
 *                      sideways inside its own region when they do not all fit, with a fade at
 *                      the edge that still has roles beyond it. Below 768 px the latest three
 *                      roles show as a short vertical list.
 *                      A role with highlights is a button that opens them in place (under the
 *                      line, or under the role in the phone list), with aria-expanded and
 *                      aria-controls. One role is open at a time, pressing it again closes it,
 *                      and Escape closes it and puts focus back on its button. A role with no
 *                      highlights is a plain point.
 *                      "See the full timeline" opens c-experience-timeline right under the line
 *                      and "Hide the full timeline" closes it. The timeline is only in the page
 *                      while it is open. Focus moves to the opened timeline and back to the
 *                      button on close.
 *                      Openings fade and slide in for about 200 ms, and appear at once when the
 *                      visitor asks for reduced motion (c/motionPreference).
 *                      Renders nothing when the role read fails or has no roles. When only the
 *                      highlight read fails, the line still shows with plain points.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { LightningElement, wire } from "lwc";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import getResume from "@salesforce/apex/ResumeController.getResume";
import { isReduced } from "c/motionPreference";

/** The persona whose highlights a role opens: the resume page's default view. */
export const HIGHLIGHT_PERSONA = "Architect";

/** How many roles the phone list shows. */
export const PHONE_ROLES = 3;

const LINE = "line";
const STACK = "stack";
const LINE_PANEL_ID = "career-panel";
const TIMELINE_ID = "career-timeline";
const OPEN_TIMELINE_LABEL = "See the full timeline";
const CLOSE_TIMELINE_LABEL = "Hide the full timeline";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function yearOf(value) {
  const match = /^(\d{4})/.exec(
    clean(value === undefined ? "" : String(value))
  );
  return match ? match[1] : "";
}

/**
 * The years of a role: "2026 to now", "2021 to 2025", "2016" when it started and ended in one
 * year, or the one year known when the other is missing.
 * @param {object} role a TimelineRole
 * @returns {string} the years
 */
export function formatYears(role) {
  const start = yearOf(role.startDate);
  // The same rule as the full timeline: a current role, or one with no end date, runs to now.
  const end =
    role.isCurrent === true || !role.endDate ? "now" : yearOf(role.endDate);
  if (start && end) {
    return start === end ? start : `${start} to ${end}`;
  }
  if (start) {
    return start;
  }
  return end === "now" ? "Now" : end;
}

/**
 * Highlights by role Id from a getResume result. Every other part of the resume is ignored.
 * @param {object} resume the ResumeData
 * @returns {Map<string, string[]>} the highlights of each role
 */
export function highlightsById(resume) {
  const byId = new Map();
  const roles = resume && Array.isArray(resume.roles) ? resume.roles : [];
  roles.forEach((role) => {
    if (!role || !role.id) {
      return;
    }
    const highlights = Array.isArray(role.highlights)
      ? role.highlights.map(clean).filter((text) => text)
      : [];
    byId.set(String(role.id), highlights);
  });
  return byId;
}

export default class CareerLine extends LightningElement {
  // Spoken between the employer, the title and the years, which sit on separate lines.
  comma = ", ";
  roles = [];
  highlights = new Map();
  openKey = null;
  openList = null;
  revealKey = null;
  timelineOpen = false;
  revealTimeline = false;
  focusAfterRender = null;
  edgeStart = false;
  edgeEnd = false;
  resizeListener = () => this.updateEdges();

  @wire(getTimeline)
  wiredTimeline({ data, error }) {
    if (data) {
      this.roles = (Array.isArray(data.work) ? data.work : [])
        .filter((role) => role && clean(role.title))
        .map((role, index) => ({
          key: clean(role.key) || `role-${index}`,
          title: clean(role.title),
          employer: clean(role.employer),
          years: formatYears(role),
          isCurrent: role.isCurrent === true
        }));
    } else if (error) {
      // An extra under the hero: on an error it stays hidden.
      this.roles = [];
    }
  }

  @wire(getResume, { persona: HIGHLIGHT_PERSONA })
  wiredResume({ data, error }) {
    if (data) {
      this.highlights = highlightsById(data);
    } else if (error) {
      // Without highlights the roles still show, as plain points.
      this.highlights = new Map();
    }
  }

  connectedCallback() {
    window.addEventListener("resize", this.resizeListener);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.resizeListener);
  }

  get hasRoles() {
    return this.roles.length > 0;
  }

  decorate(role, index, list) {
    const highlights = this.highlights.get(role.key) || [];
    const open = this.openKey === role.key && this.openList === list;
    const stackPanelId = `career-stack-panel-${index}`;
    return {
      ...role,
      highlights: highlights.map((text, position) => ({
        key: `${role.key}-${position}`,
        text
      })),
      hasHighlights: highlights.length > 0,
      meta: [role.employer, role.years].filter((part) => part).join(", "),
      expanded: String(open),
      controls: list === LINE ? LINE_PANEL_ID : stackPanelId,
      stackPanelId,
      stackPanelHidden: !(open && list === STACK),
      stackPanelClass: this.panelClass(role.key, STACK),
      pointClass: `point${role.isCurrent ? " point-current" : ""}${
        open ? " point-open" : ""
      }`
    };
  }

  panelClass(key, list) {
    return this.revealKey === key && this.openList === list
      ? "panel panel-reveal"
      : "panel";
  }

  get lineRoles() {
    return this.roles.map((role, index) => this.decorate(role, index, LINE));
  }

  get stackRoles() {
    return this.roles
      .slice(0, PHONE_ROLES)
      .map((role, index) => this.decorate(role, index, STACK));
  }

  get openRole() {
    if (!this.openKey || this.openList !== LINE) {
      return null;
    }
    const index = this.roles.findIndex((role) => role.key === this.openKey);
    return index < 0 ? null : this.decorate(this.roles[index], index, LINE);
  }

  get linePanelHidden() {
    return this.openRole === null;
  }

  get linePanelClass() {
    return this.panelClass(this.openKey, LINE);
  }

  // A scroll region needs a tab stop when nothing inside it can take focus.
  get lineTabIndex() {
    return this.roles.some(
      (role) => (this.highlights.get(role.key) || []).length
    )
      ? undefined
      : "0";
  }

  get lineWrapClass() {
    let name = "line-wrap";
    if (this.edgeStart) {
      name += " line-wrap_more-before";
    }
    if (this.edgeEnd) {
      name += " line-wrap_more-after";
    }
    return name;
  }

  get timelineExpanded() {
    return String(this.timelineOpen);
  }

  get timelineHidden() {
    return !this.timelineOpen;
  }

  get timelineLabel() {
    return this.timelineOpen ? CLOSE_TIMELINE_LABEL : OPEN_TIMELINE_LABEL;
  }

  get timelineClass() {
    return this.revealTimeline ? "full-timeline panel-reveal" : "full-timeline";
  }

  handleRoleClick(event) {
    const { key, list } = event.currentTarget.dataset;
    if (this.openKey === key && this.openList === list) {
      this.closeRole(false);
      return;
    }
    this.openKey = key;
    this.openList = list;
    this.revealKey = isReduced() ? null : key;
  }

  closeRole(moveFocus) {
    const key = this.openKey;
    const list = this.openList;
    this.openKey = null;
    this.openList = null;
    this.revealKey = null;
    if (moveFocus && key) {
      this.focusAfterRender = `[data-role-button][data-list="${list}"][data-key="${key}"]`;
    }
  }

  handleKeydown(event) {
    if (event.key !== "Escape" || !this.openKey) {
      return;
    }
    // Keys pressed inside the opened full timeline belong to it.
    const timeline = this.template.querySelector('[data-id="full-timeline"]');
    if (timeline && timeline.contains(event.target)) {
      return;
    }
    event.preventDefault();
    this.closeRole(true);
  }

  handleTimelineToggle() {
    this.timelineOpen = !this.timelineOpen;
    this.revealTimeline = this.timelineOpen && !isReduced();
    this.focusAfterRender = this.timelineOpen
      ? '[data-id="full-timeline"]'
      : '[data-id="timeline-toggle"]';
  }

  handleLineScroll() {
    this.updateEdges();
  }

  updateEdges() {
    const line = this.template.querySelector('[data-id="line"]');
    if (!line) {
      return;
    }
    const room = line.scrollWidth - line.clientWidth;
    const start = room > 1 && line.scrollLeft > 1;
    const end = room > 1 && line.scrollLeft < room - 1;
    if (start !== this.edgeStart) {
      this.edgeStart = start;
    }
    if (end !== this.edgeEnd) {
      this.edgeEnd = end;
    }
  }

  renderedCallback() {
    this.updateEdges();
    if (!this.focusAfterRender) {
      return;
    }
    const selector = this.focusAfterRender;
    this.focusAfterRender = null;
    const target = this.template.querySelector(selector);
    if (target) {
      target.focus();
    }
  }
}
