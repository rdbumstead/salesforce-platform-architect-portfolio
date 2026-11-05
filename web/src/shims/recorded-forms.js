/**
 * Recorded mode for the two forms. When the contact or testimonial switch reads `recorded`,
 * the real form stays on the page with every control off and a short note above the send
 * button. The component draws all of it, so the layout is the live one. This file only turns
 * the form off and hands it the profile links.
 */

export const FORMS = [
  { tag: "c-contact-form", feature: "contact" },
  { tag: "c-testimonial-submit", feature: "testimonial" }
];

/** Public profile links used when the page has no profile read. */
export const FALLBACK_LINKS = [
  { label: "GitHub", url: "https://github.com/rdbumstead" },
  {
    label: "Trailhead",
    url: "https://www.salesforce.com/trailblazer/rbumstead"
  }
];

/** The links a person can reach Ryan on. The portfolio and contact page links are left out. */
const NOTE_LABELS = ["LinkedIn", "GitHub", "Trailhead"];

function safeHref(url) {
  return /^https:\/\//i.test(String(url || "")) ? url : null;
}

export function noteLinks(links) {
  const kept = (links || []).filter(
    (link) => NOTE_LABELS.includes(link.label) && safeHref(link.url)
  );
  return kept.length ? kept : FALLBACK_LINKS;
}

/** @returns {number} how many forms were paused */
export function swapRecordedForms(root, features, links) {
  const usable = noteLinks(links);
  let paused = 0;
  FORMS.forEach((form) => {
    if (features[form.feature] === "live") return;
    root.querySelectorAll(form.tag).forEach((element) => {
      element.pausedLinks = usable.map((link) => ({ ...link }));
      element.paused = true;
      paused += 1;
    });
  });
  return paused;
}
