/**
 * @description       : The Pillar B story: the client,
 *                      discovery with the lifecycle to object map, the lead into the decision
 *                      matrix, ROI and cost from public licence facts, the solution
 *                      design with the redrawn architecture, and the outcome. The copy lives in
 *                      the template. The work is framed as pre-sales, and there is no video
 *                      prototype. The decision
 *                      matrix itself is the sibling component c:decisionMatrix, placed after
 *                      this one.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { LightningElement } from "lwc";
import NL_ASSETS from "@salesforce/resourceUrl/NL_Assets";

export default class PillarBStory extends LightningElement {
  get architectureImageUrl() {
    return `${NL_ASSETS}/minimalist-architecture.svg`;
  }
}
