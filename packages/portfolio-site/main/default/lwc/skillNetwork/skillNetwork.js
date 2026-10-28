/**
 * @description       : Skills page. A matrix by default: one row per category, one chip per
 *                      skill with its proficiency and the years it was used, worked out from the dates of the
 *                      roles linked through Experience_Skill__c. Selecting a chip opens its detail under
 *                      the chip's row, moves focus to the detail's heading and lists the roles, projects
 *                      and certifications that back it, with a line saying which kinds of evidence back
 *                      it. On desktop and tablet a "Matrix | Graph" switch opens a graph view that
 *                      loads the d3-force graph engine (c/graphEngine) on first open only, clusters skills by
 *                      category with the roles, projects and certifications on an outer ring, and draws
 *                      edges only for the hovered or selected node. Certifications come from
 *                      SkillGraphController, and a retired one shows, marked retired. Each skill carries
 *                      its evidence at rest: a ring whose weight counts the kinds of evidence behind it
 *                      (a role, a project, a certification, never the number of rows), and its lines
 *                      step up the same way when shown. A legend says what the weights mean.
 *                      Phones and narrow viewports get the matrix only and never request the engine.
 *                      Positions are computed once and drawn as SVG from this template. The ring radii
 *                      follow the node counts, and a label placement pass puts each label right, left,
 *                      above or below its node, wherever it covers no other label or node. A long
 *                      label wraps onto two lines at a space and is never cut. The graph
 *                      opens fitted to its content, Fit shows it whole again, and Reset layout puts every
 *                      dragged node back. The view eases about 250 ms only after a button press, and
 *                      moves at once under reduced motion. Nothing moves on its own. Pan and zoom
 *                      (d3-zoom) and node drag (d3-drag) come from the same engine. A background drag or
 *                      the arrow keys on the focused graph pan it, a plain wheel scrolls the page, Ctrl
 *                      with the wheel or a pinch zooms, and the view can zoom out past the fit. Dragged
 *                      nodes stay where they were put for the visit, kept in sessionStorage, and a
 *                      saved position for a node the data no longer has is dropped. A persona filter
 *                      sits above both views with the resume's personas, read from
 *                      Skill__c.Persona_Tag__c by a query of its own. It shows only once at least one
 *                      skill is tagged. The rule is the same in both views: a skill without the chosen
 *                      tag is left out, and so is a category left with no skill. The chips that drop out
 *                      fade first, except under reduced motion. The graph keeps every role, project and
 *                      certification and its computed positions, so a node never moves when the persona
 *                      changes.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
// The site pins lightning/uiGraphQLApi. The lint rule prefers lightning/graphql, and that
// move is a separate change made for every GraphQL component at once.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { gql, graphql } from "lightning/uiGraphQLApi";
import FORM_FACTOR from "@salesforce/client/formFactor";
import getCertificationLinks from "@salesforce/apex/SkillGraphController.getCertificationLinks";
import {
  attachNodeDrag,
  attachPanZoom,
  boundsOf,
  fitTransform,
  layoutGraph,
  loadGraphEngine
} from "c/graphEngine";
import { EVENTS, trackEvent } from "c/analyticsService";
import { isReduced } from "c/motionPreference";

// Reads only fields the guest can read: the skill fields Portfolio_Guest grants, the required
// Category_Order__c, and the two Experience__c dates. GraphQL returns a field to the guest
// only when the guest has field level security on it.
const SKILL_NETWORK_QUERY = gql`
  query SkillNetworkGraph {
    uiapi {
      query {
        Skill__c(first: 200) {
          edges {
            node {
              Id
              Name {
                value
              }
              Category__c {
                value
              }
              Category_Order__c {
                value
              }
              Display_Name__c {
                value
              }
              Proficiency__c {
                value
              }
            }
          }
        }
        Project_Skill__c(first: 200) {
          edges {
            node {
              Id
              Project__c {
                value
              }
              Skill__c {
                value
              }
              Project__r {
                Name {
                  value
                }
              }
            }
          }
        }
        Experience_Skill__c(first: 200) {
          edges {
            node {
              Id
              Experience__c {
                value
              }
              Skill__c {
                value
              }
              Experience__r {
                Name {
                  value
                }
                Start_Date__c {
                  value
                }
                End_Date__c {
                  value
                }
                Is_Current_Role__c {
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;

// The persona tags in a query of their own. If the guest cannot read the field yet,
// only this query fails: the filter stays hidden and the skills still load.
const SKILL_PERSONAS_QUERY = gql`
  query SkillPersonaTags {
    uiapi {
      query {
        Skill__c(first: 200) {
          edges {
            node {
              Id
              Persona_Tag__c {
                value
              }
            }
          }
        }
      }
    }
  }
`;

const NARROW_VIEWPORT_QUERY = "(max-width: 767px)";
const OTHER_CATEGORY = "Other";
const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_DAYS = 365.25;
const VIEW_MATRIX = "matrix";
const VIEW_GRAPH = "graph";

const KIND_LABELS = {
  skill: "Skill",
  role: "Role",
  project: "Project",
  certification: "Certification"
};

// The resume's personas: the same labels, values and order as PERSONA_OPTIONS in resumeBuilder.js,
// which a test checks. The value is the Persona_Tag__c value.
const PERSONA_OPTIONS = [
  { label: "Platform Architect", value: "Architect" },
  { label: "Salesforce Developer", value: "Developer" },
  { label: "System Admin", value: "Admin" }
];
const PERSONA_ALL = "";

// Graph geometry, in layout units. Rings are sized by their node counts: each category gets
// CATEGORY_ARC of the inner ring and each outer node OUTER_ARC of the outer ring, and the outer
// ring keeps CLUSTER_ROOM outside the inner one for the clusters. The layout box is the outer
// ring plus BOX_MARGIN all round. Tuned on production shaped data (layoutSpacing.test.js).
const CATEGORY_ARC = 140;
const CATEGORY_RING_MIN = 120;
const OUTER_ARC = 100;
const CLUSTER_ROOM = 170;
const BOX_MARGIN = 40;
const WORK_RADIUS = 10;
// A label longer than this wraps onto a second line at a space. Labels are never cut.
const LINE_MAX = 22;
// Certification names all open with this. The label leaves it out, the title and lists keep it.
const ERROR_TITLE = "The skills could not be loaded.";
const CERTIFICATION_PREFIX = /^Salesforce Certified\s+/i;
// A category label is drawn in its cluster. An unseen node of this radius per character holds
// the label's place, so skills settle round the label instead of under it (13px mono, 0.6em
// a character, a circle 0.6 of the label's half width).
const CATEGORY_RADIUS_PER_CHAR = 2.34;

// The drawn view: a fixed box the content is fitted into, so the canvas keeps one shape at
// every width (the SVG is 100% wide with its height from this ratio).
const VIEW_WIDTH = 1280;
const VIEW_HEIGHT = 800;
const VIEW_EXTENT = [
  [0, 0],
  [VIEW_WIDTH, VIEW_HEIGHT]
];
// Space kept round the content when it is fitted, in view units.
const FIT_MARGIN = 24;
// The view zooms out to half the fitted scale and in to four times it.
const MIN_ZOOM_OF_FIT = 0.5;
const MAX_ZOOM_OF_FIT = 4;
// The pan limit: the content plus this margin on every side, in layout units.
const PAN_MARGIN = 120;
// One arrow key press pans this far on screen, in view box units, at any zoom level.
const PAN_STEP = 40;
// Each arrow key moves the view that way, so the graph moves the other way.
const PAN_KEYS = Object.freeze({
  ArrowLeft: [PAN_STEP, 0],
  ArrowRight: [-PAN_STEP, 0],
  ArrowUp: [0, PAN_STEP],
  ArrowDown: [0, -PAN_STEP]
});
// A button press eases the view this long, unless motion is reduced.
const EASE_MS = 250;
// The chips that drop out on a persona change fade for this long before they leave.
const CHIP_FADE_MS = 200;

// Evidence: the ring weight round a skill for 1, 2 and 3 kinds, and the line weight when shown.
const EVIDENCE_RING_WIDTH = [0, 1, 2, 3];
const EVIDENCE_RING_GAP = 2;
const EVIDENCE_EDGE_CLASS = [
  "graph-edge",
  "graph-edge edge-weight-1",
  "graph-edge edge-weight-2",
  "graph-edge edge-weight-3"
];

// Label metrics, matching skillNetwork.css: node labels 12px sans at about 0.56em a
// character, category labels 13px mono at 0.6em. A box runs 0.75em above the first baseline
// and 0.25em below the last, and a second line sits LINE_HEIGHT under the first.
const NODE_FONT = 12;
const NODE_CHAR = 0.56 * NODE_FONT;
const LINE_HEIGHT = 14;
const CATEGORY_FONT = 13;
const CATEGORY_CHAR = 0.6 * CATEGORY_FONT;
const LABEL_GAP = 4;

// sessionStorage key for the dragged positions of this visit.
export const POSITIONS_KEY = "skillNetwork.positions";

function fieldValue(record, field) {
  return record && record[field] ? record[field].value : null;
}

function rowsOf(data, objectName) {
  const connection = data?.uiapi?.query?.[objectName];
  return connection && Array.isArray(connection.edges)
    ? connection.edges.map((edge) => edge.node).filter(Boolean)
    : [];
}

// A date only value ("2020-03-01") as UTC midnight in milliseconds, or null.
function parseDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return null;
  }
  const time = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

function todayUtc() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// Years a skill was used: the union of its roles' date ranges with overlaps merged. A role with
// no end date, or marked current, counts to today. A role with no start date is left out.
// Returns null when no role with a start date is linked.
function yearsUsed(roles, today) {
  const ranges = roles
    .map((role) => {
      const start = parseDay(role.startDate);
      if (start === null) {
        return null;
      }
      const end =
        role.isCurrent || !role.endDate ? today : parseDay(role.endDate);
      return end === null || end < start ? null : [start, end];
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);
  if (!ranges.length) {
    return null;
  }
  let total = 0;
  let [currentStart, currentEnd] = ranges[0];
  ranges.slice(1).forEach(([start, end]) => {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  });
  total += currentEnd - currentStart;
  return total / DAY_MS / YEAR_DAYS;
}

function yearsLabel(years) {
  if (years === null) {
    return "";
  }
  if (years < 1) {
    return "under 1 yr";
  }
  const rounded = years.toFixed(1);
  return rounded === "1.0" ? "1.0 yr" : `${rounded} yrs`;
}

function yearsSpoken(years) {
  if (years === null) {
    return "";
  }
  if (years < 1) {
    return "used for under 1 year";
  }
  return `used for ${years.toFixed(1)} years`;
}

// Everything besides time worked that backs a skill, each shown beside the years: "Certified 2024"
// from the earliest year a linked certification was earned, then "Project" or "3 projects". A
// certification, a project and years in a role are different evidence, so a chip shows every one
// it has. Years stay a number of years worked, so a skill with no role never gets one.
function evidenceParts(skill) {
  const parts = [];
  if (skill.certifiedYear !== null) {
    parts.push({
      key: "certification",
      text: `Certified ${skill.certifiedYear}`,
      spoken: `certified in ${skill.certifiedYear}`
    });
  }
  const projects = skill.projectIds.length;
  if (projects > 0) {
    parts.push({
      key: "projects",
      text: projects === 1 ? "Project" : `${projects} projects`,
      spoken:
        projects === 1 ? "used on a project" : `used on ${projects} projects`
    });
  }
  return parts;
}

function evidenceSpoken(skill) {
  return evidenceParts(skill)
    .map((part) => part.spoken)
    .join(", ");
}

// The earliest earned year among a skill's linked certifications, or null when none carries one.
function earliestYear(certificationIds, certifications) {
  const years = certificationIds
    .map((id) => certifications.get(id))
    .map((certification) => certification && certification.earnedYear)
    .filter((year) => Number.isInteger(year));
  return years.length ? Math.min(...years) : null;
}

function summaryOf(skill, years) {
  const parts = [
    `Proficiency ${skill.proficiency} of 5`,
    years ? `${years} used` : "",
    evidenceSpoken(skill)
  ].filter(Boolean);
  return `${parts.join(", ")}.`;
}

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

/**
 * Splits a label into one or two lines. A label over LINE_MAX characters breaks at the space
 * that leaves the longer line shortest, so the two lines come out close in length. A label
 * with no space stays on one line.
 * @param {string} text the whole label
 * @returns {Array<string>} the lines, top first
 */
export function labelLines(text) {
  if (text.length <= LINE_MAX) {
    return [text];
  }
  let best;
  for (let i = text.indexOf(" "); i !== -1; i = text.indexOf(" ", i + 1)) {
    const longer = Math.max(i, text.length - i - 1);
    if (!best || longer < best.longer) {
      best = { at: i, longer };
    }
  }
  return best ? [text.slice(0, best.at), text.slice(best.at + 1)] : [text];
}

function labelOf(node) {
  const name =
    node.kind === "certification"
      ? node.name.replace(CERTIFICATION_PREFIX, "")
      : node.name;
  return name || node.name;
}

function certificationText(certification) {
  return certification.isRetired
    ? `${certification.name} (retired)`
    : certification.name;
}

// The kinds of evidence behind a skill, 0 to 3, counted by kind and never by rows.
function evidenceOf(skill) {
  return (
    (skill.roleIds.length > 0 ? 1 : 0) +
    (skill.projectIds.length > 0 ? 1 : 0) +
    (skill.certificationIds.length > 0 ? 1 : 0)
  );
}

function joinKinds(parts) {
  if (parts.length < 2) {
    return parts.join("");
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// "Backed by a role, a project and a certification." A skill whose only certifications are
// retired says "a retired certification". Empty for a skill with no evidence.
export function evidenceSentence(skill, certifications) {
  const parts = [];
  if (skill.roleIds.length) {
    parts.push("a role");
  }
  if (skill.projectIds.length) {
    parts.push("a project");
  }
  if (skill.certificationIds.length) {
    const allRetired = skill.certificationIds.every(
      (id) => certifications.get(id) && certifications.get(id).isRetired
    );
    parts.push(allRetired ? "a retired certification" : "a certification");
  }
  return parts.length ? `Backed by ${joinKinds(parts)}.` : "";
}

// Turns the GraphQL payload and the certification links into skills, roles, projects,
// certifications and the links between them. A junction row whose skill is not in the skill
// result is dropped, so every link has both ends.
function buildModel(data, certificationLinks, today) {
  const skills = new Map();
  rowsOf(data, "Skill__c").forEach((row) => {
    const name =
      fieldValue(row, "Display_Name__c") ||
      fieldValue(row, "Name") ||
      "Unnamed skill";
    const order = Number(fieldValue(row, "Category_Order__c"));
    const proficiency = Math.round(Number(fieldValue(row, "Proficiency__c")));
    skills.set(row.Id, {
      id: row.Id,
      name,
      category: fieldValue(row, "Category__c") || OTHER_CATEGORY,
      categoryOrder:
        fieldValue(row, "Category_Order__c") !== null && Number.isFinite(order)
          ? order
          : Number.MAX_SAFE_INTEGER,
      proficiency: Number.isFinite(proficiency)
        ? Math.min(Math.max(proficiency, 0), 5)
        : 0,
      roleIds: [],
      projectIds: [],
      certificationIds: []
    });
  });

  const roles = new Map();
  const projects = new Map();
  const certifications = new Map();
  const links = [];

  rowsOf(data, "Experience_Skill__c").forEach((row) => {
    const skill = skills.get(fieldValue(row, "Skill__c"));
    const roleId = fieldValue(row, "Experience__c");
    if (!skill || !roleId) {
      return;
    }
    if (!roles.has(roleId)) {
      const related = row.Experience__r;
      roles.set(roleId, {
        id: roleId,
        name: fieldValue(related, "Name") || "Role",
        startDate: fieldValue(related, "Start_Date__c"),
        endDate: fieldValue(related, "End_Date__c"),
        isCurrent: fieldValue(related, "Is_Current_Role__c") === true
      });
    }
    if (!skill.roleIds.includes(roleId)) {
      skill.roleIds.push(roleId);
      links.push({ id: row.Id, source: skill.id, target: roleId });
    }
  });

  rowsOf(data, "Project_Skill__c").forEach((row) => {
    const skill = skills.get(fieldValue(row, "Skill__c"));
    const projectId = fieldValue(row, "Project__c");
    if (!skill || !projectId) {
      return;
    }
    if (!projects.has(projectId)) {
      projects.set(projectId, {
        id: projectId,
        name: fieldValue(row.Project__r, "Name") || "Project"
      });
    }
    if (!skill.projectIds.includes(projectId)) {
      skill.projectIds.push(projectId);
      links.push({ id: row.Id, source: skill.id, target: projectId });
    }
  });

  (Array.isArray(certificationLinks) ? certificationLinks : []).forEach(
    (entry) => {
      if (!entry || !entry.id || !Array.isArray(entry.skillIds)) {
        return;
      }
      entry.skillIds.forEach((skillId) => {
        const skill = skills.get(skillId);
        if (!skill || skill.certificationIds.includes(entry.id)) {
          return;
        }
        if (!certifications.has(entry.id)) {
          certifications.set(entry.id, {
            id: entry.id,
            name: entry.name || "Certification",
            isRetired: entry.isRetired === true,
            earnedYear: Number.isInteger(entry.earnedYear)
              ? entry.earnedYear
              : null
          });
        }
        skill.certificationIds.push(entry.id);
        links.push({
          id: `${entry.id}:${skill.id}`,
          source: skill.id,
          target: entry.id
        });
      });
    }
  );

  skills.forEach((skill) => {
    skill.years = yearsUsed(
      skill.roleIds.map((id) => roles.get(id)),
      today
    );
    skill.certifiedYear = earliestYear(skill.certificationIds, certifications);
    skill.evidence = evidenceOf(skill);
  });

  return { skills, roles, projects, certifications, links };
}

// ---------- label placement ----------

// The box a label covers, with y the first line's baseline.
function textBox(x, y, anchor, lines, charWidth, fontSize) {
  const width = Math.max(...lines.map((line) => line.length)) * charWidth;
  let left = x;
  if (anchor === "middle") {
    left = x - width / 2;
  } else if (anchor === "end") {
    left = x - width;
  }
  return {
    left,
    right: left + width,
    top: y - 0.75 * fontSize,
    bottom: y + (lines.length - 1) * LINE_HEIGHT + 0.25 * fontSize
  };
}

function boxesOverlap(a, b) {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

function boxHitsCircle(box, circle) {
  const nearX = Math.min(Math.max(circle.x, box.left), box.right);
  const nearY = Math.min(Math.max(circle.y, box.top), box.bottom);
  return Math.hypot(circle.x - nearX, circle.y - nearY) < circle.r;
}

// Spots round a node, nearest first: beside it on the outward side, then the other side, then
// above or below, then the four corners. Lift is how much of a second line the label moves
// up by, so a two line label stays centred beside its node and grows away from it above.
function labelSpots(entry, centre) {
  const { x, y, r } = entry;
  const side = r + LABEL_GAP;
  const right = { x: x + side, y: y + 4, anchor: "start", lift: 0.5 };
  const left = { x: x - side, y: y + 4, anchor: "end", lift: 0.5 };
  const above = { x, y: y - side - 1, anchor: "middle", lift: 1 };
  const below = { x, y: y + side + 9, anchor: "middle", lift: 0 };
  const corner = r * 0.7 + LABEL_GAP;
  const corners = [
    { x: x + corner, y: y - corner, anchor: "start", lift: 1 },
    { x: x + corner, y: y + corner + 8, anchor: "start", lift: 0 },
    { x: x - corner, y: y - corner, anchor: "end", lift: 1 },
    { x: x - corner, y: y + corner + 8, anchor: "end", lift: 0 }
  ];
  const sideFirst = x >= centre.x ? [right, left] : [left, right];
  const verticalFirst = y >= centre.y ? [below, above] : [above, below];
  return [...sideFirst, ...verticalFirst, ...corners];
}

// What placeLabels tries for one label, in order. A label that wraps tries every spot as two
// lines, then beside the node with the block growing down or up from the node's line, and
// last the whole text on one line, which fits a gap that is wide but not tall.
function labelCandidates(entry, centre) {
  const spots = labelSpots(entry, centre);
  const lines = labelLines(entry.text);
  if (lines.length === 1) {
    return spots.map((spot) => ({ ...spot, lines }));
  }
  const shifted = spots.slice(0, 2).flatMap((spot) => [
    { ...spot, lift: 0, lines },
    { ...spot, lift: 1, lines }
  ]);
  return [
    ...spots.map((spot) => ({ ...spot, lines })),
    ...shifted,
    ...spots.map((spot) => ({ ...spot, lines: [entry.text] }))
  ];
}

/**
 * Places labels one at a time, in the order given, at the first spot that covers no label
 * already placed, no fixed box and no other node. When every spot covers something, the one
 * covering least wins. Pure, so the same input always gives the same placement.
 * @param {Array<object>} entries each { id, text, x, y, r }
 * @param {Array<object>} circles every drawn node as { id, x, y, r }
 * @param {Array<object>} fixed boxes labels must not cover, such as the category labels
 * @param {object} centre the graph's centre { x, y }, so labels lean outward
 * @returns {Map<string, object>} id to { x, y, anchor, lines, box }, y the first baseline
 */
export function placeLabels(entries, circles, fixed, centre) {
  const placed = new Map();
  const taken = [...fixed];
  entries.forEach((entry) => {
    let best;
    let bestHits = Infinity;
    for (const spot of labelCandidates(entry, centre)) {
      const { lines } = spot;
      const y = spot.y - spot.lift * (lines.length - 1) * LINE_HEIGHT;
      const box = textBox(spot.x, y, spot.anchor, lines, NODE_CHAR, NODE_FONT);
      let hits = 0;
      taken.forEach((other) => {
        if (boxesOverlap(box, other)) {
          hits++;
        }
      });
      circles.forEach((circle) => {
        if (circle.id !== entry.id && boxHitsCircle(box, circle)) {
          hits++;
        }
      });
      if (hits < bestHits) {
        best = { x: spot.x, y, anchor: spot.anchor, lines, box };
        bestHits = hits;
        if (hits === 0) {
          break;
        }
      }
    }
    placed.set(entry.id, best);
    taken.push(best.box);
  });
  return placed;
}

// ---------- visit storage ----------

function readPositions() {
  try {
    const raw = window.sessionStorage.getItem(POSITIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writePositions(size, positions) {
  try {
    if (Object.keys(positions).length) {
      window.sessionStorage.setItem(
        POSITIONS_KEY,
        JSON.stringify({ size, positions })
      );
    } else {
      window.sessionStorage.removeItem(POSITIONS_KEY);
    }
  } catch {
    // Storage can be blocked. The positions then last as long as the page.
  }
}

export default class SkillNetwork extends LightningElement {
  model;
  networkData;
  certificationLinks = [];
  isLoading = true;
  errorMessage;
  isSmall = false;
  view = VIEW_MATRIX;
  selectedSkillId;
  // Persona filter: tags by skill id, and the chosen persona ("" for All).
  personaTags = new Map();
  persona = PERSONA_ALL;
  // Chips fading out or in after a persona change, by skill id.
  leavingIds = new Set();
  enteringIds = new Set();
  fadeTimer;
  // Focus to move after the next render: the detail heading, or the chip it was opened from.
  pendingFocus;

  // Graph view state.
  graphLoading = false;
  graphErrorMessage;
  layout;
  hoverId;
  selectedNodeId;
  disconnected = false;

  // Pan, zoom and drag state. moved holds the dragged positions by node id, on top of
  // the computed layout. engine, panZoom and the bound markers are plain references, not drawn.
  zoomTransform = "translate(0,0) scale(1)";
  zoomScale = 1;
  fitScale = 1;
  moved = {};
  draggedId;
  canZoom = false;
  engine;
  panZoom;
  boundSvg;
  boundLayout;
  boundNodeKey = "";
  keyboardPanTracked = false;

  connectedCallback() {
    this.disconnected = false;
    this.isSmall = FORM_FACTOR === "Small" || this.isNarrowViewport();
    if (this.isSmall) {
      this.view = VIEW_MATRIX;
    }
  }

  disconnectedCallback() {
    this.disconnected = true;
    this.unbindGraph();
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = undefined;
    }
  }

  renderedCallback() {
    this.bindGraphInteractions();
    this.applyPendingFocus();
  }

  isNarrowViewport() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia(NARROW_VIEWPORT_QUERY).matches
    );
  }

  @wire(graphql, { query: SKILL_NETWORK_QUERY })
  wiredNetwork({ data, errors }) {
    if (errors && errors.length) {
      this.isLoading = false;
      this.errorMessage =
        errors
          .map((error) => error && error.message)
          .filter(Boolean)
          .join(" ") || ERROR_TITLE;
      return;
    }
    if (!data) {
      return;
    }
    this.networkData = data;
    this.errorMessage = undefined;
    this.isLoading = false;
    this.refreshModel();
  }

  // The certification evidence. A failed read leaves the graph with roles and projects only.
  @wire(getCertificationLinks)
  wiredCertifications({ data, error }) {
    if (error) {
      this.certificationLinks = [];
    } else if (data) {
      this.certificationLinks = data;
    } else {
      return;
    }
    this.refreshModel();
  }

  // New data means new positions. An open graph lays itself out again, keeping the dragged
  // positions of nodes that are still there.
  refreshModel() {
    if (!this.networkData) {
      return;
    }
    this.model = buildModel(
      this.networkData,
      this.certificationLinks,
      todayUtc()
    );
    this.layout = undefined;
    if (this.isGraph) {
      this.openGraph();
    }
  }

  @wire(graphql, { query: SKILL_PERSONAS_QUERY })
  wiredPersonas({ data, errors }) {
    const tags = new Map();
    if (data && !(errors && errors.length)) {
      rowsOf(data, "Skill__c").forEach((row) => {
        const value = fieldValue(row, "Persona_Tag__c");
        if (typeof value === "string" && value) {
          tags.set(row.Id, value.split(";").filter(Boolean));
        }
      });
    }
    this.personaTags = tags;
    if (!tags.size) {
      this.persona = PERSONA_ALL;
    }
  }

  // ---------- state ----------

  get hasError() {
    return !this.isLoading && Boolean(this.errorMessage);
  }

  // The reason under the error title, left out when it is only the title's own sentence again.
  get errorDetail() {
    const message = (this.errorMessage || "").trim();
    return message.toLowerCase() === ERROR_TITLE.toLowerCase() ? "" : message;
  }

  get hasErrorDetail() {
    return this.errorDetail !== "";
  }

  get errorTitle() {
    return ERROR_TITLE;
  }

  get hasSkills() {
    return Boolean(this.model) && this.model.skills.size > 0;
  }

  get isEmpty() {
    return !this.isLoading && !this.errorMessage && !this.hasSkills;
  }

  get showSwitch() {
    return !this.isSmall;
  }

  get isMatrix() {
    return !this.isGraph;
  }

  get isGraph() {
    return this.view === VIEW_GRAPH && !this.isSmall;
  }

  get matrixPressed() {
    return String(this.isMatrix);
  }

  get graphPressed() {
    return String(this.isGraph);
  }

  get matrixButtonClass() {
    return this.isMatrix ? "view-button is-on" : "view-button";
  }

  get graphButtonClass() {
    return this.isGraph ? "view-button is-on" : "view-button";
  }

  // ---------- persona filter ----------

  get showPersonaFilter() {
    return this.hasSkills && this.personaTags.size > 0;
  }

  get personaFilterActive() {
    return this.showPersonaFilter && this.persona !== PERSONA_ALL;
  }

  get personaButtons() {
    return [{ label: "All", value: PERSONA_ALL }, ...PERSONA_OPTIONS].map(
      (option) => {
        const on = option.value === this.persona;
        return {
          key: option.value || "all",
          label: option.label,
          value: option.value,
          pressed: String(on),
          className: on ? "persona-button is-on" : "persona-button"
        };
      }
    );
  }

  matchesPersona(skill) {
    if (!this.personaFilterActive) {
      return true;
    }
    const tags = this.personaTags.get(skill.id);
    return Boolean(tags) && tags.includes(this.persona);
  }

  shownSkillIds() {
    return new Set(
      this.model
        ? [...this.model.skills.values()]
            .filter((skill) => this.matchesPersona(skill))
            .map((skill) => skill.id)
        : []
    );
  }

  get personaSummary() {
    if (!this.personaFilterActive) {
      return "";
    }
    const total = this.model.skills.size;
    const shown = [...this.model.skills.values()].filter((skill) =>
      this.matchesPersona(skill)
    ).length;
    const option = PERSONA_OPTIONS.find((item) => item.value === this.persona);
    const word = total === 1 ? "skill" : "skills";
    return `Showing ${shown} of ${total} ${word} for ${option.label}.`;
  }

  handlePersonaClick(event) {
    const value = event.currentTarget.dataset.value || PERSONA_ALL;
    if (value === this.persona) {
      return;
    }
    const before = this.shownSkillIds();
    this.persona = value;
    this.startChipFade(before, this.shownSkillIds());
    const selected =
      this.model && this.selectedSkillId
        ? this.model.skills.get(this.selectedSkillId)
        : undefined;
    if (selected && !this.matchesPersona(selected)) {
      this.selectedSkillId = undefined;
    }
    // A graph node the persona hides can be neither selected nor hovered.
    if (this.selectedNodeId && !this.isNodeShown(this.selectedNodeId)) {
      this.selectedNodeId = undefined;
    }
    if (this.hoverId && !this.isNodeShown(this.hoverId)) {
      this.hoverId = undefined;
    }
    trackEvent(EVENTS.SKILLS_PERSONA_FILTERED, { persona: value || "All" });
  }

  // The chips that drop out stay a moment, fading, and the new ones fade in. Under reduced
  // motion the matrix changes at once.
  startChipFade(before, after) {
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = undefined;
    }
    if (isReduced() || !this.isMatrix) {
      this.leavingIds = new Set();
      this.enteringIds = new Set();
      return;
    }
    this.leavingIds = new Set([...before].filter((id) => !after.has(id)));
    this.enteringIds = new Set([...after].filter((id) => !before.has(id)));
    if (!this.leavingIds.size && !this.enteringIds.size) {
      return;
    }
    // A timer is the only way to end the fade, because jsdom and some browsers never send
    // animationend for a chip that is removed or hidden.

    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = undefined;
      this.leavingIds = new Set();
      this.enteringIds = new Set();
    }, CHIP_FADE_MS);
  }

  // ---------- matrix ----------

  // The matrix rows under the persona filter. Categories left with no skill are left out,
  // except while their chips fade out.
  get matrixRows() {
    const selection = this.selection;
    return this.categoryRows
      .map((row) => {
        const chips = row.chips
          .filter(
            (chip) =>
              this.matchesPersona(this.model.skills.get(chip.id)) ||
              this.leavingIds.has(chip.id)
          )
          .map((chip) => {
            const leaving = this.leavingIds.has(chip.id);
            const entering = this.enteringIds.has(chip.id);
            let itemClass = "chip-item";
            if (leaving) {
              itemClass = "chip-item is-leaving";
            } else if (entering) {
              itemClass = "chip-item is-entering";
            }
            return { ...chip, isLeaving: leaving, itemClass };
          });
        const showSelection =
          Boolean(selection) &&
          chips.some((chip) => chip.id === this.selectedSkillId);
        return {
          ...row,
          chips,
          showSelection,
          leavingOnly: chips.every((chip) => chip.isLeaving)
        };
      })
      .filter((row) => row.chips.length > 0)
      .map((row) => ({
        ...row,
        rowClass: row.leavingOnly ? "matrix-row is-leaving" : "matrix-row"
      }));
  }

  get matrixIsEmpty() {
    return (
      this.personaFilterActive &&
      !this.categoryRows.some((row) =>
        row.chips.some((chip) =>
          this.matchesPersona(this.model.skills.get(chip.id))
        )
      )
    );
  }

  // The graph under the same rule: true when the persona leaves no skill to draw.
  get graphIsEmpty() {
    return (
      this.personaFilterActive &&
      Boolean(this.model) &&
      ![...this.model.skills.values()].some((skill) =>
        this.matchesPersona(skill)
      )
    );
  }

  // Roles, projects and certifications always show. A skill shows when it matches the persona.
  isNodeShown(id) {
    const skill = this.model && this.model.skills.get(id);
    return skill ? this.matchesPersona(skill) : true;
  }

  get categoryRows() {
    if (!this.model) {
      return [];
    }
    const groups = new Map();
    this.model.skills.forEach((skill) => {
      if (!groups.has(skill.category)) {
        groups.set(skill.category, {
          name: skill.category,
          order: skill.categoryOrder,
          skills: []
        });
      }
      const group = groups.get(skill.category);
      group.order = Math.min(group.order, skill.categoryOrder);
      group.skills.push(skill);
    });
    return [...groups.values()]
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((group, index) => ({
        key: group.name,
        name: group.name,
        headingId: `skill-category-${index}`,
        selectionTitleId: `skill-selection-${index}`,
        chips: [...group.skills]
          .sort((a, b) => b.proficiency - a.proficiency || byName(a, b))
          .map((skill) => this.chipFor(skill))
      }));
  }

  chipFor(skill) {
    const selected = skill.id === this.selectedSkillId;
    const years = yearsLabel(skill.years);
    return {
      id: skill.id,
      name: skill.name,
      proficiency: `${skill.proficiency}/5`,
      years,
      hasYears: Boolean(years),
      evidence: evidenceParts(skill),
      pressed: String(selected),
      className: selected ? "chip is-selected" : "chip",
      ariaLabel: [
        skill.name,
        `proficiency ${skill.proficiency} of 5`,
        yearsSpoken(skill.years),
        evidenceSpoken(skill)
      ]
        .filter(Boolean)
        .join(", ")
    };
  }

  get selection() {
    const skill =
      this.model && this.selectedSkillId
        ? this.model.skills.get(this.selectedSkillId)
        : undefined;
    if (!skill) {
      return undefined;
    }
    const roles = skill.roleIds
      .map((id) => this.model.roles.get(id))
      .sort(byName)
      .map((role) => ({ id: role.id, name: role.name }));
    const projects = skill.projectIds
      .map((id) => this.model.projects.get(id))
      .sort(byName)
      .map((project) => ({ id: project.id, name: project.name }));
    const certifications = skill.certificationIds
      .map((id) => this.model.certifications.get(id))
      .sort(byName)
      .map((certification) => ({
        id: certification.id,
        name: certificationText(certification)
      }));
    const years = yearsLabel(skill.years);
    return {
      name: skill.name,
      summary: summaryOf(skill, years),
      evidence: evidenceSentence(skill, this.model.certifications),
      roles,
      projects,
      certifications,
      hasRoles: roles.length > 0,
      hasProjects: projects.length > 0,
      hasCertifications: certifications.length > 0,
      isUnused: skill.evidence === 0
    };
  }

  handleChipClick(event) {
    const id = event.currentTarget.dataset.id;
    const opening = this.selectedSkillId !== id;
    this.selectSkill(id);
    if (opening && this.selectedSkillId === id) {
      this.pendingFocus = { kind: "detail" };
    }
  }

  handleClearSelection() {
    const id = this.selectedSkillId;
    this.selectedSkillId = undefined;
    if (id) {
      this.pendingFocus = { kind: "chip", id };
    }
  }

  // Moves focus once, after the render that drew its target. The detail heading also scrolls
  // into view if it is not on screen, smoothly unless motion is reduced.
  applyPendingFocus() {
    const pending = this.pendingFocus;
    if (!pending) {
      return;
    }
    this.pendingFocus = undefined;
    const target =
      pending.kind === "detail"
        ? this.template.querySelector(".selection-title")
        : this.template.querySelector(`button.chip[data-id="${pending.id}"]`);
    if (!target) {
      return;
    }
    if (pending.kind === "detail") {
      const panel = this.template.querySelector(".selection-panel");
      if (panel && typeof panel.scrollIntoView === "function") {
        panel.scrollIntoView({
          block: "nearest",
          behavior: isReduced() ? "auto" : "smooth"
        });
      }
    }
    target.focus({ preventScroll: true });
  }

  selectSkill(id) {
    if (this.selectedSkillId === id) {
      this.selectedSkillId = undefined;
      return;
    }
    const skill = this.model && this.model.skills.get(id);
    if (!skill) {
      return;
    }
    this.selectedSkillId = id;
    trackEvent(EVENTS.SKILL_SELECTED, {
      skill: skill.name,
      years: skill.years === null ? null : Number(skill.years.toFixed(1))
    });
  }

  // ---------- view switch ----------

  handleViewClick(event) {
    const view =
      event.currentTarget.dataset.view === VIEW_GRAPH
        ? VIEW_GRAPH
        : VIEW_MATRIX;
    if (view === this.view || (view === VIEW_GRAPH && this.isSmall)) {
      return;
    }
    this.view = view;
    trackEvent(EVENTS.SKILLS_VIEW_CHANGED, { view });
    if (view === VIEW_MATRIX) {
      // The graph's SVG leaves the page, so it opens fitted next time. Dragged nodes stay.
      this.unbindGraph();
    }
    if (view === VIEW_GRAPH) {
      this.openGraph();
    }
  }

  // Loads the engine the first time the graph opens and lays the graph out once per data set.
  // Never runs on a phone or a narrow viewport.
  openGraph() {
    if (this.isSmall || this.layout || this.graphLoading || !this.hasSkills) {
      if (this.layout) {
        this.applyFit(this.fitFor(true));
      }
      return Promise.resolve();
    }
    this.graphLoading = true;
    this.graphErrorMessage = undefined;
    return loadGraphEngine(this)
      .then((d3) => {
        if (!this.disconnected) {
          this.engine = d3;
          this.layout = this.computeLayout(d3);
          this.moved = this.restoreMoved();
          this.applyFit(this.fitFor(true));
        }
      })
      .catch((error) => {
        const reason = error && error.message ? ` ${error.message}` : "";
        this.graphErrorMessage = `The graph could not load. The matrix still shows every skill.${reason}`;
      })
      .finally(() => {
        this.graphLoading = false;
      });
  }

  get showGraphCanvas() {
    return Boolean(this.layout) && !this.graphLoading;
  }

  graphNodes() {
    const { skills, roles, projects, certifications } = this.model;
    const nodes = [];
    skills.forEach((skill) =>
      nodes.push({
        id: skill.id,
        kind: "skill",
        name: skill.name,
        group: `category:${skill.category}`,
        radius: 6 + skill.proficiency
      })
    );
    roles.forEach((role) =>
      nodes.push({
        id: role.id,
        kind: "role",
        name: role.name,
        group: `work:${role.id}`,
        radius: WORK_RADIUS
      })
    );
    projects.forEach((project) =>
      nodes.push({
        id: project.id,
        kind: "project",
        name: project.name,
        group: `work:${project.id}`,
        radius: WORK_RADIUS
      })
    );
    certifications.forEach((certification) =>
      nodes.push({
        id: certification.id,
        kind: "certification",
        name: certification.name,
        isRetired: certification.isRetired,
        group: `work:${certification.id}`,
        radius: WORK_RADIUS
      })
    );
    return nodes;
  }

  // Ring sizes from the node counts: the categories on the inner ring, then roles, projects
  // and certifications, each kind an arc of its own, on the outer ring.
  graphGeometry(categoryCount) {
    const outerCount =
      this.model.roles.size +
      this.model.projects.size +
      this.model.certifications.size;
    const categoryRadius = Math.max(
      CATEGORY_RING_MIN,
      (categoryCount * CATEGORY_ARC) / (2 * Math.PI)
    );
    const outerRadius = Math.max(
      categoryRadius + CLUSTER_ROOM,
      (outerCount * OUTER_ARC) / (2 * Math.PI)
    );
    const size = Math.round(2 * (outerRadius + BOX_MARGIN));
    return { categoryRadius, outerRadius, size };
  }

  graphAnchors(categoryNames, geometry) {
    const centre = geometry.size / 2;
    const anchors = {};
    const onRing = (keys, radius) =>
      keys.forEach((key, index) => {
        const angle = (2 * Math.PI * index) / keys.length - Math.PI / 2;
        anchors[key] = {
          x: centre + radius * Math.cos(angle),
          y: centre + radius * Math.sin(angle)
        };
      });
    onRing(
      categoryNames.map((name) => `category:${name}`),
      geometry.categoryRadius
    );
    const outer = [
      ...[...this.model.roles.values()].sort(byName),
      ...[...this.model.projects.values()].sort(byName),
      ...[...this.model.certifications.values()].sort(byName)
    ].map((item) => `work:${item.id}`);
    onRing(outer, geometry.outerRadius);
    return anchors;
  }

  computeLayout(d3) {
    const categoryNames = this.categoryRows.map((row) => row.name);
    const geometry = this.graphGeometry(categoryNames.length);
    const anchors = this.graphAnchors(categoryNames, geometry);
    const labelNodes = categoryNames.map((name) => ({
      id: `category:${name}`,
      kind: "category",
      name,
      group: `category:${name}`,
      radius: name.length * CATEGORY_RADIUS_PER_CHAR
    }));
    const result = layoutGraph(
      d3,
      [...this.graphNodes(), ...labelNodes],
      this.model.links,
      {
        width: geometry.size,
        height: geometry.size,
        anchors,
        // Category labels hold their anchor and the outer nodes their place on the ring.
        // Skills gather by category.
        anchorStrength: (node) => {
          if (node.kind === "skill") {
            return 0.15;
          }
          return node.kind === "category" ? 1 : 0.9;
        },
        linkDistance: 80,
        linkStrength: 0.01,
        charge: -130,
        padding: 18
      }
    );
    const categories = result.nodes
      .filter((node) => node.kind === "category")
      .map((node) => ({
        key: node.name,
        name: node.name,
        x: node.x,
        y: node.y
      }));
    const nodes = result.nodes.filter((node) => node.kind !== "category");
    return { nodes, edges: result.edges, categories, size: geometry.size };
  }

  // The saved positions of this visit, for nodes the layout still has, inside its box. A
  // saved set from a box of another size, or for ids no longer drawn, is dropped.
  restoreMoved() {
    const size = this.layout.size;
    const saved = readPositions();
    const merged = {
      ...(saved && saved.size === size && saved.positions
        ? saved.positions
        : {}),
      ...(this.movedSize === size ? this.moved : {})
    };
    const kept = {};
    this.layout.nodes.forEach((node) => {
      const point = merged[node.id];
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        kept[node.id] = this.clampToBox(node, point.x, point.y);
      }
    });
    this.movedSize = size;
    return kept;
  }

  clampToBox(node, x, y) {
    const r = node.radius || 0;
    const size = this.layout.size;
    return {
      x: Math.min(Math.max(x, r), size - r),
      y: Math.min(Math.max(y, r), size - r)
    };
  }

  get activeId() {
    return this.hoverId || this.selectedNodeId;
  }

  positionedNodes() {
    return this.layout.nodes
      .filter((placed) => this.isNodeShown(placed.id))
      .map((placed) => this.withMoved(placed));
  }

  // A placed node at its dragged position, when it has one.
  withMoved(placed) {
    const point = this.moved[placed.id];
    return point ? { ...placed, ...point } : placed;
  }

  // The category labels as boxes, for the persona's categories.
  shownCategories(nodes) {
    if (!this.personaFilterActive) {
      return this.layout.categories;
    }
    const names = new Set(
      nodes
        .filter((node) => node.kind === "skill")
        .map((node) => this.model.skills.get(node.id).category)
    );
    return this.layout.categories.filter((category) =>
      names.has(category.name)
    );
  }

  evidenceOfNode(node) {
    return node.kind === "skill" ? this.model.skills.get(node.id).evidence : 0;
  }

  reachOf(node) {
    const ring = EVIDENCE_RING_WIDTH[this.evidenceOfNode(node)];
    return ring ? node.radius + EVIDENCE_RING_GAP + ring : node.radius;
  }

  // Labels shown at rest: every node that is not a skill. The rest are shown on hover.
  labelPlan(nodes, categories, extraIds) {
    const centre = { x: this.layout.size / 2, y: this.layout.size / 2 };
    const circles = nodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      r: this.reachOf(node)
    }));
    const fixed = categories.map((category) =>
      textBox(
        category.x,
        category.y,
        "middle",
        [category.name],
        CATEGORY_CHAR,
        CATEGORY_FONT
      )
    );
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const entryOf = (node) => ({
      id: node.id,
      text: labelOf(node),
      x: node.x,
      y: node.y,
      r: this.reachOf(node)
    });
    const rest = nodes.filter((node) => node.kind !== "skill").map(entryOf);
    const extra = extraIds
      .map((id) => byId.get(id))
      .filter((node) => node && node.kind === "skill")
      .map(entryOf);
    return {
      placements: placeLabels([...rest, ...extra], circles, fixed, centre),
      circles,
      fixed
    };
  }

  // The view that shows every drawn node and every label at rest. allNodes ignores the
  // persona, for the first fit, so the view does not change with the filter.
  fitFor(allNodes) {
    if (!this.layout) {
      return { x: 0, y: 0, k: 1 };
    }
    const nodes = allNodes
      ? this.layout.nodes.map((placed) => this.withMoved(placed))
      : this.positionedNodes();
    const categories = allNodes
      ? this.layout.categories
      : this.shownCategories(nodes);
    const { placements, circles, fixed } = this.labelPlan(
      nodes,
      categories,
      []
    );
    const boxes = [
      ...circles.map((circle) => ({
        left: circle.x - circle.r,
        right: circle.x + circle.r,
        top: circle.y - circle.r,
        bottom: circle.y + circle.r
      })),
      ...fixed,
      ...[...placements.values()].map((spot) => spot.box)
    ];
    const bounds = boundsOf(boxes);
    if (!bounds) {
      return { x: 0, y: 0, k: 1 };
    }
    const extent = [
      [FIT_MARGIN, FIT_MARGIN],
      [VIEW_WIDTH - FIT_MARGIN, VIEW_HEIGHT - FIT_MARGIN]
    ];
    return fitTransform(bounds, extent, { min: 0.05, max: 4 });
  }

  // The pan limit in layout units: the whole layout box and its labels, plus a margin.
  panExtent() {
    const fit = this.fitFor(true);
    const left = (FIT_MARGIN - fit.x) / fit.k;
    const top = (FIT_MARGIN - fit.y) / fit.k;
    const right = (VIEW_WIDTH - FIT_MARGIN - fit.x) / fit.k;
    const bottom = (VIEW_HEIGHT - FIT_MARGIN - fit.y) / fit.k;
    const size = this.layout.size;
    return [
      [Math.min(left, 0) - PAN_MARGIN, Math.min(top, 0) - PAN_MARGIN],
      [Math.max(right, size) + PAN_MARGIN, Math.max(bottom, size) + PAN_MARGIN]
    ];
  }

  // Draws a fit at once, and tells d3-zoom when it is wired, so a later gesture starts there.
  applyFit(fit, duration) {
    this.fitScale = fit.k;
    if (this.panZoom && typeof this.panZoom.fitTo === "function") {
      this.panZoom.fitTo(fit, duration);
      if (!duration) {
        this.applyZoom(fit);
      }
    } else {
      this.applyZoom(fit);
    }
  }

  get graphModel() {
    if (!this.layout) {
      return undefined;
    }
    const active = this.activeId;
    const linked = new Set();
    const edges = [];
    this.layout.edges.forEach((edge) => {
      if (!this.isNodeShown(edge.source) || !this.isNodeShown(edge.target)) {
        return;
      }
      if (active && (edge.source === active || edge.target === active)) {
        linked.add(edge.source);
        linked.add(edge.target);
        const from = this.moved[edge.source] || { x: edge.x1, y: edge.y1 };
        const to = this.moved[edge.target] || { x: edge.x2, y: edge.y2 };
        const skill = this.model.skills.get(edge.source);
        edges.push({
          key: edge.id,
          className: EVIDENCE_EDGE_CLASS[skill ? skill.evidence : 1],
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y
        });
      }
    });
    const shown = this.positionedNodes();
    const categories = this.shownCategories(shown);
    const extraIds = active
      ? [active, ...[...linked].filter((id) => id !== active)]
      : [];
    const { placements } = this.labelPlan(shown, categories, extraIds);
    const nodes = shown.map((node) => {
      const isActive = node.id === active;
      const isLinked = linked.has(node.id) && !isActive;
      const classes = [`graph-node node-${node.kind}`];
      const evidence = this.evidenceOfNode(node);
      if (node.kind === "skill") {
        classes.push(`evidence-${evidence}`);
      }
      if (node.isRetired) {
        classes.push("is-retired");
      }
      if (isActive) {
        classes.push("is-active");
      } else if (isLinked) {
        classes.push("is-linked");
      } else if (active) {
        classes.push("is-dim");
      }
      const spot = placements.get(node.id);
      const ringWidth = EVIDENCE_RING_WIDTH[evidence];
      const kindLabel = node.isRetired
        ? `${KIND_LABELS[node.kind]}, retired`
        : KIND_LABELS[node.kind];
      return {
        key: node.id,
        id: node.id,
        className: classes.join(" "),
        cx: node.x,
        cy: node.y,
        r: node.radius,
        hasRing: ringWidth > 0,
        ringR: node.radius + EVIDENCE_RING_GAP + ringWidth / 2,
        title: `${node.name} (${kindLabel})`,
        showLabel: Boolean(spot),
        labelLines: (spot ? spot.lines : [labelOf(node)]).map((text, i) => ({
          key: `${node.id}-${i}`,
          text,
          dy: i === 0 ? 0 : LINE_HEIGHT
        })),
        labelX: spot ? spot.x : node.x,
        labelY: spot ? spot.y : node.y,
        anchor: spot ? spot.anchor : "start"
      };
    });
    return {
      viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`,
      transform: this.zoomTransform,
      edges,
      nodes,
      categories
    };
  }

  handleNodeEnter(event) {
    this.hoverId = event.currentTarget.dataset.id;
  }

  handleNodeLeave() {
    this.hoverId = undefined;
  }

  handleNodeClick(event) {
    const id = event.currentTarget.dataset.id;
    this.selectedNodeId = this.selectedNodeId === id ? undefined : id;
    if (this.selectedNodeId && this.model.skills.has(id)) {
      this.selectSkill(id);
    }
  }

  // ---------- pan, zoom and drag ----------

  // Wires d3-zoom to the SVG once per SVG element and d3-drag to the nodes once per node set.
  // Guarded, so the re-render each zoom or drag step causes binds nothing new. A new layout on
  // the same SVG is fitted again.
  bindGraphInteractions() {
    if (!this.engine || !this.layout) {
      return;
    }
    const svg = this.template.querySelector(".graph-svg");
    if (!svg) {
      return;
    }
    if (svg !== this.boundSvg || this.layout !== this.boundLayout) {
      this.unbindGraph();
      this.boundSvg = svg;
      this.boundLayout = this.layout;
      const fit = this.fitFor(true);
      this.panZoom = attachPanZoom(this.engine, svg, {
        extent: VIEW_EXTENT,
        translateExtent: this.panExtent(),
        min: fit.k * MIN_ZOOM_OF_FIT,
        max: fit.k * MAX_ZOOM_OF_FIT,
        // One finger on a touch screen scrolls the page while the graph sits at its fit.
        rest: fit.k,
        // A plain wheel scrolls the page. Ctrl with the wheel, or a pinch, zooms.
        ctrlWheel: true,
        onZoom: (transform) => this.applyZoom(transform),
        // A wheel and a touch pinch are each sent once per gesture. A drag pan is not sent.
        onGestureEnd: (gesture) => {
          if (gesture === "wheel" || gesture === "pinch") {
            this.trackZoom(gesture);
          }
        }
      });
      const canZoom = Boolean(this.panZoom);
      if (this.canZoom !== canZoom) {
        this.canZoom = canZoom;
      }
      this.applyFit(fit);
    }
    // Keyed by the drawn ids, so a persona change that swaps nodes binds the new ones.
    const nodes = this.template.querySelectorAll(".graph-node");
    const nodeKey = [...nodes].map((node) => node.dataset.id).join(",");
    if (nodes.length && nodeKey !== this.boundNodeKey) {
      this.boundNodeKey = nodeKey;
      attachNodeDrag(this.engine, nodes, {
        position: (id) => this.positionOf(id),
        onDrag: (id, x, y) => this.moveNode(id, x, y),
        onEnd: (id) => this.endDrag(id)
      });
    }
  }

  unbindGraph() {
    if (this.panZoom) {
      this.panZoom.detach();
    }
    this.panZoom = undefined;
    this.boundSvg = undefined;
    this.boundLayout = undefined;
    this.boundNodeKey = "";
  }

  applyZoom(transform) {
    this.zoomTransform = `translate(${transform.x},${transform.y}) scale(${transform.k})`;
    this.zoomScale = transform.k;
  }

  positionOf(id) {
    if (this.moved[id]) {
      return this.moved[id];
    }
    const node =
      this.layout && this.layout.nodes.find((item) => item.id === id);
    return node ? { x: node.x, y: node.y } : undefined;
  }

  // Keeps a dragged node inside the layout box, radius included, like the layout does.
  moveNode(id, x, y) {
    const node =
      this.layout && this.layout.nodes.find((item) => item.id === id);
    if (!node || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    this.moved = { ...this.moved, [id]: this.clampToBox(node, x, y) };
    this.movedSize = this.layout.size;
    this.draggedId = id;
  }

  // A drag that moved its node is kept for the visit and sent once. A click sends nothing.
  endDrag(id) {
    if (this.draggedId !== id) {
      return;
    }
    this.draggedId = undefined;
    writePositions(this.layout.size, this.moved);
    trackEvent(EVENTS.GRAPH_LAYOUT_CHANGED, { action: "drag" });
  }

  // The graph takes focus for arrow key panning only when pan and zoom are wired.
  get graphTabIndex() {
    return this.canZoom ? "0" : "-1";
  }

  // The zoom level against the fitted view, so the graph opens at 100%.
  get zoomLabel() {
    const scale = this.fitScale ? this.zoomScale / this.fitScale : 1;
    return `Zoom ${Math.round(scale * 100)}%`;
  }

  easeMs() {
    return isReduced() ? 0 : EASE_MS;
  }

  // control is one of in, out, wheel, pinch or keyboard. No node name or id is sent.
  trackZoom(control) {
    trackEvent(EVENTS.GRAPH_ZOOM_USED, { control });
  }

  handleZoomIn() {
    if (this.panZoom) {
      this.panZoom.zoomIn(this.easeMs());
      this.trackZoom("in");
    }
  }

  handleZoomOut() {
    if (this.panZoom) {
      this.panZoom.zoomOut(this.easeMs());
      this.trackZoom("out");
    }
  }

  // Shows every drawn node and label, dragged ones where they are.
  handleFit() {
    this.applyFit(this.fitFor(false), this.easeMs());
    trackEvent(EVENTS.GRAPH_LAYOUT_CHANGED, { action: "fit" });
  }

  // Puts every dragged node back, forgets them for the visit and fits the whole graph.
  handleResetLayout() {
    this.moved = {};
    if (this.layout) {
      writePositions(this.layout.size, {});
    }
    this.applyFit(this.fitFor(true), this.easeMs());
    trackEvent(EVENTS.GRAPH_LAYOUT_CHANGED, { action: "reset_layout" });
  }

  // Arrow keys on the focused graph pan it. The key's own page scroll is cancelled only when the
  // graph handles it. The event is sent once each time the graph has focus, not once per press.
  handleGraphKeydown(event) {
    const move = PAN_KEYS[event.key];
    if (!move || !this.panZoom || event.altKey || event.ctrlKey) {
      return;
    }
    event.preventDefault();
    this.panZoom.panBy(move[0], move[1]);
    if (!this.keyboardPanTracked) {
      this.keyboardPanTracked = true;
      this.trackZoom("keyboard");
    }
  }

  handleGraphBlur() {
    this.keyboardPanTracked = false;
  }

  get graphSelectionText() {
    const id = this.selectedNodeId;
    if (!id || !this.model) {
      return "";
    }
    const names = (ids, map, text) =>
      ids.map((key) => (text ? text(map.get(key)) : map.get(key).name)).sort();
    let name;
    let lines;
    let evidence = "";
    const skill = this.model.skills.get(id);
    if (skill) {
      name = skill.name;
      lines = [
        ...names(skill.roleIds, this.model.roles),
        ...names(skill.projectIds, this.model.projects),
        ...names(
          skill.certificationIds,
          this.model.certifications,
          certificationText
        )
      ];
      evidence = evidenceSentence(skill, this.model.certifications);
    } else {
      const work =
        this.model.roles.get(id) ||
        this.model.projects.get(id) ||
        this.model.certifications.get(id);
      if (!work) {
        return "";
      }
      name = work.isRetired ? certificationText(work) : work.name;
      lines = [...this.model.skills.values()]
        .filter(
          (candidate) =>
            this.matchesPersona(candidate) &&
            (candidate.roleIds.includes(id) ||
              candidate.projectIds.includes(id) ||
              candidate.certificationIds.includes(id))
        )
        .map((candidate) => candidate.name)
        .sort();
    }
    const text = lines.length
      ? `${name}: ${lines.join(", ")}.`
      : `${name}: no connections.`;
    return evidence ? `${text} ${evidence}` : text;
  }

  // ---------- legend ----------

  get hasCertifications() {
    return Boolean(this.model) && this.model.certifications.size > 0;
  }

  get hasRetired() {
    return (
      Boolean(this.model) &&
      [...this.model.certifications.values()].some((item) => item.isRetired)
    );
  }

  // ---------- accessible list ----------

  // One entry per graph node for screen readers, naming every node it connects to. The SVG is
  // hidden from assistive technology, so this list is the graph's text equivalent.
  get accessibleNodes() {
    if (!this.model) {
      return [];
    }
    const nodes = this.graphNodes().filter((node) => this.isNodeShown(node.id));
    const labels = new Map(nodes.map((node) => [node.id, node.name]));
    const connections = new Map(nodes.map((node) => [node.id, []]));
    this.shownLinks.forEach((link) => {
      connections.get(link.source).push(labels.get(link.target));
      connections.get(link.target).push(labels.get(link.source));
    });
    return nodes.map((node) => {
      const connected = connections.get(node.id);
      const kind = node.isRetired
        ? `${KIND_LABELS[node.kind]}, retired`
        : KIND_LABELS[node.kind];
      const skill = node.kind === "skill" && this.model.skills.get(node.id);
      const evidence = skill
        ? evidenceSentence(skill, this.model.certifications)
        : "";
      const base = connected.length
        ? `${node.name}, ${kind}. Connected to ${connected.join(", ")}.`
        : `${node.name}, ${kind}. No connections.`;
      return {
        id: node.id,
        text: evidence ? `${base} ${evidence}` : base,
        connectionCount: connected.length
      };
    });
  }

  // The links whose two ends both show under the persona filter.
  get shownLinks() {
    if (!this.model) {
      return [];
    }
    return this.model.links.filter(
      (link) => this.isNodeShown(link.source) && this.isNodeShown(link.target)
    );
  }

  get summary() {
    const nodeCount = this.accessibleNodes.length;
    const linkCount = this.shownLinks.length;
    const nodeWord = nodeCount === 1 ? "item" : "items";
    const linkWord = linkCount === 1 ? "connection" : "connections";
    return `${nodeCount} ${nodeWord} and ${linkCount} ${linkWord}.`;
  }
}
