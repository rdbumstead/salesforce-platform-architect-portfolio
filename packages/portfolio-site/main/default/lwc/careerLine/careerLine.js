/**
 * @description       : The career timeline under the home hero, so a visitor sees the whole arc
 *                      at a glance: every role, current certification and school on one line,
 *                      from ResumeController.getTimeline, newest first.
 *                      Roles are grouped by employer name, which is the only employer field the
 *                      read sends. An employer is one point with its name, its span ("2017 to
 *                      2021", or the earliest start year with a plus, "2021+", when any role in
 *                      it is held now) and every title under it, newest first, each with its own
 *                      years and an Active tag when held now. An employer with one role shows
 *                      just that title and its years. Certifications are grouped by issuer and
 *                      earned year ("Salesforce · 2025") with every name listed and the
 *                      issuer's own "<issuer> Certified " prefix dropped from each. A school is a
 *                      milestone on its completion. All sit among each other by date, and the
 *                      employers keep the server's order of first appearance (current first,
 *                      then newest). The grouping is the same under every filter, and no count
 *                      stands in for names.
 *                      Every role that ended before the year the owner started on Salesforce
 *                      (the Salesforce_Start_Year setting the timeline read returns, 2017 when it
 *                      sends nothing usable) folds into one last point, "Earlier roles, 2012 to
 *                      2016", its years taken from the roles in it.
 *                      A selector (All, Work, Education, Certifications) narrows the line in
 *                      place. It opens on All, shows only the kinds that have points, and each
 *                      change sends career_timeline_filtered with the kind.
 *                      What opens is a button with aria-expanded and aria-controls: a title with
 *                      highlights (ResumeController.getResume for the Architect persona, matched
 *                      by Experience Id), a certification name its full name, issuer, earned date
 *                      and verify link, the school its name and completion, and the fold each
 *                      earlier role's employer, title and years. A title with no highlights is
 *                      plain text. One thing is open at a time, pressing it again closes it, and
 *                      Escape closes it and puts focus back on its button.
 *                      Opening a title sends career_role_opened with the role's position among
 *                      all roles as they sit on the line (1 is the newest).
 *                      With the certifications in view (All or Certifications), one quiet
 *                      "Verify on Trailhead" link sits under the line when the read sends a
 *                      verification link starting http or https, used exactly as sent, in a new
 *                      tab.
 *                      At 768 px and up the points sit on one horizontal line that scrolls
 *                      sideways inside its own region, with a fade at an edge that has more.
 *                      Below 768 px the points show in a compact vertical list: the newest 4
 *                      points of the active filter, then a "Show all <n>" button that opens the
 *                      rest in place. It becomes "Show fewer", keeps focus, and sends
 *                      career_timeline_show_all with the kind. The filters count against the
 *                      full list, and changing the filter folds the list back to 4.
 *                      Openings fade and slide in for about 200 ms, and appear at once when the
 *                      visitor asks for reduced motion (c/motionPreference).
 *                      Renders nothing when the timeline read fails or has no points. When only
 *                      the highlight read fails, the roles show as plain text.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
import { LightningElement, wire } from "lwc";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import getResume from "@salesforce/apex/ResumeController.getResume";
import { isReduced } from "c/motionPreference";
import { trackEvent, EVENTS } from "c/analyticsService";
import { SALESFORCE_START_YEAR } from "c/pillarData";

/** The persona whose highlights a role opens: the resume page's default view. */
export const HIGHLIGHT_PERSONA = "Architect";

export const ALL = "all";
export const WORK = "work";
export const EDUCATION = "education";
export const CERTIFICATIONS = "certifications";

/** The selector's options, in order. The keys are also the analytics kind values. */
const FILTERS = [
  [ALL, "All"],
  [WORK, "Work"],
  [EDUCATION, "Education"],
  [CERTIFICATIONS, "Certifications"]
];

const ROLE = "role";
const FOLD = "fold";
const CERTIFICATION = "certification";
const SCHOOL = "school";

/** Points the phone list shows before "Show all". */
export const STACK_PREVIEW = 4;

const LINE = "line";
const STACK = "stack";
const LINE_PANEL_ID = "career-panel";
const ACTIVE_LABEL = "Active";
const FOLD_KEY = "earlier-roles";
const FOLD_TITLE = "Earlier roles";
const HTTP_URL = /^https?:\/\//i;
// A role held now sorts after every real date when the dated points are placed.
const HELD_NOW = "9999-12-31";

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

/**
 * Formats an Apex Date ("YYYY-MM-DD") as "Mon YYYY" without the browser time zone, which can
 * move a first of the month date into the previous month.
 * @param {string} value Apex Date
 * @returns {string} "Mon YYYY", or "" when there is no date
 */
export function formatMonthYear(value) {
  const date = dateText(value);
  if (!date) {
    return "";
  }
  const month = MONTHS[Number(date.slice(5, 7)) - 1];
  return month ? `${month} ${date.slice(0, 4)}` : date.slice(0, 4);
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
 * The years of a role as shown: "2026+" for a current role, which also carries an Active tag,
 * "2021 to 2025", "2016" when it started and ended in one year, or the one year known when the
 * other is missing. A current role with no start date shows only its tag.
 * @param {object} role a TimelineRole
 * @returns {string} the years
 */
export function formatYears(role) {
  const start = yearOf(role.startDate);
  if (isCurrentRole(role)) {
    return start ? `${start}+` : "";
  }
  const end = yearOf(role.endDate);
  if (start && end) {
    return start === end ? start : `${start} to ${end}`;
  }
  return start || end;
}

/**
 * The years as a screen reader hears them, with the Active tag: "since 2026, active" for a
 * current role, otherwise the years as shown.
 * @param {object} role a TimelineRole
 * @returns {string} the spoken years
 */
export function spokenYears(role) {
  if (!isCurrentRole(role)) {
    return formatYears(role);
  }
  const start = yearOf(role.startDate);
  return start ? `since ${start}, active` : "active";
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
 * start year. A role that started before the start year and ran past it stays on the line.
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
 * The fold's years, from the earliest to the latest year of the roles in it: "2012 to 2016".
 * @param {object[]} roles the folded TimelineRoles
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

// When a role was last held, for placing the certifications and the school among the roles.
// A role with no end date known gives no place.
function roleWhen(role) {
  return isCurrentRole(role) ? HELD_NOW : dateText(role.endDate) || null;
}

/**
 * Puts the dated points (certifications and schools, newest first) among the roles, which keep
 * their order. Each dated point goes before the first role last held before its date. Dated
 * points older than every role, or with no date, go after the roles.
 * @param {object[]} roles the role points, in the server's order, each with a when
 * @param {object[]} dated the certification and school points, each with a when or ""
 * @returns {object[]} the merged points
 */
export function mergeByDate(roles, dated) {
  const pending = [...dated].sort((a, b) => {
    if (a.when === b.when) {
      return 0;
    }
    return a.when > b.when ? -1 : 1;
  });
  const merged = [];
  roles.forEach((role) => {
    if (role.when) {
      while (pending.length && pending[0].when && pending[0].when > role.when) {
        merged.push(pending.shift());
      }
    }
    merged.push(role);
  });
  return merged.concat(pending);
}

// A lower case slug for a group key: "Metropolitan Community College" gives
// "metropolitan-community-college".
function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The years an employer covers as shown: the earliest start year with a plus when any role in it
 * is held now ("2021+"), otherwise the earliest to the latest year ("2017 to 2021").
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
  return starts.length ? `${Math.min(...starts)}+` : "";
}

function employerSpoken(roles) {
  const years = employerYears(roles);
  if (!roles.some(isCurrentRole)) {
    return years;
  }
  return years ? `since ${years.replace("+", "")}, active` : "active";
}

// Newest first inside a group: held now first, then the latest end, then the latest start,
// then the server's order.
function byNewestRole(a, b) {
  const whenA = roleWhen(a.role) || "";
  const whenB = roleWhen(b.role) || "";
  if (whenA !== whenB) {
    return whenA > whenB ? -1 : 1;
  }
  const startA = dateText(a.role.startDate);
  const startB = dateText(b.role.startDate);
  if (startA !== startB) {
    return startA > startB ? -1 : 1;
  }
  return a.index - b.index;
}

function toRoleTitle(role, index) {
  return {
    key: clean(role.key) || `role-${index}`,
    type: ROLE,
    first: clean(role.employer),
    second: clean(role.title),
    label: clean(role.title),
    years: formatYears(role),
    yearsSpoken: spokenYears(role),
    showYears: true,
    isCurrent: isCurrentRole(role)
  };
}

/**
 * One point for each employer, in the server's order of first appearance. Every role at it is a
 * title under it, newest first. An employer with one role keeps that role's key.
 * @param {object[]} roles the TimelineRoles that stay on the line, in the server's order
 * @returns {object[]} the role points
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
    const titles = ordered.map((entry) => toRoleTitle(entry.role, entry.index));
    const whens = members.map(roleWhen).filter((when) => when);
    const multiple = titles.length > 1;
    return {
      key: multiple
        ? `employer-${slug(group.employer) || titles[0].key}`
        : titles[0].key,
      type: ROLE,
      kind: WORK,
      isGroup: true,
      first: group.employer,
      second: "",
      showGroupYears: multiple,
      years: employerYears(members),
      yearsSpoken: employerSpoken(members),
      isCurrent: members.some(isCurrentRole),
      titles,
      when: whens.length ? whens.sort().pop() : null
    };
  });
}

function toFoldPoint(roles) {
  const years = foldYears(roles);
  return {
    key: FOLD_KEY,
    type: FOLD,
    kind: WORK,
    first: FOLD_TITLE,
    second: "",
    years,
    yearsSpoken: years,
    isCurrent: false,
    foldRoles: roles.map((role, index) => ({
      key: clean(role.key) || `earlier-${index}`,
      text: [clean(role.employer), clean(role.title), formatYears(role)]
        .filter((part) => part)
        .join(", ")
    }))
  };
}

/**
 * A certification's name without its issuer's prefix, for use under a heading that names the
 * issuer: "Salesforce Certified Platform Administrator" under "Salesforce" is "Platform
 * Administrator". A name without the prefix is returned as it is.
 * @param {string} name the full name
 * @param {string} issuer the issuer
 * @returns {string} the shorter name
 */
export function shortCertificationName(name, issuer) {
  const full = clean(name);
  const owner = clean(issuer);
  if (!owner) {
    return full;
  }
  const prefix = `${owner} Certified `.toLowerCase();
  if (full.toLowerCase().startsWith(prefix) && full.length > prefix.length) {
    return full.slice(prefix.length).trim();
  }
  return full;
}

function toCertificationTitle(certification, index) {
  const issuer = clean(certification.issuer);
  const name = clean(certification.name);
  return {
    key: clean(certification.id) || `certification-${index}`,
    type: CERTIFICATION,
    first: "Certification",
    second: name,
    label: shortCertificationName(name, issuer),
    years: "",
    yearsSpoken: "",
    showYears: false,
    isCurrent: false,
    issuer,
    earned: formatMonthYear(certification.earnedDate),
    when: dateText(certification.earnedDate)
  };
}

/**
 * One point for each issuer and earned year, such as "Salesforce · 2025", with every name under
 * it, newest first. A retired certification, if one is ever sent, is left out.
 * @param {object[]} certifications the TimelineCertifications
 * @returns {object[]} the certification points, newest first
 */
export function groupCertifications(certifications) {
  const groups = [];
  const byId = new Map();
  certifications
    .filter((entry) => entry && clean(entry.name) && entry.isRetired !== true)
    .forEach((entry, index) => {
      const issuer = clean(entry.issuer);
      const year = yearOf(entry.earnedDate);
      const id = `${slug(issuer)}-${year}`;
      let group = byId.get(id);
      if (!group) {
        group = { issuer, year, id, titles: [] };
        byId.set(id, group);
        groups.push(group);
      }
      group.titles.push(toCertificationTitle(entry, index));
    });
  return groups.map((group) => {
    const titles = group.titles
      .map((title, index) => ({ title, index }))
      .sort((a, b) => {
        if (a.title.when !== b.title.when) {
          return a.title.when > b.title.when ? -1 : 1;
        }
        return a.index - b.index;
      })
      .map((entry) => entry.title);
    const heading = [group.issuer || "Certifications", group.year]
      .filter((part) => part)
      .join(" · ");
    return {
      key: `certifications-${group.id}`,
      type: CERTIFICATION,
      kind: CERTIFICATIONS,
      isGroup: true,
      first: heading,
      second: "",
      showGroupYears: false,
      years: group.year,
      yearsSpoken: group.year ? `earned ${group.year}` : "",
      isCurrent: false,
      titles,
      when: titles[0].when
    };
  });
}

function toSchoolPoint(school, index) {
  const year = yearOf(school.completedDate);
  return {
    key: clean(school.key) || `school-${index}`,
    type: SCHOOL,
    kind: EDUCATION,
    first: clean(school.school),
    second: clean(school.credential),
    years: year ? `Completed ${year}` : "",
    yearsSpoken: year ? `completed ${year}` : "",
    isCurrent: false,
    fieldOfStudy: clean(school.fieldOfStudy),
    completed: formatMonthYear(school.completedDate),
    when: dateText(school.completedDate)
  };
}

/**
 * Every point on the line from a getTimeline result, newest first, with the fold last.
 * @param {object} data the Timeline
 * @returns {object[]} the points
 */
export function buildPoints(data) {
  const startYear = toStartYear(data && data.salesforceStartYear);
  const roles = (data && Array.isArray(data.work) ? data.work : []).filter(
    (role) => role && clean(role.title)
  );
  const kept = roles.filter((role) => !foldsAway(role, startYear));
  const folded = roles.filter((role) => foldsAway(role, startYear));
  const certifications = groupCertifications(
    data && Array.isArray(data.certifications) ? data.certifications : []
  );
  const schools = (data && Array.isArray(data.education) ? data.education : [])
    .filter(
      (entry) => entry && (clean(entry.school) || clean(entry.credential))
    )
    .map(toSchoolPoint);
  const points = mergeByDate(groupRoles(kept), [...certifications, ...schools]);
  if (folded.length) {
    points.push(toFoldPoint(folded));
  }
  return points;
}

export default class CareerLine extends LightningElement {
  // Spoken between the parts of a point, which sit on separate lines.
  comma = ", ";
  newTabNote = ", opens in a new tab";
  points = [];
  verificationUrl = null;
  highlights = new Map();
  filter = ALL;
  openKey = null;
  openList = null;
  revealKey = null;
  focusAfterRender = null;
  highlightPersona;
  observer;
  stackExpanded = false;
  scrollToStart = false;
  edgeStart = false;
  edgeEnd = false;
  resizeListener = () => this.updateEdges();

  @wire(getTimeline)
  wiredTimeline({ data, error }) {
    if (data) {
      this.points = buildPoints(data);
      this.verificationUrl =
        typeof data.verificationUrl === "string" &&
        HTTP_URL.test(data.verificationUrl)
          ? data.verificationUrl
          : null;
    } else if (error) {
      // An extra under the hero: on an error it stays hidden.
      this.points = [];
      this.verificationUrl = null;
    }
  }

  // The highlights only open on a press, so their read waits until the section nears the
  // screen. A browser with no IntersectionObserver reads them at once.
  @wire(getResume, { persona: "$highlightPersona" })
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
    this.waitForScreen();
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.resizeListener);
    this.stopWaiting();
  }

  waitForScreen() {
    if (typeof IntersectionObserver !== "function") {
      this.highlightPersona = HIGHLIGHT_PERSONA;
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.highlightPersona = HIGHLIGHT_PERSONA;
          this.stopWaiting();
        }
      },
      { rootMargin: "800px 0px" }
    );
    this.observer.observe(this.template.host);
  }

  stopWaiting() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
  }

  get hasPoints() {
    return this.points.length > 0;
  }

  get kindsPresent() {
    return new Set(this.points.map((point) => point.kind));
  }

  // The selector shows only when there is more than one kind to choose between.
  get showFilters() {
    return this.kindsPresent.size > 1;
  }

  get activeFilter() {
    return this.filter === ALL || this.kindsPresent.has(this.filter)
      ? this.filter
      : ALL;
  }

  get filters() {
    const present = this.kindsPresent;
    const active = this.activeFilter;
    return FILTERS.filter(([key]) => key === ALL || present.has(key)).map(
      ([key, label]) => ({
        key,
        label,
        pressed: String(key === active),
        className: key === active ? "filter filter-active" : "filter"
      })
    );
  }

  get shownPoints() {
    const active = this.activeFilter;
    return active === ALL
      ? this.points
      : this.points.filter((point) => point.kind === active);
  }

  // The role's place among all roles, for career_role_opened (1 is the newest). The roles are
  // counted as they sit on the line, employer by employer, newest first inside each.
  rolePosition(key) {
    const roles = [];
    this.points
      .filter((point) => point.type === ROLE)
      .forEach((point) => roles.push(...point.titles));
    return roles.findIndex((title) => title.key === key) + 1;
  }

  // The keys of everything in a point that can open: its titles, or the point itself.
  entryKeys(point) {
    return point.isGroup ? point.titles.map((title) => title.key) : [point.key];
  }

  panelOf(point) {
    if (point.type === ROLE) {
      const items = this.highlights.get(point.key) || [];
      return {
        hasPanel: items.length > 0,
        items: items.map((text, position) => ({
          key: `${point.key}-${position}`,
          text
        }))
      };
    }
    if (point.type === FOLD) {
      return { hasPanel: point.foldRoles.length > 0, items: point.foldRoles };
    }
    if (point.type === CERTIFICATION) {
      const earned = point.earned ? `earned ${point.earned}` : "";
      return {
        hasPanel: true,
        items: [
          {
            key: `${point.key}-detail`,
            text: [point.issuer, earned].filter((part) => part).join(", ")
          }
        ].filter((item) => item.text),
        verifyHref: this.verificationUrl
      };
    }
    const completed = point.completed ? `completed ${point.completed}` : "";
    return {
      hasPanel: true,
      items: [
        { key: `${point.key}-field`, text: point.fieldOfStudy },
        {
          key: `${point.key}-school`,
          text: [point.first, completed].filter((part) => part).join(", ")
        }
      ].filter((item) => item.text)
    };
  }

  metaOf(point) {
    if (point.type === ROLE) {
      return [point.first, point.years, point.isCurrent ? ACTIVE_LABEL : ""]
        .filter((part) => part)
        .join(", ");
    }
    return point.type === FOLD ? point.years : "";
  }

  // One thing that opens, with its panel and whether it is open in this list.
  entryState(entry, list, stackPanelId) {
    const panel = this.panelOf(entry);
    const open = this.openKey === entry.key && this.openList === list;
    return {
      ...entry,
      ...panel,
      hasSecond: Boolean(entry.second),
      hasVerify: Boolean(panel.verifyHref),
      panelTitle:
        entry.type === FOLD ? entry.first : entry.second || entry.first,
      meta: this.metaOf(entry),
      expanded: String(open),
      controls: list === LINE ? LINE_PANEL_ID : stackPanelId,
      open
    };
  }

  decorate(point, index, list) {
    const stackPanelId = `career-stack-panel-${index}`;
    if (point.isGroup) {
      const titles = point.titles.map((title) =>
        this.entryState(title, list, stackPanelId)
      );
      const opened = titles.find((title) => title.open);
      return {
        ...point,
        titles,
        hasPanel: titles.some((title) => title.hasPanel),
        stackPanelId,
        stackPanelHidden: !(opened && list === STACK),
        stackPanelClass: this.panelClass(opened ? opened.key : "", STACK),
        openItems: opened ? opened.items : [],
        hasVerify: Boolean(opened && opened.hasVerify),
        verifyHref: opened ? opened.verifyHref : null,
        pointClass: `point point-${point.type}${
          point.isCurrent ? " point-current" : ""
        }`
      };
    }
    const state = this.entryState(point, list, stackPanelId);
    return {
      ...state,
      stackPanelId,
      stackPanelHidden: !(state.open && list === STACK),
      stackPanelClass: this.panelClass(point.key, STACK),
      pointClass: `point point-${point.type}${
        point.isCurrent ? " point-current" : ""
      }${state.open ? " point-open" : ""}`
    };
  }

  panelClass(key, list) {
    return this.revealKey === key && this.openList === list
      ? "panel panel-reveal"
      : "panel";
  }

  get linePoints() {
    return this.shownPoints.map((point, index) =>
      this.decorate(point, index, LINE)
    );
  }

  // The phone list shows the newest few points of the active filter until the visitor asks for
  // all of them. The horizontal line, which is the only list on a wide screen, always shows all.
  get stackPoints() {
    const shown = this.shownPoints;
    const visible = this.stackExpanded ? shown : shown.slice(0, STACK_PREVIEW);
    return visible.map((point, index) => this.decorate(point, index, STACK));
  }

  get showStackToggle() {
    return this.shownPoints.length > STACK_PREVIEW;
  }

  get stackToggleExpanded() {
    return String(this.stackExpanded);
  }

  get stackToggleLabel() {
    return this.stackExpanded
      ? "Show fewer"
      : `Show all ${this.shownPoints.length}`;
  }

  get openPoint() {
    if (!this.openKey || this.openList !== LINE) {
      return null;
    }
    const shown = this.shownPoints;
    for (const point of shown) {
      if (!point.isGroup) {
        if (point.key === this.openKey) {
          return this.entryState(point, LINE, "");
        }
      } else {
        const title = point.titles.find((entry) => entry.key === this.openKey);
        if (title) {
          return this.entryState(title, LINE, "");
        }
      }
    }
    return null;
  }

  get linePanelHidden() {
    return this.openPoint === null;
  }

  get linePanelClass() {
    return this.panelClass(this.openKey, LINE);
  }

  // A scroll region needs a tab stop when nothing inside it can take focus.
  get lineTabIndex() {
    return this.linePoints.some((point) => point.hasPanel) ? undefined : "0";
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

  get showVerify() {
    const active = this.activeFilter;
    return (
      this.verificationUrl !== null &&
      (active === ALL || active === CERTIFICATIONS) &&
      this.kindsPresent.has(CERTIFICATIONS)
    );
  }

  handleFilterClick(event) {
    const kind = event.currentTarget.dataset.kind;
    if (!kind || kind === this.activeFilter) {
      return;
    }
    this.filter = kind;
    this.stackExpanded = false;
    if (this.openList === STACK) {
      this.openKey = null;
      this.openList = null;
      this.revealKey = null;
    }
    const stillShown = this.shownPoints.some((point) =>
      this.entryKeys(point).includes(this.openKey)
    );
    if (!stillShown) {
      this.openKey = null;
      this.openList = null;
      this.revealKey = null;
    }
    // After the new points render, the line starts from its newest point again. Doing it after
    // the render keeps a browser from snapping back to the point it last rested on.
    this.scrollToStart = true;
    trackEvent(EVENTS.CAREER_TIMELINE_FILTERED, { kind });
  }

  handlePointClick(event) {
    const { key, list } = event.currentTarget.dataset;
    if (this.openKey === key && this.openList === list) {
      this.closePoint(false);
      return;
    }
    this.openKey = key;
    this.openList = list;
    this.revealKey = isReduced() ? null : key;
    const position = this.rolePosition(key);
    if (position > 0) {
      trackEvent(EVENTS.CAREER_ROLE_OPENED, { position });
    }
  }

  closePoint(moveFocus) {
    const key = this.openKey;
    const list = this.openList;
    this.openKey = null;
    this.openList = null;
    this.revealKey = null;
    if (moveFocus && key) {
      this.focusAfterRender = `[data-point-button][data-list="${list}"][data-key="${key}"]`;
    }
  }

  handleStackToggle() {
    this.stackExpanded = !this.stackExpanded;
    if (this.stackExpanded) {
      trackEvent(EVENTS.CAREER_TIMELINE_SHOW_ALL, { kind: this.activeFilter });
    } else if (this.openList === STACK) {
      this.closePoint(false);
    }
  }

  handleKeydown(event) {
    if (event.key !== "Escape" || !this.openKey) {
      return;
    }
    event.preventDefault();
    this.closePoint(true);
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
    if (this.scrollToStart) {
      this.scrollToStart = false;
      const line = this.template.querySelector('[data-id="line"]');
      if (line) {
        line.scrollLeft = 0;
      }
    }
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
