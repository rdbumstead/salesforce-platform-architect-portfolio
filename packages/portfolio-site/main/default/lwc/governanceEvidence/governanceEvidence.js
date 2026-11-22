/**
 * @description       : The evidence list on the Governance page (Pillar F). Reads
 *                      GovernanceController.getGovernanceEvidence and draws the running total of
 *                      governed deploys, then each governed deploy (date, commit linked to GitHub,
 *                      permit id, approver, each check with its outcome, tests and coverage, and
 *                      the run link), then the drill runs the gate denied with the check that
 *                      failed. A drill's id is a deny id, never a permit. A read that fails, a
 *                      total that cannot be read and a list with no rows are each said plainly,
 *                      and none of them draws a zero. A link is drawn only for a GitHub address,
 *                      a commit that looks like a commit and an approver that looks like a
 *                      GitHub login. The first run link is the tour's anchor for stop F. On the
 *                      static site the list is as of the last build, and the page says so.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/21/2026
 **/
import { LightningElement, wire } from "lwc";
import getGovernanceEvidence from "@salesforce/apex/GovernanceController.getGovernanceEvidence";
import { REPO_URL } from "c/footer";
import { IS_STATIC } from "c/siteHost";
import { onShowMe, revealAnchor } from "c/tourShowMe";
import { timeView, shortSha } from "c/smartChecklist";

/** The tour stop whose control is the first run link. */
export const TOUR_STOP = "F";

const GITHUB_HOST = "https://github.com/";
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;
const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

const OUTCOMES = {
  pass: { text: "Passed", className: "pill outcome outcome-pass" },
  fail: { text: "Failed", className: "pill outcome outcome-fail" },
  skipped: { text: "Skipped", className: "pill outcome outcome-skipped" },
  satisfied_by_approval: {
    text: "Approved",
    className: "pill outcome outcome-pass"
  },
  waived_by_config: {
    text: "Waived",
    className: "pill outcome outcome-skipped"
  }
};

const STATUSES = {
  Success: { text: "Success", className: "pill outcome outcome-pass" },
  Failure: { text: "Failure", className: "pill outcome outcome-fail" },
  Denied: { text: "Denied", className: "pill outcome outcome-fail" }
};

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * The whole number with thousands separators, or null for anything but a whole number.
 * @param {*} value the number
 * @returns {string|null} the text
 */
export function countText(value) {
  const whole = count(value);
  return whole === null ? null : whole.toLocaleString("en-US");
}

/**
 * The coverage as "86.4% coverage", or "Coverage not recorded" for anything but a number from
 * 0 to 100.
 * @param {*} value the coverage percent
 * @returns {string} the text
 */
export function coverageText(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Coverage not recorded";
  }
  if (value < 0 || value > 100) {
    return "Coverage not recorded";
  }
  return `${Math.round(value * 10) / 10}% coverage`;
}

/**
 * The tests as "122 run, 120 passed", or "Tests not recorded" when the run count is missing.
 * @param {*} run tests run
 * @param {*} passed tests passed
 * @returns {string} the text
 */
export function testsText(run, passed) {
  const ran = count(run);
  if (ran === null) {
    return "Tests not recorded";
  }
  const ok = count(passed);
  return ok === null ? `${ran} run` : `${ran} run, ${ok} passed`;
}

/**
 * A link to a run only when it is a GitHub address.
 * @param {*} value the run url
 * @returns {string|null} the address, or null
 */
export function safeRunUrl(value) {
  const url = text(value);
  return url.startsWith(GITHUB_HOST) && !/[\s"'<>]/.test(url) ? url : null;
}

/**
 * The commit's page on GitHub, or null when the value is not a commit hash.
 * @param {*} sha the commit
 * @returns {string|null} the address
 */
export function commitUrl(sha) {
  const value = text(sha);
  return COMMIT_PATTERN.test(value) ? `${REPO_URL}/commit/${value}` : null;
}

/**
 * The approver's GitHub page, or null when the value is not a GitHub login.
 * @param {*} login the approver
 * @returns {string|null} the address
 */
export function approverUrl(login) {
  const value = text(login);
  return LOGIN_PATTERN.test(value) ? `${GITHUB_HOST}${value}` : null;
}

/**
 * The checks of a run as rows, keeping only a rule with a known outcome.
 * @param {*} checks the list from the read
 * @returns {object[]} rows of { key, rule, outcome, text, className, failed }
 */
export function checkRows(checks) {
  if (!Array.isArray(checks)) {
    return [];
  }
  return checks
    .filter((check) => check && text(check.rule) && OUTCOMES[check.outcome])
    .map((check, index) => ({
      key: `check-${index + 1}`,
      rule: text(check.rule),
      outcome: check.outcome,
      text: OUTCOMES[check.outcome].text,
      className: OUTCOMES[check.outcome].className,
      failed: check.outcome === "fail"
    }));
}

/**
 * One run of the read as the view the template draws.
 * @param {object} run an item of the read
 * @param {number} index its place in the list
 * @returns {object} the view
 */
export function runView(run, index) {
  const time = timeView(run.completedAt);
  const checks = checkRows(run.checks);
  const sha = text(run.commitSha);
  const approver = text(run.approver);
  const id = text(run.permitId);
  const status = STATUSES[run.status] || {
    text: text(run.status) || "Unknown",
    className: "pill outcome outcome-skipped"
  };
  const url = safeRunUrl(run.runUrl);
  const short = shortSha(sha);
  const failed = checks.filter((check) => check.failed);
  return {
    key: text(run.runId) || `run-${index + 1}`,
    time: time ? time.text : "Date not recorded",
    timeTitle: time ? time.title : "",
    iso: time ? time.iso : "",
    hasTime: Boolean(time),
    statusText: status.text,
    statusClass: status.className,
    sha: short || "not recorded",
    shaTitle: sha,
    commitHref: commitUrl(sha),
    hasCommitLink: commitUrl(sha) !== null,
    id: id || "not recorded",
    approver: approver || "not recorded",
    approverHref: approverUrl(approver),
    hasApproverLink: approverUrl(approver) !== null,
    checks,
    hasChecks: checks.length > 0,
    failedRules: failed.map((check) => check.rule).join(", "),
    hasFailed: failed.length > 0,
    tests: testsText(run.testsRun, run.testsPassed),
    coverage: coverageText(run.coverage),
    runHref: url,
    hasRunLink: url !== null,
    runLabel: `Open the run for commit ${short || "unknown"} on GitHub`,
    tourAnchor: undefined
  };
}

export default class GovernanceEvidence extends LightningElement {
  evidence;
  hasError = false;
  stopShowMe;

  @wire(getGovernanceEvidence)
  wiredEvidence({ data, error }) {
    if (data) {
      this.evidence = data;
      this.hasError = false;
    } else if (error) {
      this.evidence = undefined;
      this.hasError = true;
    }
  }

  connectedCallback() {
    this.stopShowMe = onShowMe(TOUR_STOP, () => revealAnchor(this.template));
  }

  disconnectedCallback() {
    if (this.stopShowMe) {
      this.stopShowMe();
      this.stopShowMe = undefined;
    }
  }

  get isLoading() {
    return !this.evidence && !this.hasError;
  }

  get isStatic() {
    return IS_STATIC;
  }

  get runs() {
    return this.evidence && Array.isArray(this.evidence.runs)
      ? this.evidence.runs
      : [];
  }

  get totalText() {
    return this.evidence ? countText(this.evidence.governedTotal) : null;
  }

  get hasTotal() {
    return this.totalText !== null;
  }

  get deploys() {
    const views = this.runs
      .filter((run) => run && run.workflow === "deploy")
      .map((run, index) => runView(run, index));
    const first = views.find((view) => view.hasRunLink);
    if (first) {
      first.tourAnchor = "true";
    }
    return views;
  }

  get hasDeploys() {
    return this.deploys.length > 0;
  }

  get drills() {
    return this.runs
      .filter((run) => run && run.workflow === "drill")
      .map((run, index) => runView(run, index));
  }

  get hasDrills() {
    return this.drills.length > 0;
  }

  /** The tour has no run link to point at, so the empty note takes the focus. */
  get noDeployAnchorValue() {
    return this.deploys.some((view) => view.hasRunLink) ? undefined : "true";
  }
}
