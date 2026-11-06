/**
 * Puts one route on the page the way the Salesforce site does: the theme layout, the
 * route's components in its default slot in order, and the footer in its footer slot.
 * The components sit in the same boxes the site's section component builds (a section, its
 * columns and a column body), so the page gutter, the width cap and the gap under each
 * component come out the same.
 *
 * The components the entry already holds go on the page at once. The rest, and the
 * footer, arrive as their own chunks and are added together in their order, so the top of
 * the page paints without waiting for them and nothing already on screen moves twice.
 *
 * Once everything is placed, a form whose switch reads recorded gives way to a note with
 * the owner's profile links.
 */
import { createElement } from "lwc";
import { unlessLeaving } from "./leaving.js";
import { headerLinks } from "c/profileLinks";
import { installApi } from "./api-install.js";
import { lookup } from "./site-data.js";
import { swapRecordedForms } from "./recorded-forms.js";
import { box, buildSections, lastInColumn } from "./sections.js";

const SPACER = "component-wrapper-spacer";

function placed(entry) {
  if (entry.html !== undefined) {
    const wrapper = document.createElement("div");
    wrapper.className = "rich-text";
    // Rich text comes from the route's own view file in this repo, never from a visitor.
    wrapper.innerHTML = entry.html;
    return wrapper;
  }
  const element = createElement(entry.tag, { is: entry.ctor });
  Object.keys(entry.props || {}).forEach((name) => {
    element[name] = entry.props[name];
  });
  return element;
}

/** Resolves after the browser has painted the frame that holds what is already mounted. */
function afterPaint() {
  return new Promise((done) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(done, 0);
      return;
    }
    requestAnimationFrame(() => setTimeout(done, 0));
  });
}

function resolve(entry) {
  return entry.load
    ? entry.load().then((module) => ({ ...entry, ctor: module.default }))
    : Promise.resolve(entry);
}

const FORM_TAGS = ["c-contact-form", "c-testimonial-submit"];

function recordedForms(api, layout) {
  return api.features().then((features) => {
    const present = FORM_TAGS.some((tag) => layout.querySelector(tag));
    const allLive =
      features.contact === "live" && features.testimonial === "live";
    if (!present || allLive) return undefined;
    return lookup("ResumeController.getHeader", {}).then(({ found, value }) => {
      swapRecordedForms(layout, features, found ? headerLinks(value) : []);
    });
  });
}

export function mount({
  Layout,
  loadFooter,
  components,
  sections,
  trailingSpacer
}) {
  const root = document.getElementById("site-root");
  if (!root) return Promise.resolve();
  const api = installApi();
  const layout = createElement("c-portfolio-theme-layout", { is: Layout });
  const built = buildSections(sections);
  built.nodes.forEach((node) => layout.appendChild(node));
  // The live site keeps one empty wrapper after the content for its hidden region.
  if (trailingSpacer) layout.appendChild(box(SPACER));
  const lastOnes = lastInColumn(components);
  const put = (entry) => {
    const body = built.bodies.get(`${entry.section}:${entry.column}`);
    const element = placed(entry);
    if (!lastOnes.has(entry)) element.classList.add(SPACER);
    (body || layout).appendChild(element);
  };
  const firstLazy = components.findIndex((entry) => entry.load);
  const now = firstLazy === -1 ? components : components.slice(0, firstLazy);
  const later = firstLazy === -1 ? [] : components.slice(firstLazy);
  now.forEach(put);
  root.replaceChildren(layout);
  // The rest starts loading only once the top of the page has painted, so the first paint
  // never shares the network or the main thread with the heavier components.
  return afterPaint()
    .then(() =>
      Promise.all([
        Promise.all(later.map(resolve)),
        loadFooter
          ? loadFooter().then((module) => ({
              tag: "c-footer",
              ctor: module.default
            }))
          : Promise.resolve(null)
      ])
    )
    .then(([rest, footerEntry]) => {
      rest.forEach(put);
      if (footerEntry) {
        const element = placed(footerEntry);
        element.setAttribute("slot", "footer");
        layout.appendChild(element);
      }
      return recordedForms(api, layout);
    })
    .catch(unlessLeaving);
}
