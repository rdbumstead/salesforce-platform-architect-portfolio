/**
 * @description       : The Pillar B decision matrix. Reads the options,
 *                      criteria and scores once from DecisionMatrixController.getMatrix and
 *                      computes every weighted total in the browser, so moving a weight never
 *                      calls the server. Shows the ranking, the single weight change that would
 *                      first swap the top two options, and a reset to the starting weights.
 *                      The option that leads is tinted and tagged in words, and a total that
 *                      changes shows a brief highlight, which is skipped when the visitor
 *                      prefers reduced motion. Below 600 px each criterion becomes a card.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { LightningElement, wire } from "lwc";
import getMatrix from "@salesforce/apex/DecisionMatrixController.getMatrix";
import { trackEvent, EVENTS } from "c/analyticsService";
import { isReduced } from "c/motionPreference";
import { onShowMe, revealAnchor } from "c/tourShowMe";

export const MIN_WEIGHT = 0;
export const MAX_WEIGHT = 10;
export const PLACEHOLDER_BANNER =
  "Scores and weights are provisional placeholders pending the owner's review.";

const scoreKey = (optionName, criterionName) =>
  `${optionName}|${criterionName}`;

/**
 * Weighted total per option: the sum over criteria of weight times score.
 * @param {object} matrix The getMatrix payload.
 * @param {object} weights Criterion developer name to weight.
 * @returns {object} Option developer name to total.
 */
export function computeTotals(matrix, weights) {
  const scores = new Map();
  (matrix.scores || []).forEach((s) =>
    scores.set(scoreKey(s.optionName, s.criterionName), Number(s.score) || 0)
  );
  const totals = {};
  (matrix.options || []).forEach((o) => {
    totals[o.developerName] = (matrix.criteria || []).reduce(
      (sum, c) =>
        sum +
        (Number(weights[c.developerName]) || 0) *
          (scores.get(scoreKey(o.developerName, c.developerName)) || 0),
      0
    );
  });
  return totals;
}

/**
 * Options from the highest total down. Ties keep the options' sort order.
 * @param {object} matrix The getMatrix payload.
 * @param {object} totals From computeTotals.
 * @returns {Array} Options with a total.
 */
export function rankOptions(matrix, totals) {
  return (matrix.options || [])
    .map((o, index) => ({ ...o, index, total: totals[o.developerName] || 0 }))
    .sort((a, b) => b.total - a.total || a.index - b.index);
}

/**
 * The single criterion whose weight change, searched across 0 to 10, would first put the
 * runner-up strictly ahead of the leader. "First" means the smallest change from the
 * current weight, then the criterion order. Null when no single weight can swap them.
 * @param {object} matrix The getMatrix payload.
 * @param {object} weights Current weights.
 * @returns {object|null} { criterion, from, to, distance, leader, runnerUp }
 */
export function findFlip(matrix, weights) {
  const ranked = rankOptions(matrix, computeTotals(matrix, weights));
  if (ranked.length < 2) {
    return null;
  }
  const [leader, runnerUp] = ranked;
  let best = null;
  (matrix.criteria || []).forEach((c) => {
    const current = Number(weights[c.developerName]) || 0;
    for (let w = MIN_WEIGHT; w <= MAX_WEIGHT; w++) {
      if (w !== current) {
        const totals = computeTotals(matrix, {
          ...weights,
          [c.developerName]: w
        });
        const distance = Math.abs(w - current);
        if (
          totals[runnerUp.developerName] > totals[leader.developerName] &&
          (!best || distance < best.distance)
        ) {
          best = { criterion: c, from: current, to: w, distance };
        }
      }
    }
  });
  return best ? { ...best, leader, runnerUp } : null;
}

/**
 * The option that leads: the highest total, and only when it is strictly ahead of the next.
 * A tie at the top has no leader, so nothing is tinted for a draw.
 * @param {object} matrix The getMatrix payload.
 * @param {object} totals From computeTotals.
 * @returns {string|null} The leading option's developer name, or null.
 */
export function leaderKey(matrix, totals) {
  const ranked = rankOptions(matrix, totals);
  if (ranked.length < 2) {
    return ranked.length === 1 ? ranked[0].developerName : null;
  }
  return ranked[0].total > ranked[1].total ? ranked[0].developerName : null;
}

export default class DecisionMatrix extends LightningElement {
  matrix;
  error;
  weights = {};
  // Per option, how many times its total has changed. The odd or even count picks one of two
  // identical highlight classes, so the highlight starts again on each change.
  flashes = {};
  stopShowMe;

  // The tour's stop B names the first weight control.
  connectedCallback() {
    this.stopShowMe = onShowMe("B", () => revealAnchor(this.template));
  }

  disconnectedCallback() {
    if (this.stopShowMe) {
      this.stopShowMe();
      this.stopShowMe = undefined;
    }
  }

  @wire(getMatrix)
  wiredMatrix({ data, error }) {
    if (data) {
      this.matrix = data;
      this.error = undefined;
      this.weights = this.defaultWeights();
    } else if (error) {
      this.error = error;
      this.matrix = undefined;
    }
  }

  get isLoading() {
    return !this.matrix && !this.error;
  }

  get hasMatrix() {
    return Boolean(this.matrix);
  }

  get showPlaceholderBanner() {
    return Boolean(this.matrix && this.matrix.hasPlaceholders);
  }

  get bannerText() {
    return PLACEHOLDER_BANNER;
  }

  get leader() {
    return this.matrix ? leaderKey(this.matrix, this.totals) : null;
  }

  get columns() {
    const leader = this.leader;
    return (this.matrix?.options || []).map((o) => ({
      key: o.developerName,
      label: o.label,
      summary: o.summary,
      isLeading: o.developerName === leader,
      className:
        o.developerName === leader ? "option-head leading" : "option-head"
    }));
  }

  get totals() {
    return computeTotals(this.matrix || {}, this.weights);
  }

  get rows() {
    if (!this.matrix) {
      return [];
    }
    const byKey = new Map();
    (this.matrix.scores || []).forEach((s) =>
      byKey.set(scoreKey(s.optionName, s.criterionName), s)
    );
    return (this.matrix.criteria || []).map((c, index) => {
      const weight = Number(this.weights[c.developerName]) || 0;
      return {
        key: c.developerName,
        label: c.label,
        description: c.description,
        weight,
        sliderLabel: `Weight for ${c.label}`,
        tourAnchor: index === 0 ? "stop-b" : undefined,
        valueText: `${weight} of ${MAX_WEIGHT}`,
        cells: (this.matrix.options || []).map((o) => {
          const s = byKey.get(scoreKey(o.developerName, c.developerName));
          return {
            key: `${c.developerName}-${o.developerName}`,
            optionLabel: o.label,
            score: s ? s.score : "",
            scoreLabel: s
              ? `${o.label}, ${c.label}: ${s.score} of 5. Show why`
              : "",
            rationale: s ? s.rationale : "",
            evidence: s ? s.evidence : "",
            hasScore: Boolean(s)
          };
        })
      };
    });
  }

  get totalCells() {
    const totals = this.totals;
    return this.columns.map((col) => {
      const flashes = this.flashes[col.key] || 0;
      const classes = ["total-cell"];
      if (col.isLeading) {
        classes.push("leading");
      }
      if (flashes > 0) {
        classes.push(flashes % 2 ? "total-flash-a" : "total-flash-b");
      }
      return {
        key: col.key,
        optionLabel: col.label,
        total: totals[col.key] || 0,
        className: classes.join(" ")
      };
    });
  }

  get rankingText() {
    if (!this.matrix) {
      return "";
    }
    return rankOptions(this.matrix, this.totals)
      .map((o, i) => `${i + 1}. ${o.label}`)
      .join(", ");
  }

  get sensitivityText() {
    if (!this.matrix) {
      return "";
    }
    const flip = findFlip(this.matrix, this.weights);
    if (!flip) {
      return "No single weight change from 0 to 10 changes the top choice.";
    }
    return `Moving the weight of ${flip.criterion.label} from ${flip.from} to ${flip.to} would put ${flip.runnerUp.label} ahead of ${flip.leader.label}.`;
  }

  defaultWeights() {
    const weights = {};
    (this.matrix?.criteria || []).forEach((c) => {
      weights[c.developerName] = Number(c.defaultWeight) || 0;
    });
    return weights;
  }

  applyWeight(target) {
    const value = Math.min(
      MAX_WEIGHT,
      Math.max(MIN_WEIGHT, Number(target.value) || 0)
    );
    this.setWeights({ ...this.weights, [target.dataset.criterion]: value });
  }

  /** Sets the weights and marks each option whose total moved, for the brief highlight. */
  setWeights(next) {
    const before = this.totals;
    this.weights = next;
    if (isReduced()) {
      return;
    }
    const after = this.totals;
    const flashes = { ...this.flashes };
    Object.keys(after).forEach((key) => {
      if (after[key] !== before[key]) {
        flashes[key] = (flashes[key] || 0) + 1;
      }
    });
    this.flashes = flashes;
  }

  handleWeightInput(event) {
    this.applyWeight(event.target);
  }

  handleWeightChange(event) {
    this.applyWeight(event.target);
    trackEvent(EVENTS.MATRIX_WEIGHT_CHANGED, {
      criterion: event.target.dataset.criterion
    });
  }

  handleReset() {
    this.setWeights(this.defaultWeights());
    this.template.querySelectorAll("input.weight-slider").forEach((input) => {
      input.value = String(this.weights[input.dataset.criterion]);
    });
    trackEvent(EVENTS.MATRIX_RESET, {});
  }
}
