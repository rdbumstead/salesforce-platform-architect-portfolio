/**
 * The boxes the Salesforce site's section component draws around a view's components: a
 * section with the page gutter, a row that caps the content width, a column, and the column
 * body that holds the components. The class names are the live site's, and layout.mjs in
 * the build writes the CSS for them.
 */

/** A div with a class, made in the given document. */
export function box(className, doc = document) {
  const element = doc.createElement("div");
  element.className = className;
  return element;
}

/**
 * One box per section the route's view defines. Each column body is kept by section index
 * and column key, so a component can be put where its view put it.
 *
 * @param {{columns: {key: string, size: number}[]}[]} sections from the route
 * @returns {{nodes: Element[], bodies: Map<string, Element>}}
 */
export function buildSections(sections, doc = document) {
  const nodes = [];
  const bodies = new Map();
  (sections || []).forEach((section, index) => {
    const outer = box("comm-section-container", doc);
    const row = box("columns-content", doc);
    outer.appendChild(row);
    section.columns.forEach((column) => {
      const holder = box("comm-column", doc);
      holder.style.flex = `0 0 ${(column.size / 12) * 100}%`;
      const body = box("column-content", doc);
      holder.appendChild(body);
      row.appendChild(holder);
      bodies.set(`${index}:${column.key}`, body);
    });
    nodes.push(outer);
  });
  return { nodes, bodies };
}

/**
 * The components that are last in their column. The live site gives every component a gap
 * underneath except the last one in a column, so the section's own padding is all that
 * follows it.
 *
 * @param {{section: number|null, column: string}[]} components in page order
 * @returns {Set<object>}
 */
export function lastInColumn(components) {
  const last = new Map();
  components.forEach((entry) => {
    if (entry.section === null || entry.section === undefined) return;
    last.set(`${entry.section}:${entry.column}`, entry);
  });
  return new Set(last.values());
}
