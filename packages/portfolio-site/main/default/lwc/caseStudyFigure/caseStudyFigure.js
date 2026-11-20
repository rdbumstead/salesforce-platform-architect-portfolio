/**
 * @description       : The picture on a featured case study card. One inline SVG per key,
 *                      each a drawing of the work and not decoration: the literacy nonprofit's
 *                      decision matrix, the Employer Hub's eight step inquiry flow, the site's
 *                      path from org records to a static page, and the GlassOps deploy chain
 *                      with its signed permit between the gate and the deploy. The key comes
 *                      from Project__c.Card_Figure__c through the card. Any other key, or none,
 *                      renders nothing and takes no space.
 *                      The figure map below also decides which work is private, so a card never
 *                      has to. Client work carries the text tag "Client work, private" inside
 *                      the picture. The pictures are schematic. They hold no client name, no
 *                      logo and no record data, and the matrix cells show structure, not scores.
 *                      The host fills its parent, which sets the 4 to 3 shape. Colours come from
 *                      the site's tokens, so the picture follows light and dark.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/20/2026
 **/
import { LightningElement, api } from "lwc";

const PRIVATE_TAG = "Client work, private";

export const FIGURES = {
  "literacy-platform": {
    label:
      "Decision matrix for a literacy nonprofit: three platform options scored against ten weighted criteria, with the Nonprofit Success Pack and Program Management option chosen. Client work, private.",
    tag: PRIVATE_TAG
  },
  "employer-hub": {
    label:
      "Employer inquiry flow in eight numbered steps: form, match, case, route, review, convert, contract and report. Client work, private.",
    tag: PRIVATE_TAG
  },
  "site-org": {
    label:
      "This site's path from records in the org, through an export read and a static build, to the live page.",
    tag: ""
  },
  glassops: {
    label:
      "GlassOps deploy chain: plan, validate and gate, then a signed permit, then deploy and verify.",
    tag: ""
  }
};

export default class CaseStudyFigure extends LightningElement {
  @api figureKey;

  get figure() {
    const key = typeof this.figureKey === "string" ? this.figureKey.trim() : "";
    return Object.prototype.hasOwnProperty.call(FIGURES, key)
      ? { key, ...FIGURES[key] }
      : null;
  }

  get isLiteracy() {
    return this.figure?.key === "literacy-platform";
  }

  get isEmployerHub() {
    return this.figure?.key === "employer-hub";
  }

  get isSiteOrg() {
    return this.figure?.key === "site-org";
  }

  get isGlassops() {
    return this.figure?.key === "glassops";
  }

  get label() {
    return this.figure ? this.figure.label : "";
  }

  get tag() {
    return this.figure ? this.figure.tag : "";
  }

  renderedCallback() {
    this.classList.toggle("is-empty", !this.figure);
  }
}
