/**
 * Recorded mode for the two forms. When the contact or testimonial switch reads `recorded`,
 * the form is replaced with a plain note and the owner's public profile links, so nobody
 * fills in a form that cannot send.
 */

export const FORMS = [
  {
    tag: "c-contact-form",
    feature: "contact",
    heading: "Get in touch",
    text: "The contact form is switched off on this copy of the site. Reach Ryan on one of these instead."
  },
  {
    tag: "c-testimonial-submit",
    feature: "testimonial",
    heading: "Leave a testimonial",
    text: "The testimonial form is switched off on this copy of the site. Send your words to Ryan on one of these and he will add them."
  }
];

/** Public profile links used when the page has no profile read. */
export const FALLBACK_LINKS = [
  { label: "GitHub", url: "https://github.com/rdbumstead" },
  {
    label: "Trailhead",
    url: "https://www.salesforce.com/trailblazer/rbumstead"
  }
];

function safeHref(url) {
  return /^https:\/\//i.test(String(url || "")) ? url : null;
}

export function recordedNote(doc, form, links) {
  const section = doc.createElement("section");
  section.className = "recorded-note";
  section.setAttribute("data-recorded", form.feature);
  section.style.cssText = "max-width:42rem;margin:2rem auto;padding:0 1rem;";
  const heading = doc.createElement("h2");
  heading.textContent = form.heading;
  const text = doc.createElement("p");
  text.textContent = form.text;
  const list = doc.createElement("ul");
  links.forEach((link) => {
    const href = safeHref(link.url);
    if (!href) return;
    const item = doc.createElement("li");
    const anchor = doc.createElement("a");
    anchor.href = href;
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label;
    item.appendChild(anchor);
    list.appendChild(item);
  });
  section.append(heading, text, list);
  return section;
}

/** @returns {number} how many forms were replaced */
export function swapRecordedForms(root, features, links, doc = document) {
  const usable = links && links.length ? links : FALLBACK_LINKS;
  let replaced = 0;
  FORMS.forEach((form) => {
    if (features[form.feature] === "live") return;
    root.querySelectorAll(form.tag).forEach((element) => {
      element.replaceWith(recordedNote(doc, form, usable));
      replaced += 1;
    });
  });
  return replaced;
}
