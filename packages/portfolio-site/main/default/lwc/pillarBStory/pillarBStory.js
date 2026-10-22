/**
 * @description       : The Pillar B story (pillars-design 3.2, Round 5 contract M7): the client,
 *                      discovery with the lifecycle to object map, the lead into the decision
 *                      matrix, ROI and cost from public licence facts (D9 a), the solution
 *                      design with the redrawn architecture, the video prototype and the
 *                      outcome. The copy lives in the template. Lines the owner must decide
 *                      (D3 framing, D8 video) are marked PLACEHOLDER. The decision matrix itself
 *                      is the sibling component c:decisionMatrix, placed after this one.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { LightningElement } from "lwc";
import NL_ASSETS from "@salesforce/resourceUrl/NL_Assets";
import { trackEvent, EVENTS } from "c/analyticsService";

/** The video prototype link. Null until the owner answers D8, so the page shows the placeholder. */
export const VIDEO_URL = null;

export default class PillarBStory extends LightningElement {
  videoUrl = VIDEO_URL;

  get architectureImageUrl() {
    return `${NL_ASSETS}/minimalist-architecture.svg`;
  }

  get hasVideo() {
    return Boolean(this.videoUrl);
  }

  handleVideoOpen() {
    trackEvent(EVENTS.PILLAR_VIDEO_OPENED, {});
  }
}
