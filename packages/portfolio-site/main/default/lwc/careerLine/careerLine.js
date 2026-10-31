/**
 * @description       : The work timeline under the home hero, from ResumeController.getTimeline.
 *                      Work only. Roles are grouped by employer name and each employer is one
 *                      stop on a single slim track, in the server's order of first appearance
 *                      (current first, then newest). Five stops share a row at 768 px and up
 *                      with no sideways scroll. Below 768 px the track stacks in one column with
 *                      the line on the left.
 *                      A stop shows its employer, its span ("2026 to now", "2021 to 2026"), the
 *                      title of its newest role that is not part time (the newest role when all
 *                      are part time) and a "N roles" count with a Details button. A filled dot
 *                      marks an employer held now, an outlined dot a past one. Every role that
 *                      ended before the year the owner started on Salesforce
 *                      (salesforceStartYear from the read, 2017 when it sends nothing usable)
 *                      folds into one last stop, "Earlier roles", with a gray outlined dot.
 *                      The button is a real disclosure: aria-expanded flips, aria-controls names
 *                      the panel that opens under that stop inside its own column, and focus
 *                      stays on the button. Any number of stops can be open at once. In a
 *                      panel each role shows its title, its years with " · part time" when the
 *                      read says so, and its highlights (up to 3), each wrapping in full. The
 *                      Earlier roles panel lists each role as a line of text that may wrap
 *                      (title, employer, years), with no bullets, then a "See the full resume" link.
 *                      "Expand all" beside the intro line opens every panel together and reads
 *                      "Collapse all" once every stop is open. A panel reveals in 180 ms with a
 *                      height change and a fade, and not at all when the system asks for reduced
 *                      motion.
 *                      Opening a stop sends career_role_opened with its position (1 is the
 *                      newest). Expand all and Collapse all send career_timeline_toggled with
 *                      expanded. Under the track sits one primary "See the full resume" button.
 *                      Renders nothing when the timeline read fails or has no roles.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
import { LightningElement, wire } from "lwc";
import basePath from "@salesforce/community/basePath";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import { trackEvent, EVENTS } from "c/analyticsService";
import { SALESFORCE_START_YEAR } from "c/pillarData";
import { isReduced, onMotionChange } from "c/motionPreference";

const FOLD_KEY = "earlier-roles";
const FOLD_TITLE = "Earlier roles";
const MAX_HIGHLIGHTS = 3;
const CLOSED_LABEL = "Details ▾";
const OPEN_LABEL = "Hide ▴";
// A role held now sorts after every real date when roles are ordered.
const HELD_NOW = "9999-12-31";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function dateText(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(asText(value));
  return match ? match[1] : "";
}

function yearOf(value) {
  const match = /^(\d{4})/.exec(asText(value));
  return match ? match[1] : "";
}

// A lower case slug for a group key: "Example Employer Inc" gives "example-employer-inc".
function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Whether a role is held now: a current role, or one with no end date.
 * @param {object} role a TimelineRole
 * @returns {boolean} true when the role is held now
 */
export function isCurrentRole(role) {
  return role.isCurrent === true || !role.endDate;
}

/**
 * The years of a role as shown: "2026 to now" for a role held now, "2021 to 2025", "2016" when
 * it started and ended in one year, or the one year known when the other is missing.
 * @param {object} role a TimelineRole
 * @returns {string} the years
 */
export function formatYears(role) {
  const start = yearOf(role.startDate);
  if (isCurrentRole(role)) {
    return start ? `${start} to now` : "now";
  }
  const end = yearOf(role.endDate);
  if (start && end) {
    return start === end ? start : `${start} to ${end}`;
  }
  return start || end;
}

/**
 * The year roles fold by: a whole number from the server, else the fallback year.
 * @param {*} value salesforceStartYear from the server
 * @returns {number} the year
 */
export function toStartYear(value) {
  return Number.isInteger(value) && value > 0 ? value : SALESFORCE_START_YEAR;
}

/**
 * Whether a role folds into "Earlier roles": it is not held now and it ended before the
 * start year. A role that started before the start year and ran past it stays on the track.
 * @param {object} role a TimelineRole
 * @param {number} startYear the year roles fold by
 * @returns {boolean} true when the role folds
 */
export function foldsAway(role, startYear) {
  if (isCurrentRole(role)) {
    return false;
  }
  const end = yearOf(role.endDate);
  return Boolean(end) && Number(end) < startYear;
}

/**
 * The earliest to the latest year of some roles: "2012 to 2016", or one year when they match.
 * @param {object[]} roles the TimelineRoles
 * @returns {string} the years
 */
export function foldYears(roles) {
  const years = [];
  roles.forEach((role) => {
    [role.startDate, role.endDate].forEach((value) => {
      const year = yearOf(value);
      if (year) {
        years.push(Number(year));
      }
    });
  });
  if (!years.length) {
    return "";
  }
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? String(first) : `${first} to ${last}`;
}

/**
 * The years an employer covers: "2021 to now" when any role in it is held now, otherwise the
 * earliest to the latest year ("2017 to 2021").
 * @param {object[]} roles the TimelineRoles at one employer
 * @returns {string} the years
 */
export function employerYears(roles) {
  if (!roles.some(isCurrentRole)) {
    return foldYears(roles);
  }
  const starts = roles
    .map((role) => yearOf(role.startDate))
    .filter((year) => year)
    .map(Number);
  return starts.length ? `${Math.min(...starts)} to now` : "now";
}

// When a role was last held. A role with no end date known gives no place.
function roleWhen(role) {
  return isCurrentRole(role) ? HELD_NOW : dateText(role.endDate) || null;
}

// The year a role was last held as a visitor reads it: "now" sorts after any year.
function endYearOf(role) {
  return isCurrentRole(role) ? "now" : yearOf(role.endDate);
}

// Newest first inside an employer, in the terms a visitor sees: held now first, then the latest
// end year, then the latest start year. Roles with the same years read the same, so the full
// time role goes ahead of the part time one. Exact dates break any tie left, then the server's
// order.
function byNewestRole(a, b) {
  const endA = endYearOf(a.role);
  const endB = endYearOf(b.role);
  if (endA !== endB) {
    return endA > endB ? -1 : 1;
  }
  const startA = yearOf(a.role.startDate);
  const startB = yearOf(b.role.startDate);
  if (startA !== startB) {
    return startA > startB ? -1 : 1;
  }
  const partA = a.role.isPartTime === true;
  const partB = b.role.isPartTime === true;
  if (partA !== partB) {
    return partA ? 1 : -1;
  }
  const whenA = roleWhen(a.role) || "";
  const whenB = roleWhen(b.role) || "";
  if (whenA !== whenB) {
    return whenA > whenB ? -1 : 1;
  }
  const fullStartA = dateText(a.role.startDate);
  const fullStartB = dateText(b.role.startDate);
  if (fullStartA !== fullStartB) {
    return fullStartA > fullStartB ? -1 : 1;
  }
  return a.index - b.index;
}

/**
 * The count line of a stop: "1 role" or "4 roles".
 * @param {number} count the roles in the stop
 * @returns {string} the text
 */
export function rolesLabel(count) {
  return count === 1 ? "1 role" : `${count} roles`;
}

/**
 * Up to 3 non empty highlight strings from a role.
 * @param {object} role a TimelineRole
 * @returns {string[]} the highlights
 */
export function highlightsOf(role) {
  return (Array.isArray(role.highlights) ? role.highlights : [])
    .map(clean)
    .filter((text) => text)
    .slice(0, MAX_HIGHLIGHTS);
}

function toRole(role, index) {
  const partTime = role.isPartTime === true;
  const years = formatYears(role);
  const key = clean(role.key) || `role-${index}`;
  const highlights = highlightsOf(role).map((text, at) => ({
    id: `${key}-h${at}`,
    text
  }));
  return {
    key,
    title: clean(role.title),
    employer: clean(role.employer),
    years,
    yearsText: partTime ? `${years} · part time` : years,
    isPartTime: partTime,
    isCurrent: isCurrentRole(role),
    highlights,
    hasHighlights: highlights.length > 0
  };
}

/**
 * One stop for each employer, in the server's order of first appearance. The stop title is the
 * newest role that is not part time, or the newest role when all are. Roles inside a stop are
 * newest first.
 * @param {object[]} roles the TimelineRoles that stay on the track
 * @returns {object[]} the stops, without positions
 */
export function groupRoles(roles) {
  const groups = [];
  const byEmployer = new Map();
  roles.forEach((role, index) => {
    const employer = clean(role.employer);
    const id = slug(employer);
    let group = id ? byEmployer.get(id) : null;
    if (!group) {
      group = { employer, entries: [] };
      groups.push(group);
      if (id) {
        byEmployer.set(id, group);
      }
    }
    group.entries.push({ role, index });
  });
  return groups.map((group) => {
    const ordered = [...group.entries].sort(byNewestRole);
    const members = ordered.map((entry) => entry.role);
    const roleRows = ordered.map((entry) => toRole(entry.role, entry.index));
    const lead = roleRows.find((row) => !row.isPartTime) || roleRows[0];
    return {
      key: `employer-${slug(group.employer) || roleRows[0].key}`,
      isFold: false,
      employer: group.employer,
      title: lead.title,
      span: employerYears(members),
      isCurrent: members.some(isCurrentRole),
      roleCount: roleRows.length,
      roles: roleRows
    };
  });
}

function toFoldStop(roles) {
  const rows = roles.map((role, index) => {
    const row = toRole(role, index);
    const line = [row.title, row.employer, row.years]
      .filter((part) => part)
      .join(", ");
    return { key: `earlier-${row.key}`, line };
  });
  return {
    key: FOLD_KEY,
    isFold: true,
    employer: FOLD_TITLE,
    title: "",
    span: foldYears(roles),
    isCurrent: false,
    roleCount: rows.length,
    roles: rows
  };
}

/**
 * Every stop on the track from a getTimeline result, with the Earlier roles stop last. Each stop
 * has a position (1 is the newest) and the id of its panel.
 * @param {object} data the Timeline
 * @returns {object[]} the stops
 */
export function buildStops(data) {
  const startYear = toStartYear(data && data.salesforceStartYear);
  const roles = (data && Array.isArray(data.work) ? data.work : []).filter(
    (role) => role && clean(role.title)
  );
  const kept = roles.filter((role) => !foldsAway(role, startYear));
  const folded = roles.filter((role) => foldsAway(role, startYear));
  const stops = groupRoles(kept);
  if (folded.length) {
    stops.push(toFoldStop(folded));
  }
  return stops.map((stop, index) => ({
    ...stop,
    position: index + 1,
    panelId: `stop-panel-${index + 1}`
  }));
}

export default class CareerLine extends LightningElement {
  stops = [];
  openKeys = [];
  reduced = false;
  stopMotionListener = null;

  @wire(getTimeline)
  wiredTimeline({ data, error }) {
    if (data) {
      this.stops = buildStops(data);
      this.openKeys = this.openKeys.filter((key) =>
        this.stops.some((stop) => stop.key === key)
      );
    } else if (error) {
      // An extra under the hero: on an error it stays hidden.
      this.stops = [];
      this.openKeys = [];
    }
  }

  connectedCallback() {
    this.reduced = isReduced();
    this.stopMotionListener = onMotionChange((reduced) => {
      this.reduced = Boolean(reduced);
    });
  }

  disconnectedCallback() {
    if (typeof this.stopMotionListener === "function") {
      this.stopMotionListener();
    }
    this.stopMotionListener = null;
  }

  get hasStops() {
    return this.stops.length > 0;
  }

  get allOpen() {
    return this.stops.length > 0 && this.openKeys.length === this.stops.length;
  }

  get expandAllLabel() {
    return this.allOpen ? "Collapse all" : "Expand all";
  }

  get careerClass() {
    return this.reduced ? "career career-still" : "career";
  }

  get trackStops() {
    return this.stops.map((stop) => {
      const open = this.openKeys.includes(stop.key);
      let dotClass = stop.isCurrent ? "dot dot-current" : "dot";
      if (stop.isFold) {
        dotClass = "dot dot-fold";
      }
      return {
        ...stop,
        open,
        expanded: String(open),
        dotClass,
        stopClass: open ? "stop stop-open" : "stop",
        panelClass: open ? "panel panel-open" : "panel",
        toggleText: open ? OPEN_LABEL : CLOSED_LABEL,
        countText: rolesLabel(stop.roleCount),
        hasTitle: Boolean(stop.title)
      };
    });
  }

  get resumeHref() {
    return `${basePath || ""}/resume`;
  }

  handleToggle(event) {
    const key = event.currentTarget.dataset.key;
    const stop = this.stops.find((entry) => entry.key === key);
    if (!stop) {
      return;
    }
    if (this.openKeys.includes(key)) {
      this.openKeys = this.openKeys.filter((open) => open !== key);
      return;
    }
    this.openKeys = [...this.openKeys, key];
    trackEvent(EVENTS.CAREER_ROLE_OPENED, { position: stop.position });
  }

  handleExpandAll() {
    const expanded = !this.allOpen;
    this.openKeys = expanded ? this.stops.map((stop) => stop.key) : [];
    trackEvent(EVENTS.CAREER_TIMELINE_TOGGLED, { expanded });
  }
}
