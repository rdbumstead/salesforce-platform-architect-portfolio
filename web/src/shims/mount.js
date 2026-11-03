/**
 * Puts one route on the page the way the Salesforce site does: the theme layout, the
 * route's components in its default slot in order, and the footer in its footer slot.
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

export function mount({ Layout, Footer, components }) {
  const root = document.getElementById("site-root");
  if (!root) return;
  const layout = createElement("c-portfolio-theme-layout", { is: Layout });
  components.forEach((entry) => layout.appendChild(placed(entry)));
  if (Footer) {
    const footer = createElement("c-footer", { is: Footer });
    footer.setAttribute("slot", "footer");
    layout.appendChild(footer);
  }
  root.replaceChildren(layout);
}
