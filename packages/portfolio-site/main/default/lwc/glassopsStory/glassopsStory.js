/**
 * @description       : The GlassOps story page: why I built a release pipeline of my own, the
 *                      calls I made and what has happened since, in the Context, Decision and
 *                      Outcome format of the other story pages. The copy lives in the template
 *                      and is the owner's to edit before release. It names no client, no employer,
 *                      no org and no deploy, and the only links are the GlassOps repository and
 *                      its docs site. Alternatives considered and Related decisions are drawn
 *                      below it by c/storyDecisions.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/20/2026
 **/
import { LightningElement } from "lwc";

export const REPO_URL = "https://github.com/glassops-platform/glassops";
export const DOCS_URL = "https://glassops-platform.github.io/glassops/";

export default class GlassopsStory extends LightningElement {
  get repoUrl() {
    return REPO_URL;
  }

  get docsUrl() {
    return DOCS_URL;
  }
}
