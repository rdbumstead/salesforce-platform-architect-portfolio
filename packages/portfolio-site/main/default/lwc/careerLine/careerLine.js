/**
 * @description       : The work timeline under the home hero, from ResumeController.getTimeline.
 *                      Work only. Nothing about the career is written into the code: every year,
 *                      employer, bar, tick and pill comes from the read and from the visitor's
 *                      clock.
 *                      A ribbon at the top draws each employer to scale, newest on the left and
 *                      today at the left edge. The scale starts at the earliest role start. Roles
 *                      that ended before salesforceStartYear fold into one compressed segment at
 *                      the right edge, with a break mark, and into one last row, "Earlier roles".
 *                      With no such role, or no usable salesforceStartYear, the scale is plain and
 *                      linear and there is no break and no Earlier roles row. A part time only
 *                      employer sits on a thin lane of its own. An employer that left and came
 *                      back gets one bar for each stint and still one row. Ticks are computed
 *                      from the same dates. A label under a bar is measured after it renders. One
 *                      that does not fit its bar moves to the left edge when that is free and the
 *                      segment is short, and otherwise hides, because the rows carry everything.
 *                      Under the ribbon is a list of employer rows, newest first as the read
 *                      sends them. A row shows its years, the employer, a Now pill for a current
 *                      one, a Part time pill for a part time only one ("alongside" only when it
 *                      overlaps a full time employer), the role path ending on the newest full
 *                      time title, an "Also <titles>, part time" line, a role count and a chevron.
 *                      The row head is a button with aria-expanded and aria-controls. The panel
 *                      is a region labelled by it and lists every role with its years and up to 3
 *                      highlights. The Earlier roles panel lists one line per role and a resume
 *                      link. Any number of rows can be open at once, and all start closed.
 *                      Expand all opens every row and reads Collapse all once all are open.
 *                      Hovering a bar or a row marks its pair. A panel reveals in 220 ms and not
 *                      at all when the system asks for reduced motion.
 *                      The subtitle reads "On Salesforce since <year> · <n> years" from the start
 *                      year and the visitor's clock, and is left out with no usable start year.
 *                      Opening a row sends career_role_opened with its position (1 is the
 *                      newest). Expand all and Collapse all send career_timeline_toggled with
 *                      expanded. Renders nothing when the read fails or has no roles.
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
import { isReduced, onMotionChange } from "c/motionPreference";

const FOLD_KEY = "earlier-roles";
const FOLD_TITLE = "Earlier roles";
// A display rule, not career data: a role shows at most this many highlights.
const MAX_HIGHLIGHTS = 3;
// Share of the ribbon the compressed early segment takes.
const EARLY_SHARE = 0.14;
// A segment narrower than this share gets its label at the left edge.
const SHORT_SEGMENT = 0.2;
// Space between neighbouring bars, split across both.
const BAR_GAP = 0.004;
// The least width a bar is drawn at, so a short stint stays visible.
const MIN_BAR = 0.006;
// A minor tick closer than this share to another tick is dropped (about 40 px).
const TICK_GAP = 0.065;
// The share of the ribbon the Today label takes at the left edge (about 80 px at 390 px wide).
const TODAY_ZONE = 0.23;
// The least space, in px, between the texts of two ribbon labels on one row.
const LABEL_TEXT_GAP = 12;
// The earliest year tick hides when its text sits closer than this, in px, to another tick.
const TICK_TEXT_GAP = 12;
// The share the earliest year label takes at the right edge.
const EARLY_ZONE = 0.06;
// Roles that overlap, or sit this close, read as one stint.
const STINT_JOIN_MS = 31 * 86400000;
const DAY_MS = 86400000;
// Height of a label row and of the lanes, in px, and the gap between lanes.
const LABEL_ROW_PX = 56;
const MAIN_LANE_PX = 30;
const SIDE_LANE_PX = 10;
const LANE_GAP_PX = 4;
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

// A date as UTC milliseconds, or null. "2021-06-18" and "2021-06" both read.
function dateMs(value) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(asText(value));
  if (!match) {
    return null;
  }
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    match[3] ? Number(match[3]) : 1
  );
}

function todayMs(now) {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function pct(share) {
  return `${(share * 100).toFixed(3)}%`;
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
 * The year roles fold by: a whole number from the server, or null when it sends nothing usable.
 * With null there is no compression and no Earlier roles row.
 * @param {*} value salesforceStartYear from the server
 * @returns {number|null} the year
 */
export function toStartYear(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Whether a role folds into "Earlier roles": it is not held now and it ended before the
 * start year. A role that started before the start year and ran past it stays on the list.
 * @param {object} role a TimelineRole
 * @param {number|null} startYear the year roles fold by
 * @returns {boolean} true when the role folds
 */
export function foldsAway(role, startYear) {
  if (startYear === null || isCurrentRole(role)) {
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

/**
 * The subtitle: "On Salesforce since 2017 · 9 years". The years are whole years from 1 January
 * of the start year to the visitor's today, rounded down. Empty with no usable start year.
 * The count is left out when it is under one year.
 * @param {number|null} startYear salesforceStartYear when usable
 * @param {Date} now the visitor's clock
 * @returns {string} the subtitle
 */
export function buildSubtitle(startYear, now) {
  if (startYear === null) {
    return "";
  }
  const years = now.getFullYear() - startYear;
  const lead = `On Salesforce since ${startYear}`;
  if (years < 1) {
    return lead;
  }
  return `${lead} · ${years} ${years === 1 ? "year" : "years"}`;
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
 * Up to MAX_HIGHLIGHTS non empty highlight strings from a role.
 * @param {object} role a TimelineRole
 * @returns {string[]} the highlights
 */
export function highlightsOf(role) {
  return (Array.isArray(role.highlights) ? role.highlights : [])
    .map(clean)
    .filter((text) => text)
    .slice(0, MAX_HIGHLIGHTS);
}

/**
 * The scale of the ribbon. It starts at January of the earliest start year and ends today.
 * With a fold the years before the start year take EARLY_SHARE of the width and the rest is
 * linear. Without one the whole width is linear. position(ms) is 0 at today and 1 at the start,
 * so the newest work is on the left.
 * @param {object} input the dates the scale needs
 * @param {number} input.today today as UTC milliseconds
 * @param {number|null} input.earliest the earliest role start as UTC milliseconds
 * @param {number|null} input.startYear salesforceStartYear when usable
 * @param {boolean} input.hasFold whether any role folds into Earlier roles
 * @returns {object} the scale
 */
export function buildScale({ today, earliest, startYear, hasFold }) {
  const first = earliest === null || earliest === undefined ? today : earliest;
  const from = Date.UTC(new Date(first).getUTCFullYear(), 0, 1);
  const cut = hasFold && startYear !== null ? Date.UTC(startYear, 0, 1) : from;
  const compressed = hasFold && startYear !== null && cut > from && today > cut;
  const share = compressed ? EARLY_SHARE : 0;
  const base = compressed ? cut : from;
  const span = Math.max(today - base, DAY_MS);
  const early = Math.max(cut - from, DAY_MS);
  const x = (ms) => {
    if (compressed && ms < cut) {
      return share * Math.min(Math.max((ms - from) / early, 0), 1);
    }
    return share + (1 - share) * Math.min(Math.max((ms - base) / span, 0), 1);
  };
  return {
    today,
    from,
    cut,
    share,
    compressed,
    earliestYear: new Date(from).getUTCFullYear(),
    position: (ms) => 1 - x(ms)
  };
}

// The box the visible text of a label fills. The text is right aligned in a box that spans its
// bar, so the box is wider than the text. Falls back to the box where ranges have no geometry.
function textExtent(el) {
  const box = el.getBoundingClientRect();
  let left = Infinity;
  let right = -Infinity;
  if (typeof document.createRange === "function") {
    [el.querySelector("strong"), el.querySelector("span")].forEach((part) => {
      if (!part) {
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(part);
      if (typeof range.getBoundingClientRect !== "function") {
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.right > rect.left) {
        left = Math.min(left, rect.left);
        right = Math.max(right, rect.right);
      }
    });
  }
  return left === Infinity
    ? { left: box.left, right: box.right }
    : { left, right };
}

function overlaps(a, b) {
  return a.first <= b.last && b.first <= a.last;
}

// The stints of an employer: its role spans merged where they overlap or nearly touch.
function stintsOf(roles, today) {
  const spans = roles
    .map((role) => {
      const first = dateMs(role.startDate);
      const held = isCurrentRole(role);
      const last = held ? today : dateMs(role.endDate);
      return first === null || last === null
        ? null
        : { first, last: Math.max(first, last), held };
    })
    .filter((span) => span)
    .sort((a, b) => a.first - b.first);
  const stints = [];
  spans.forEach((span) => {
    const tail = stints[stints.length - 1];
    if (tail && span.first <= tail.last + STINT_JOIN_MS) {
      tail.last = Math.max(tail.last, span.last);
      tail.held = tail.held || span.held;
    } else {
      stints.push({ ...span });
    }
  });
  return stints;
}

function stintYears(stint) {
  const start = new Date(stint.first).getUTCFullYear();
  if (stint.held) {
    return `${start} to now`;
  }
  const end = new Date(stint.last).getUTCFullYear();
  return start === end ? String(start) : `${start} to ${end}`;
}

function toRole(role, index, allPart) {
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
    yearsText: partTime && !allPart ? `${years} · part time` : years,
    isPartTime: partTime,
    roleClass: partTime && !allPart ? "role is-part" : "role",
    highlights,
    hasHighlights: highlights.length > 0
  };
}

/**
 * One group for each employer, in the server's order of first appearance. Roles inside a group
 * are newest first. A group has its role path, its part time roles, its stints and whether it
 * is current or part time only.
 * @param {object[]} roles the TimelineRoles that stay on the list
 * @param {number} today today as UTC milliseconds
 * @returns {object[]} the groups, without positions or bars
 */
export function groupRoles(roles, today) {
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
    const allPart = members.every((role) => role.isPartTime === true);
    const rows = ordered.map((entry) =>
      toRole(entry.role, entry.index, allPart)
    );
    const fullRows = rows.filter((row) => !row.isPartTime);
    const partRows = rows.filter((row) => row.isPartTime);
    const steps = allPart ? [rows[0]] : [...fullRows].reverse();
    return {
      key: `employer-${slug(group.employer) || rows[0].key}`,
      isFold: false,
      employer: group.employer,
      span: employerYears(members),
      isCurrent: members.some(isCurrentRole),
      isPartTime: allPart,
      roleCount: rows.length,
      roles: rows,
      path: steps.map((row, at) => ({
        key: `${row.key}-step`,
        text: row.title,
        hasArrow: at > 0,
        stepClass: at === steps.length - 1 ? "lead" : "step"
      })),
      also:
        !allPart && partRows.length
          ? `Also ${partRows.map((row) => row.title).join(", ")}, part time`
          : "",
      stints: stintsOf(members, today)
    };
  });
}

function toFoldStop(roles) {
  const sorted = [...roles].sort((a, b) => {
    const later = dateText(b.endDate) > dateText(a.endDate);
    return later ? 1 : -1;
  });
  const rows = sorted.map((role, index) => {
    const row = toRole(role, index, false);
    return {
      key: `earlier-${row.key}`,
      title: row.title,
      employer: row.employer,
      years: row.years
    };
  });
  const employers = [];
  rows.forEach((row) => {
    if (row.employer && !employers.includes(row.employer)) {
      employers.push(row.employer);
    }
  });
  return {
    key: FOLD_KEY,
    isFold: true,
    employer: FOLD_TITLE,
    span: foldYears(roles),
    isCurrent: false,
    isPartTime: false,
    roleCount: rows.length,
    roles: rows,
    summary: employers.join(", "),
    path: [],
    also: "",
    stints: []
  };
}

// Place bars on lanes so none overlap: the first lane where the bar starts after the last one.
function assignLanes(bars) {
  const ends = [];
  [...bars]
    .sort((a, b) => a.left - b.left)
    .forEach((bar) => {
      let lane = ends.findIndex((end) => bar.left >= end - 1e-9);
      if (lane === -1) {
        lane = ends.length;
        ends.push(0);
      }
      ends[lane] = bar.left + bar.width;
      bar.lane = lane;
    });
  return Math.max(ends.length, 1);
}

// Ticks: Today at the left, the earliest year at the right, the start year, and every other year
// after it. A minor tick too near another tick is dropped.
function buildTicks(scale, startYear, nowYear) {
  const ticks = [
    {
      key: "tick-today",
      text: `Today · ${nowYear}`,
      className: "tick tick-today",
      style: "left: 0",
      at: 0,
      zone: TODAY_ZONE
    },
    {
      key: "tick-earliest",
      text: String(scale.earliestYear),
      className: "tick tick-early",
      style: "right: 0",
      at: 1,
      zone: EARLY_ZONE
    }
  ];
  const hasStart =
    startYear !== null && startYear > scale.earliestYear && startYear < nowYear;
  if (hasStart) {
    const at = scale.position(Date.UTC(startYear, 0, 1));
    ticks.push({
      key: "tick-start",
      text: String(startYear),
      className: "tick tick-start",
      style: `left: ${pct(at)}`,
      at,
      zone: TICK_GAP
    });
  }
  const base = hasStart ? startYear : scale.earliestYear;
  for (let year = base + 2; year < nowYear; year += 2) {
    const at = scale.position(Date.UTC(year, 0, 1));
    const near = ticks.some((tick) => Math.abs(tick.at - at) < tick.zone);
    if (!near) {
      const major = hasStart && (year - base) % 4 === 0;
      ticks.push({
        key: `tick-${year}`,
        text: String(year),
        className: major ? "tick" : "tick tick-minor",
        style: `left: ${pct(at)}`,
        at,
        zone: TICK_GAP
      });
    }
  }
  return ticks.sort((a, b) => a.at - b.at);
}

function buildRibbon(stops, scale, startYear, today) {
  const mainBars = [];
  const sideBars = [];
  const labels = [];
  const fullStints = stops
    .filter((stop) => !stop.isFold && !stop.isPartTime)
    .flatMap((stop) => stop.stints);
  const chronological = stops
    .filter((stop) => !stop.isFold && !stop.isPartTime && !stop.isCurrent)
    .map((stop) => ({
      stop,
      first: Math.min(...stop.stints.map((stint) => stint.first))
    }))
    .sort((a, b) => a.first - b.first);
  stops.forEach((stop) => {
    if (stop.isFold) {
      stop.tone = "early";
    } else if (stop.isPartTime) {
      stop.tone = "side";
    } else if (stop.isCurrent) {
      stop.tone = "now";
    } else {
      const at = chronological.findIndex((item) => item.stop === stop);
      stop.tone = at % 2 ? "2" : "1";
    }
    stop.alongside =
      stop.isPartTime &&
      stop.stints.some((part) =>
        fullStints.some((full) => overlaps(part, full))
      );
  });
  stops.forEach((stop) => {
    if (stop.isFold) {
      if (scale.compressed) {
        const left = 1 - scale.share + 2 * BAR_GAP;
        mainBars.push({
          key: `${stop.key}-bar`,
          stopKey: stop.key,
          tone: "early",
          left,
          width: 1 - left,
          held: false
        });
        labels.push({
          key: `${stop.key}-label`,
          stopKey: stop.key,
          name: FOLD_TITLE,
          years: stop.span,
          left: 1 - scale.share,
          width: scale.share,
          held: false
        });
      }
      return;
    }
    stop.stints.forEach((stint, at) => {
      const newer = scale.position(stint.last);
      const older = scale.position(stint.first);
      const left = newer + (stint.held ? 0 : BAR_GAP / 2);
      const right = older - BAR_GAP / 2;
      // A label box matches its bar, so neighbours that overlap by days do not share a row.
      const labelLeft = left;
      const bar = {
        key: `${stop.key}-bar-${at}`,
        stopKey: stop.key,
        tone: stop.tone,
        left,
        width: Math.max(MIN_BAR, right - left),
        held: stint.held
      };
      if (stop.isPartTime) {
        sideBars.push(bar);
        bar.sideLabelText = /part time/i.test(stop.employer)
          ? stop.employer
          : `${stop.employer}, part time`;
        bar.sideLabelStyle = `left: ${pct(older)}; max-width: calc(100% - ${pct(older)})`;
      } else {
        mainBars.push(bar);
        labels.push({
          key: `${stop.key}-label-${at}`,
          stopKey: stop.key,
          name: stop.employer,
          years: stop.stints.length > 1 ? stintYears(stint) : stop.span,
          left: labelLeft,
          width: Math.max(older - BAR_GAP / 2 - labelLeft, 0.001),
          held: stint.held
        });
      }
    });
  });
  const mainLanes = assignLanes(mainBars);
  const sideLanes = assignLanes(sideBars);
  // Label rows: the first row where the box meets no other box.
  const rows = [];
  [...labels]
    .sort((a, b) => a.left - b.left)
    .forEach((label) => {
      const end = label.left + label.width;
      let row = rows.findIndex((boxes) =>
        boxes.every(
          (box) => label.left >= box.right - 1e-9 || end <= box.left + 1e-9
        )
      );
      if (row === -1) {
        row = rows.length;
        rows.push([]);
      }
      rows[row].push({ left: label.left, right: end });
      label.row = row;
      label.short = label.width < SHORT_SEGMENT;
    });
  const nowYear = new Date(today).getUTCFullYear();
  return {
    ticks: buildTicks(scale, startYear, nowYear),
    mainBars,
    sideBars,
    labels,
    mainLanes,
    sideLanes,
    labelRows: Math.max(rows.length, 1),
    hasShort: labels.some((label) => label.short),
    breakStyle: scale.compressed ? `left: ${pct(1 - scale.share)}` : "",
    hasBreak: scale.compressed
  };
}

/**
 * The rows and the ribbon from a getTimeline result. Each row has a position (1 is the newest)
 * and the ids of its head and panel. The ribbon has the ticks, the bars, the lanes and the
 * labels, all as shares of the width.
 * @param {object} data the Timeline
 * @param {Date} now the visitor's clock
 * @returns {object} the start year, the scale, the ribbon and the stops
 */
export function buildTimeline(data, now = new Date()) {
  const startYear = toStartYear(data && data.salesforceStartYear);
  const today = todayMs(now);
  const roles = (data && Array.isArray(data.work) ? data.work : []).filter(
    (role) => role && clean(role.title)
  );
  const kept = roles.filter((role) => !foldsAway(role, startYear));
  const folded = roles.filter((role) => foldsAway(role, startYear));
  const stops = groupRoles(kept, today);
  if (folded.length) {
    stops.push(toFoldStop(folded));
  }
  const starts = roles
    .map((role) => dateMs(role.startDate))
    .filter((ms) => ms !== null);
  const scale = buildScale({
    today,
    earliest: starts.length ? Math.min(...starts) : null,
    startYear,
    hasFold: folded.length > 0
  });
  const ribbon = buildRibbon(stops, scale, startYear, today);
  return {
    startYear,
    subtitle: buildSubtitle(startYear, now),
    scale,
    ribbon,
    stops: stops.map((stop, index) => ({
      ...stop,
      position: index + 1,
      headId: `stop-head-${index + 1}`,
      panelId: `stop-panel-${index + 1}`
    }))
  };
}

/**
 * Every row of the list from a getTimeline result, with the Earlier roles row last.
 * @param {object} data the Timeline
 * @param {Date} now the visitor's clock
 * @returns {object[]} the rows
 */
export function buildStops(data, now = new Date()) {
  return buildTimeline(data, now).stops;
}

const EMPTY_TIMELINE = {
  stops: [],
  ribbon: null,
  startYear: null,
  subtitle: ""
};

export default class CareerLine extends LightningElement {
  timeline = EMPTY_TIMELINE;
  openKeys = [];
  hotKey = null;
  labelStates = {};
  leftRows = {};
  earlyHidden = false;
  reduced = false;
  stopMotionListener = null;
  resizeObserver = null;

  @wire(getTimeline)
  wiredTimeline({ data, error }) {
    if (data) {
      this.timeline = buildTimeline(data, new Date());
      this.labelStates = {};
      this.leftRows = {};
      this.openKeys = this.openKeys.filter((key) =>
        this.timeline.stops.some((stop) => stop.key === key)
      );
    } else if (error) {
      // An extra under the hero: on an error it stays hidden.
      this.timeline = EMPTY_TIMELINE;
      this.openKeys = [];
    }
  }

  connectedCallback() {
    this.reduced = isReduced();
    this.stopMotionListener = onMotionChange((reduced) => {
      this.reduced = Boolean(reduced);
    });
  }

  renderedCallback() {
    const ribbon = this.template.querySelector('[data-id="ribbon"]');
    if (
      ribbon &&
      !this.resizeObserver &&
      typeof ResizeObserver === "function"
    ) {
      this.resizeObserver = new ResizeObserver(() => this.measureLabels());
      this.resizeObserver.observe(ribbon);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => this.measureLabels());
      }
    }
    this.measureLabels();
  }

  disconnectedCallback() {
    if (typeof this.stopMotionListener === "function") {
      this.stopMotionListener();
    }
    this.stopMotionListener = null;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  // Measure each label in its own bar. One that does not fit moves to the left edge when it is
  // a short segment and that spot is free, and otherwise hides. A short current segment takes
  // the left edge first. The in place label is always rendered, so this reads the same thing
  // whatever state the label is in.
  measureLabels() {
    const ribbon = this.timeline.ribbon;
    if (!ribbon || !ribbon.labels.length) {
      return;
    }
    const fits = {};
    this.template.querySelectorAll('[data-id="ribbon-label"]').forEach((el) => {
      const name = el.querySelector("strong");
      const years = el.querySelector("span");
      fits[el.dataset.label] =
        Boolean(name) &&
        name.scrollHeight <= name.clientHeight + 1 &&
        years.scrollWidth <= years.clientWidth + 1;
    });
    const next = {};
    let leftTaken = false;
    const ordered = [...ribbon.labels].sort((a, b) => a.left - b.left);
    ordered
      .filter((label) => label.short && label.held)
      .forEach((label) => {
        if (!leftTaken) {
          next[label.key] = "left";
          leftTaken = true;
        }
      });
    ordered.forEach((label) => {
      if (next[label.key]) {
        return;
      }
      if (fits[label.key] !== false) {
        next[label.key] = "ok";
      } else if (label.short && !leftTaken) {
        next[label.key] = "left";
        leftTaken = true;
      } else {
        next[label.key] = "hidden";
      }
    });
    if (JSON.stringify(next) !== JSON.stringify(this.labelStates)) {
      this.labelStates = next;
    }
    this.placeLeftLabels(ordered, next);
    this.measureTicks();
  }

  // A label at the left edge stays on the first label row it does not meet. It meets a label when
  // the visible texts come within LABEL_TEXT_GAP px, not when the boxes do. With no such row it
  // takes the extra row under the others.
  placeLeftLabels(ordered, states) {
    const rowsUsed = this.timeline.ribbon.labelRows;
    const rows = {};
    ordered
      .filter((label) => states[label.key] === "left")
      .forEach((label) => {
        const copy = this.template.querySelector(
          `[data-id="ribbon-label-left"][data-label="${label.key}"]`
        );
        rows[label.key] = rowsUsed;
        if (!copy) {
          return;
        }
        const mine = textExtent(copy);
        for (let row = 0; row < rowsUsed; row += 1) {
          const clear = ordered
            .filter((other) => other.row === row && states[other.key] === "ok")
            .every((other) => {
              const el = this.template.querySelector(
                `[data-id="ribbon-label"][data-label="${other.key}"]`
              );
              return !el || textExtent(el).left - mine.right >= LABEL_TEXT_GAP;
            });
          if (clear) {
            rows[label.key] = row;
            return;
          }
        }
      });
    if (JSON.stringify(rows) !== JSON.stringify(this.leftRows)) {
      this.leftRows = rows;
    }
  }

  // The earliest year tick hides when its text would meet another tick's text. The compressed
  // segment already shows where the early years sit.
  measureTicks() {
    const ticks = Array.from(
      this.template.querySelectorAll('[data-id="tick"]')
    );
    const early = ticks.find((el) => el.classList.contains("tick-early"));
    if (!early) {
      return;
    }
    const mine = early.getBoundingClientRect();
    const near = ticks
      .filter((el) => el !== early)
      .some((el) => {
        const other = el.getBoundingClientRect();
        return (
          other.width > 0 &&
          other.left < mine.right &&
          mine.left - other.right < TICK_TEXT_GAP
        );
      });
    if (near !== this.earlyHidden) {
      this.earlyHidden = near;
    }
  }

  get stops() {
    return this.timeline.stops;
  }

  get hasStops() {
    return this.stops.length > 0;
  }

  get subtitle() {
    return this.timeline.subtitle;
  }

  get hasSubtitle() {
    return this.subtitle !== "";
  }

  get caption() {
    const ribbon = this.timeline.ribbon;
    if (ribbon && ribbon.hasBreak) {
      return `Newest on the left. Bars are to scale, and years before ${this.timeline.startYear} are compressed.`;
    }
    return "Newest on the left. Bars are to scale.";
  }

  get panelKeys() {
    return this.stops.map((stop) => stop.key);
  }

  get allOpen() {
    const keys = this.panelKeys;
    return keys.length > 0 && keys.every((key) => this.openKeys.includes(key));
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
      let rowClass = "row";
      if (open) {
        rowClass += " is-open";
      }
      if (this.hotKey === stop.key) {
        rowClass += " is-hot";
      }
      if (stop.isFold) {
        rowClass += " row-early";
      }
      let pill = "";
      if (stop.isPartTime) {
        pill = stop.alongside ? "Part time, alongside" : "Part time";
      }
      return {
        ...stop,
        open,
        expanded: String(open),
        rowClass,
        swatchClass: `swatch swatch-${stop.tone}`,
        showNow: stop.isCurrent && !stop.isPartTime,
        partPill: pill,
        showPartPill: pill !== "",
        showCount: stop.roleCount > 1,
        countText: `${stop.roleCount} roles`,
        rolesClass: stop.roleCount > 1 ? "roles has-many" : "roles",
        hasAlso: stop.also !== "",
        hasSummary: stop.isFold && stop.summary !== ""
      };
    });
  }

  get ribbonData() {
    const ribbon = this.timeline.ribbon;
    if (!ribbon) {
      return null;
    }
    const laneStyle = (px, count) =>
      `height: ${count * (px + LANE_GAP_PX) - LANE_GAP_PX}px`;
    const barView = (bar, px) => {
      let barClass = `bar bar-${bar.tone}`;
      if (this.hotKey === bar.stopKey) {
        barClass += " is-hot";
      }
      if (this.openKeys.includes(bar.stopKey)) {
        barClass += " is-open";
      }
      return {
        ...bar,
        barClass,
        barStyle: `left: ${pct(bar.left)}; width: ${pct(bar.width)}; top: ${bar.lane * (px + LANE_GAP_PX)}px`,
        showNow: bar.held && bar.tone === "now"
      };
    };
    const rowsUsed = ribbon.labelRows;
    let extraRow = false;
    const labels = ribbon.labels.map((label) => {
      const state =
        this.labelStates[label.key] ||
        (label.short && label.held ? "left" : "ok");
      const leftRow =
        this.leftRows[label.key] === undefined
          ? rowsUsed
          : this.leftRows[label.key];
      if (state === "left" && leftRow >= rowsUsed) {
        extraRow = true;
      }
      return {
        ...label,
        showPlace: state === "ok",
        showLeft: state === "left",
        labelClass: `blabel${state === "ok" ? "" : " is-ghost"}${this.hotKey === label.stopKey ? " is-hot" : ""}`,
        labelStyle: `left: ${pct(label.left)}; width: ${pct(label.width)}; top: ${label.row * LABEL_ROW_PX}px`,
        leftClass: `blabel blabel-left${this.hotKey === label.stopKey ? " is-hot" : ""}`,
        leftStyle: `top: ${leftRow * LABEL_ROW_PX}px`
      };
    });
    const ticks = ribbon.ticks.map((tick) => ({
      ...tick,
      className:
        this.earlyHidden && tick.key === "tick-earliest"
          ? `${tick.className} tick-hidden`
          : tick.className
    }));
    return {
      ticks,
      mainBars: ribbon.mainBars.map((bar) => barView(bar, MAIN_LANE_PX)),
      sideBars: ribbon.sideBars.map((bar) => barView(bar, SIDE_LANE_PX)),
      hasSide: ribbon.sideBars.length > 0,
      mainStyle: laneStyle(MAIN_LANE_PX, ribbon.mainLanes),
      sideStyle: laneStyle(SIDE_LANE_PX, ribbon.sideLanes),
      labels,
      leftLabels: labels.filter((label) => label.showLeft),
      labelsStyle: `height: ${(rowsUsed + (extraRow ? 1 : 0)) * LABEL_ROW_PX}px`,
      hasBreak: ribbon.hasBreak,
      breakStyle: ribbon.breakStyle
    };
  }

  get resumeHref() {
    return `${basePath || ""}/resume`;
  }

  openRow(key) {
    const stop = this.stops.find((entry) => entry.key === key);
    if (stop && !this.openKeys.includes(key)) {
      this.openKeys = [...this.openKeys, key];
      trackEvent(EVENTS.CAREER_ROLE_OPENED, { position: stop.position });
    }
  }

  handleToggle(event) {
    const key = event.currentTarget.dataset.key;
    if (this.openKeys.includes(key)) {
      this.openKeys = this.openKeys.filter((open) => open !== key);
      return;
    }
    this.openRow(key);
  }

  handleBarClick(event) {
    this.openRow(event.currentTarget.dataset.key);
  }

  handleHot(event) {
    this.hotKey = event.currentTarget.dataset.key;
  }

  handleCool() {
    this.hotKey = null;
  }

  handleExpandAll() {
    const expanded = !this.allOpen;
    this.openKeys = expanded ? this.panelKeys : [];
    trackEvent(EVENTS.CAREER_TIMELINE_TOGGLED, { expanded });
  }
}
