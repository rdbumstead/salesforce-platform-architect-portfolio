/**
 * @description       : The testimonial wall on /testimonials (ADR-012). Shows the
 *                      approved testimonials from TestimonialController.getApprovedTestimonials,
 *                      each in its own tone. A "Professional / All" filter uses the API feed's
 *                      rule, worked out on the server: the Professional vibe from a Manager,
 *                      Client or Peer. With no approved testimonial, once the read has
 *                      answered, it says plainly that there are no reviews yet, above the form
 *                      that follows it on the page. Until the read answers it renders
 *                      nothing, so the line never flashes. Switching the filter sends
 *                      testimonials_filtered with the new filter, all or professional.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/23/2026
 **/
import { LightningElement, wire } from "lwc";
import getApprovedTestimonials from "@salesforce/apex/TestimonialController.getApprovedTestimonials";
import { trackEvent, EVENTS } from "c/analyticsService";

export const FILTER_ALL = "all";
export const FILTER_PROFESSIONAL = "professional";

const RELATIONSHIP_LABELS = {
  Manager: "Manager",
  Peer: "Peer",
  Client: "Client",
  Recruiter: "Recruiter",
  Fan: "Fan or visitor"
};

export default class TestimonialWall extends LightningElement {
  items = [];
  loaded = false;
  filter = FILTER_ALL;

  connectedCallback() {
    this.markEmpty();
  }

  @wire(getApprovedTestimonials)
  wiredTestimonials({ data, error }) {
    if (data) {
      this.items = data;
      this.loaded = true;
    } else if (error) {
      this.items = [];
      this.loaded = true;
    }
    this.markEmpty();
  }

  /**
   * Hides the host while there is nothing to show, so it takes no gap on the page. The class
   * goes on the host itself, where the page puts the space under each section.
   */
  markEmpty() {
    this.classList.toggle("is-empty", !this.hasItems && !this.loaded);
  }

  get showEmptyNotice() {
    return this.loaded && !this.hasItems;
  }

  get hasItems() {
    return this.items.length > 0;
  }

  get visibleItems() {
    const shown =
      this.filter === FILTER_PROFESSIONAL
        ? this.items.filter((item) => item.professional)
        : this.items;
    return shown.map((item) => {
      const casual = item.vibe === "Casual";
      const byline = [
        item.authorTitle,
        RELATIONSHIP_LABELS[item.relationship] || null
      ].filter(Boolean);
      return {
        ...item,
        cardClass: casual ? "card card-casual" : "card card-professional",
        toneLabel: casual ? "Casual" : "Professional",
        byline: byline.join(", ")
      };
    });
  }

  get hasVisible() {
    return this.visibleItems.length > 0;
  }

  get countText() {
    const count = this.visibleItems.length;
    const noun = count === 1 ? "testimonial" : "testimonials";
    return this.filter === FILTER_PROFESSIONAL
      ? `Showing ${count} professional ${noun}.`
      : `Showing all ${count} ${noun}.`;
  }

  get allPressed() {
    return this.filter === FILTER_ALL ? "true" : "false";
  }

  get professionalPressed() {
    return this.filter === FILTER_PROFESSIONAL ? "true" : "false";
  }

  handleFilter(event) {
    const next = event.currentTarget.dataset.filter;
    if (next === this.filter) {
      return;
    }
    this.filter = next;
    trackEvent(EVENTS.TESTIMONIALS_FILTERED, { filter: next });
  }
}
