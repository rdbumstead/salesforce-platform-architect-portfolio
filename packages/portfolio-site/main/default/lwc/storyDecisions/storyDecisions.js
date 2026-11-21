/**
 * @description       : The sections every story page ends with: "Alternatives considered" and
 *                      "Related decisions", after an "Outcome" section for a story whose page has
 *                      no outcome of its own (the employer hub, whose decision is with the client). The view names the story with story-key, one of
 *                      business-architecture, nonprofit-solutions, delivery, glassops or governance, and the
 *                      text comes from the storyData module in this folder. Alternatives are a one
 *                      line option and a short reason. Related decisions are links to decision
 *                      records in docs/adr. A record the docs viewer lists opens in the viewer at
 *                      /docs?doc=adr-NNN, and any other opens its file on GitHub in a new tab. An
 *                      unknown or blank key draws nothing and takes no space.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/20/2026
 **/
import { LightningElement, api } from "lwc";
import basePath from "@salesforce/community/basePath";
import { REPO_URL } from "c/footer";
import { STORIES } from "./storyData";

/**
 * Where one related decision opens: the docs viewer when it lists the record, the file on GitHub
 * when it does not.
 * @param {object} entry a related entry from storyData
 * @returns {string} the address
 */
function hrefFor(entry) {
  if (entry.onDocs) {
    return `${basePath || ""}/docs?doc=adr-${entry.adr}`;
  }
  return `${REPO_URL}/blob/main/docs/adr/${entry.file}`;
}

export default class StoryDecisions extends LightningElement {
  @api storyKey;

  get story() {
    const key = typeof this.storyKey === "string" ? this.storyKey.trim() : "";
    return Object.prototype.hasOwnProperty.call(STORIES, key)
      ? STORIES[key]
      : null;
  }

  get outcome() {
    const value = this.story ? this.story.outcome : null;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  get hasOutcome() {
    return this.outcome !== null;
  }

  get alternatives() {
    return this.story
      ? this.story.alternatives.map((item, index) => ({
          ...item,
          key: `alternative-${index + 1}`
        }))
      : [];
  }

  get hasAlternatives() {
    return this.alternatives.length > 0;
  }

  get related() {
    return this.story
      ? this.story.related.map((entry) => ({
          ...entry,
          key: `adr-${entry.adr}`,
          href: hrefFor(entry),
          external: !entry.onDocs,
          target: entry.onDocs ? null : "_blank",
          rel: entry.onDocs ? null : "noopener noreferrer"
        }))
      : [];
  }

  get hasRelated() {
    return this.related.length > 0;
  }
}
