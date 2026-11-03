/**
 * Puts one route on the page the way the Salesforce site does: the theme layout, the
 * route's components in its default slot in order, and the footer in its footer slot.
 *
 * The components the entry already holds go on the page at once. The rest, and the
 * footer, arrive as their own chunks and are added together in their order, so the top of
 * the page paints without waiting for them and nothing already on screen moves twice.
 */
import { createElement } from "lwc";

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

export function mount({ Layout, loadFooter, components }) {
  const root = document.getElementById("site-root");
  if (!root) return Promise.resolve();
  const layout = createElement("c-portfolio-theme-layout", { is: Layout });
  const firstLazy = components.findIndex((entry) => entry.load);
  const now = firstLazy === -1 ? components : components.slice(0, firstLazy);
  const later = firstLazy === -1 ? [] : components.slice(firstLazy);
  now.forEach((entry) => layout.appendChild(placed(entry)));
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
      rest.forEach((entry) => layout.appendChild(placed(entry)));
      if (footerEntry) {
        const element = placed(footerEntry);
        element.setAttribute("slot", "footer");
        layout.appendChild(element);
      }
    });
}
