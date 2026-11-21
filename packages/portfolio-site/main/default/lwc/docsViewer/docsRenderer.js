/**
 * @description       : Turns a markdown document into DOM nodes for c/docsViewer, safely by
 *                      construction. The markdown is split into tokens by the lexer of the
 *                      vendored Marked_Library, and every element is then made here with
 *                      createElement from a fixed list of tags, with text set through text
 *                      nodes. No HTML string from a document is ever parsed, so raw HTML,
 *                      script and event attributes cannot reach the page: an HTML block shows
 *                      only its text and an inline tag is dropped. A link keeps its target only
 *                      when it is https, a path on this site's docs page or a heading of the
 *                      same document. A relative link is resolved against the document's
 *                      GitHub page, and one that names another listed document points at that
 *                      document on this site. Headings get ids by the docs slug rule (lower
 *                      case, letters, digits and hyphens), and the slugs GitHub would give
 *                      them are kept as aliases so the documents' own links still land.
 *                      A Mermaid block is drawn ahead of time into two SVG files, one per theme,
 *                      named by a hash of its source (see diagramHash). When the context lists
 *                      a drawing for the block, the block shows both as images, with a text
 *                      alternative, and the source stays in a closed details element under
 *                      them. A block with no listed drawing shows its source in that element,
 *                      with a link to the document on GitHub, which draws the diagram. No
 *                      diagram library is loaded. A document's own "Table of Contents" list is left out,
 *                      because the page draws one contents box from the headings.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/

import { diagramHash } from "./diagramHash";

const ENTITIES = Object.freeze({
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " "
});
const ENTITY_PATTERN = /&(amp|lt|gt|quot|#39|#x27|nbsp);/g;
const TAG_PATTERN = /<[^>]*>/g;
const BREAK_TAG = /^<br\s*\/?>$/i;
const MERMAID = "mermaid";
const DEFAULT_ALT = "A diagram. Its Mermaid source follows the picture.";
const OWN_CONTENTS = /^table of contents$/i;
const STACK_COLUMNS = 4;
const FRONT_LINE = /^(Project|Version|Owner|Date|Status):\s*(.+)$/;
const FRONT_ORDER = ["Project", "Version", "Owner", "Date", "Status"];

/**
 * Keeps each " · " separator with the word after it, with a no break space, so a wrapped line
 * never ends on a dot that has lost its neighbour.
 */
export function glueDots(text) {
  return String(text).replace(/ \u00B7 /g, " \u00B7\u00A0");
}

/** Decodes the few entities markdown text carries, for display as text. */
export function decodeEntities(text) {
  return String(text ?? "").replace(ENTITY_PATTERN, (m) => ENTITIES[m] ?? m);
}

/**
 * The docs slug rule: lower case, every run of characters other than a to z and 0 to 9
 * becomes one hyphen, no hyphen at either end. "6.2 Site Components" gives
 * "6-2-site-components".
 * @param {string} text heading text
 * @returns {string} the slug, "section" when nothing is left
 */
export function slugify(text) {
  const slug = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/**
 * The slug GitHub gives a heading: lower case, punctuation removed, each space a hyphen.
 * "1.1 Architectural "North Star"" gives "11-architectural-north-star".
 * @param {string} text heading text
 * @returns {string} the GitHub slug
 */
export function githubSlug(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, "")
    .replace(/ /g, "-");
}

/** The plain text of inline tokens, as a reader sees it. */
export function plainText(tokens) {
  let out = "";
  for (const token of tokens || []) {
    if (token.tokens && token.type !== "codespan") {
      out += plainText(token.tokens);
    } else if (token.type === "html") {
      out += "";
    } else if (token.type === "image") {
      out += token.text || "";
    } else {
      out += decodeEntities(token.text ?? token.raw ?? "");
    }
  }
  return out;
}

/**
 * Leaves out a document's own contents: a paragraph that says only "Table of Contents",
 * together with the list that follows it. The reader's own contents box lists the same
 * headings, so two boxes with the same links are never shown. A paragraph with that text and
 * no list after it is kept.
 * @param {Array} tokens the lexer's block tokens
 * @returns {Array} the tokens without that paragraph and its list
 */
export function dropOwnContents(tokens) {
  const list = tokens || [];
  const at = list.findIndex(
    (t) =>
      t.type === "paragraph" && OWN_CONTENTS.test(plainText(t.tokens).trim())
  );
  if (at < 0) {
    return list;
  }
  let next = at + 1;
  while (next < list.length && list[next].type === "space") {
    next++;
  }
  if (!list[next] || list[next].type !== "list") {
    return list;
  }
  return [...list.slice(0, at), ...list.slice(next + 1)];
}

const ALERT_TYPES = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution"
};

/**
 * Reads a GitHub alert marker from the start of a blockquote's first line.
 * The marker must stand alone on that line. Returns the type and the quote's
 * tokens without the marker, or null when the quote is an ordinary one.
 * @returns {{ type: string, tokens: Array }|null}
 */
export function alertFrom(tokens) {
  const first = (tokens || [])[0];
  if (!first || first.type !== "paragraph") {
    return null;
  }
  const inline = first.tokens || [];
  const lead = inline[0];
  if (!lead || lead.type !== "text") {
    return null;
  }
  const match = /^\[!([A-Za-z]+)\][ \t]*(\r?\n|$)/.exec(lead.text);
  const type = match ? match[1].toLowerCase() : "";
  if (!ALERT_TYPES[type]) {
    return null;
  }
  const remainder = { ...lead, text: lead.text.slice(match[0].length) };
  let rest = [remainder, ...inline.slice(1)];
  if (!remainder.text) {
    rest = inline.slice(1);
    if (rest[0] && rest[0].type === "br") {
      rest = rest.slice(1);
    }
  }
  const body = rest.length ? [{ ...first, tokens: rest }] : [];
  return { type, tokens: [...body, ...tokens.slice(1)] };
}

/**
 * Reads the Project, Version, Owner and Date or Status lines a document opens with. They are
 * plain paragraphs, in a different order in each document, so they are taken out of the body
 * and drawn as one line. Anything before them other than a rule or a blank is left alone, and
 * fewer than two such lines is not front matter.
 * @param {Array} tokens the lexer's block tokens after the title
 * @returns {{ entries: Array<{label:string,value:string}>, rest: Array }}
 */
export function takeFrontMatter(tokens) {
  const list = tokens || [];
  const entries = [];
  let at = 0;
  let consumed = 0;
  while (at < list.length) {
    const token = list[at];
    if (token.type === "space" || token.type === "hr") {
      at++;
      if (!entries.length) {
        consumed = at;
      }
      continue;
    }
    if (token.type !== "paragraph") {
      break;
    }
    const lines = plainText(token.tokens)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const found = lines.map((line) => FRONT_LINE.exec(line));
    if (!lines.length || found.some((m) => !m)) {
      break;
    }
    found.forEach((m) => entries.push({ label: m[1], value: m[2].trim() }));
    at++;
    consumed = at;
  }
  if (entries.length < 2) {
    return { entries: [], rest: list };
  }
  entries.sort(
    (a, b) => FRONT_ORDER.indexOf(a.label) - FRONT_ORDER.indexOf(b.label)
  );
  return { entries, rest: list.slice(consumed) };
}

/** Visits every block token in document order, including those inside lists and quotes. */
function eachBlock(tokens, visit) {
  for (const token of tokens || []) {
    visit(token);
    if (token.type === "list") {
      for (const item of token.items || []) {
        eachBlock(item.tokens, visit);
      }
    } else if (token.type === "blockquote") {
      eachBlock(token.tokens, visit);
    }
  }
}

/**
 * Gives every heading a unique id and records the GitHub slug of each as an alias.
 * @returns {{ headings: Array<{depth:number,text:string,id:string}>, aliases: Map<string,string> }}
 */
export function indexHeadings(tokens) {
  const used = new Map();
  const headings = [];
  const aliases = new Map();
  const githubUsed = new Map();
  eachBlock(tokens, (token) => {
    if (token.type !== "heading") {
      return;
    }
    const text = plainText(token.tokens).trim();
    const base = slugify(text);
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    const id = count ? `${base}-${count + 1}` : base;
    const ghBase = githubSlug(text);
    const ghCount = githubUsed.get(ghBase) || 0;
    githubUsed.set(ghBase, ghCount + 1);
    const ghId = ghCount ? `${ghBase}-${ghCount}` : ghBase;
    if (ghId && !aliases.has(ghId)) {
      aliases.set(ghId, id);
    }
    token._docId = id;
    headings.push({ depth: token.depth, text, id });
  });
  return { headings, aliases };
}

/**
 * Decides where a link may go. Returns null when it may go nowhere, so the caller shows
 * the link's text alone.
 * @param {string} href the markdown link target
 * @param {object} ctx { baseUrl, docHrefForPath(path, hash), hashTarget(hash) }
 * @returns {{ href: string, kind: "hash"|"doc"|"external", target?: string } | null}
 */
export function resolveHref(href, ctx) {
  const raw = String(href ?? "").trim();
  if (!raw || hasSpaceOrControl(raw)) {
    return null;
  }
  if (raw.startsWith("#")) {
    const target = ctx.hashTarget(decodeURIComponent(raw.slice(1)));
    return target ? { href: `#${target}`, kind: "hash", target } : null;
  }
  let url;
  try {
    // A scheme-less target is relative to the document's page on GitHub.
    url = new URL(raw, ctx.baseUrl || undefined);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") {
    return null;
  }
  const blob = /^\/[^/]+\/[^/]+\/blob\/[^/]+\/(.+)$/.exec(url.pathname);
  if (url.hostname === "github.com" && blob && ctx.docHrefForPath) {
    const hash = url.hash ? decodeURIComponent(url.hash.slice(1)) : "";
    const onSite = ctx.docHrefForPath(decodeURIComponent(blob[1]), hash);
    if (onSite) {
      return { href: onSite, kind: "doc" };
    }
  }
  return { href: url.href, kind: "external" };
}

/** True when text holds whitespace or a control character, which no safe link target has. */
function hasSpaceOrControl(text) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 32 || code === 127) {
      return true;
    }
  }
  return false;
}

/** The GitHub page of the document, only when it is an https address. */
function diagramLink(baseUrl) {
  try {
    const url = new URL(String(baseUrl || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

/** Builds DOM from tokens with a fixed set of tags. */
class Builder {
  constructor(doc, ctx, aliases) {
    this.doc = doc;
    this.ctx = ctx;
    this.aliases = aliases;
    this.tableCount = 0;
    this.codeCount = 0;
  }

  el(tag, className) {
    const node = this.doc.createElement(tag);
    if (className) {
      node.className = className;
    }
    return node;
  }

  text(value) {
    return this.doc.createTextNode(value);
  }

  blocks(parent, tokens) {
    for (const token of tokens || []) {
      const node = this.block(token);
      if (node) {
        parent.appendChild(node);
      }
    }
  }

  block(token) {
    switch (token.type) {
      case "heading":
        return this.heading(token);
      case "paragraph": {
        const p = this.el("p");
        this.inline(p, token.tokens);
        return p;
      }
      case "text": {
        const span = this.el("p", "doc-text");
        this.inline(span, token.tokens || [{ type: "text", text: token.text }]);
        return span;
      }
      case "code":
        return this.code(token);
      case "blockquote": {
        const alert = alertFrom(token.tokens);
        if (alert) {
          return this.alert(alert);
        }
        const quote = this.el("blockquote");
        this.blocks(quote, token.tokens);
        return quote;
      }
      case "list":
        return this.list(token);
      case "table":
        return this.table(token);
      case "hr":
        return this.el("hr");
      case "html":
        return this.htmlBlock(token);
      default:
        return null;
    }
  }

  /** The Project, Version, Owner and Date or Status lines, as one line of label and value pairs. */
  frontLine(entries) {
    const line = this.el("p", "doc-front");
    for (const entry of entries) {
      const item = this.el("span", "doc-front-item");
      const label = this.el("span", "doc-front-label");
      label.appendChild(this.text(entry.label));
      item.appendChild(label);
      item.appendChild(this.text(` ${entry.value}`));
      line.appendChild(item);
    }
    return line;
  }

  alert(alert) {
    const title = ALERT_TYPES[alert.type];
    const box = this.el("div", `doc-alert doc-alert-${alert.type}`);
    box.setAttribute("role", "note");
    box.setAttribute("aria-label", title);
    const label = this.el("p", "doc-alert-title");
    label.appendChild(this.text(title));
    box.appendChild(label);
    this.blocks(box, alert.tokens);
    return box;
  }

  heading(token) {
    const level = Math.min(6, Math.max(2, token.depth));
    const heading = this.el(`h${level}`, "doc-heading");
    heading.id = token._docId;
    heading.setAttribute("tabindex", "-1");
    this.inline(heading, token.tokens);
    const anchor = this.el("a", "heading-anchor");
    anchor.setAttribute("href", `#${token._docId}`);
    anchor.dataset.hash = token._docId;
    anchor.setAttribute(
      "aria-label",
      `Link to this section: ${plainText(token.tokens).trim()}`
    );
    anchor.appendChild(this.text("#"));
    heading.appendChild(anchor);
    return heading;
  }

  code(token) {
    const isDiagram = (token.lang || "").trim().toLowerCase() === MERMAID;
    this.codeCount++;
    const label = isDiagram ? "Diagram source (Mermaid)" : "Code sample";
    const figure = this.el(
      "figure",
      isDiagram ? "doc-code doc-diagram" : "doc-code"
    );
    const pre = this.el("pre", "doc-pre");
    pre.setAttribute("tabindex", "0");
    pre.setAttribute("role", "region");
    pre.setAttribute("aria-label", `${label} ${this.codeCount}`);
    const code = this.el("code");
    code.appendChild(this.text(token.text || ""));
    pre.appendChild(code);
    if (!isDiagram) {
      figure.appendChild(this.scrollBox(pre));
      return figure;
    }
    const drawing = this.drawing(token.text || "");
    if (drawing) {
      figure.appendChild(drawing);
    }
    // The source stays one click away, closed. GitHub draws the diagram on the document's page.
    const details = this.el("details", "doc-diagram-source");
    const summary = this.el("summary", "doc-diagram-summary");
    summary.appendChild(this.text(label));
    details.appendChild(summary);
    details.appendChild(this.scrollBox(pre));
    figure.appendChild(details);
    const rendered = drawing ? null : diagramLink(this.ctx.baseUrl);
    if (rendered) {
      const note = this.el("p", "doc-diagram-note");
      const a = this.el("a", "doc-link");
      a.setAttribute("href", rendered);
      a.setAttribute("rel", "noopener noreferrer");
      a.appendChild(this.text("See the drawn diagram on GitHub"));
      note.appendChild(a);
      figure.appendChild(note);
    }
    return figure;
  }

  /** A code box with the same scroll cue as a table: a fade and "Scroll for more" while it overflows. */
  scrollBox(pre) {
    const box = this.el("div", "table-wrap code-wrap");
    box.appendChild(pre);
    const cue = this.el("p", "scroll-cue");
    cue.appendChild(this.text("Scroll for more"));
    box.appendChild(cue);
    return box;
  }

  /**
   * The two drawings of a Mermaid block, or null when the context does not list one for the
   * block's source. ctx.diagrams is { base, entries } where entries maps a hash to { alt }.
   */
  drawing(source) {
    const diagrams = this.ctx.diagrams;
    if (!diagrams || !diagrams.base || !diagrams.entries) {
      return null;
    }
    const hash = diagramHash(source);
    const entry = diagrams.entries[hash];
    if (!entry) {
      return null;
    }
    const alt = String(entry.alt || "").trim() || DEFAULT_ALT;
    const wrap = this.el("div", "doc-drawing");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", `Diagram ${this.codeCount}`);
    for (const theme of ["light", "dark"]) {
      const img = this.el("img", `doc-drawing-img doc-drawing-${theme}`);
      img.setAttribute("src", `${diagrams.base}/${hash}-${theme}.svg`);
      img.setAttribute("alt", alt);
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
      wrap.appendChild(img);
    }
    const open = this.el("button", "doc-drawing-open");
    open.setAttribute("type", "button");
    open.setAttribute("aria-haspopup", "dialog");
    open.setAttribute(
      "aria-label",
      `Open full size, diagram ${this.codeCount}`
    );
    open.dataset.hash = hash;
    open.dataset.label = `Diagram ${this.codeCount}`;
    open.appendChild(this.text("Open full size"));
    const box = this.el("div", "doc-drawing-box");
    box.appendChild(wrap);
    box.appendChild(open);
    return box;
  }

  list(token) {
    const list = this.el(token.ordered ? "ol" : "ul");
    if (token.ordered && Number.isInteger(token.start) && token.start !== 1) {
      list.setAttribute("start", String(token.start));
    }
    for (const item of token.items || []) {
      const li = this.el("li");
      if (item.task) {
        li.appendChild(this.text(item.checked ? "[x] " : "[ ] "));
      }
      for (const child of item.tokens || []) {
        if (child.type === "text" && !item.loose) {
          this.inline(li, child.tokens || [{ type: "text", text: child.text }]);
        } else if (child.type !== "checkbox") {
          const node = this.block(child);
          if (node) {
            li.appendChild(node);
          }
        }
      }
      list.appendChild(li);
    }
    return list;
  }

  table(token) {
    this.tableCount++;
    const cols = (token.header || []).length;
    // Four columns or more stack as label and value pairs on a phone, so every cell has its
    // column's name beside it. A table with fewer columns keeps its columns and scrolls.
    const stacks = cols >= STACK_COLUMNS;
    const labels = (token.header || []).map((cell) =>
      plainText(cell.tokens).trim()
    );
    const outer = this.el(
      "div",
      stacks ? "table-wrap table-stack" : "table-wrap"
    );
    const wrap = this.el("div", "table-scroll");
    wrap.setAttribute("tabindex", "0");
    wrap.setAttribute("role", "region");
    wrap.setAttribute(
      "aria-label",
      `Table ${this.tableCount}${labels[0] ? `: ${labels[0]}` : ""}`
    );
    const table = this.el("table");
    if (stacks) {
      table.setAttribute("role", "table");
    }
    const thead = this.el("thead");
    const headRow = this.el("tr");
    if (stacks) {
      headRow.setAttribute("role", "row");
    }
    (token.header || []).forEach((cell, i) => {
      const th = this.el("th");
      th.setAttribute("scope", "col");
      if (stacks) {
        th.setAttribute("role", "columnheader");
      }
      this.align(th, (token.align || [])[i]);
      this.inline(th, cell.tokens);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = this.el("tbody");
    for (const row of token.rows || []) {
      const tr = this.el("tr");
      if (stacks) {
        tr.setAttribute("role", "row");
      }
      row.forEach((cell, i) => {
        const td = this.el("td");
        if (stacks) {
          td.setAttribute("role", "cell");
        }
        if (labels[i]) {
          td.setAttribute("data-label", labels[i]);
        }
        this.align(td, (token.align || [])[i]);
        this.inline(td, cell.tokens);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    outer.appendChild(wrap);
    // Shown by the page only while the table is wider than its box.
    const cue = this.el("p", "scroll-cue");
    cue.appendChild(this.text("Scroll for more"));
    outer.appendChild(cue);
    return outer;
  }

  align(cell, value) {
    if (value === "center" || value === "right") {
      cell.classList.add(`align-${value}`);
    }
  }

  htmlBlock(token) {
    const text = decodeEntities(
      String(token.text || "").replace(TAG_PATTERN, "")
    ).trim();
    if (!text) {
      return null;
    }
    const p = this.el("p");
    p.appendChild(this.text(text));
    return p;
  }

  inline(parent, tokens) {
    for (const token of tokens || []) {
      const node = this.inlineNode(token);
      if (node) {
        parent.appendChild(node);
      }
    }
  }

  inlineNode(token) {
    switch (token.type) {
      case "text":
      case "escape":
        if (token.tokens && token.tokens.length) {
          const span = this.doc.createDocumentFragment();
          this.inline(span, token.tokens);
          return span;
        }
        return this.text(glueDots(decodeEntities(token.text)));
      case "strong":
      case "em":
      case "del": {
        const node = this.el(token.type === "del" ? "s" : token.type);
        this.inline(node, token.tokens);
        return node;
      }
      case "codespan": {
        const code = this.el("code", "doc-codespan");
        code.appendChild(this.text(decodeEntities(token.text)));
        return code;
      }
      case "br":
        return this.el("br");
      case "link":
        return this.link(token);
      case "image":
        return this.image(token);
      case "html":
        return BREAK_TAG.test(String(token.text || "").trim())
          ? this.el("br")
          : null;
      default:
        return token.text ? this.text(decodeEntities(token.text)) : null;
    }
  }

  link(token) {
    const resolved = resolveHref(token.href, this.linkContext());
    if (!resolved) {
      const span = this.el("span");
      this.inline(span, token.tokens);
      return span;
    }
    const a = this.el("a", "doc-link");
    a.setAttribute("href", resolved.href);
    if (resolved.kind === "hash") {
      a.dataset.hash = resolved.target;
    } else if (resolved.kind === "external") {
      a.setAttribute("rel", "noopener noreferrer");
    }
    this.inline(a, token.tokens);
    return a;
  }

  image(token) {
    const alt = (token.text || "").trim() || "image";
    const resolved = resolveHref(token.href, this.linkContext());
    if (!resolved) {
      return this.text(`[${alt}]`);
    }
    const a = this.el("a", "doc-link");
    a.setAttribute("href", resolved.href);
    a.setAttribute("rel", "noopener noreferrer");
    a.appendChild(this.text(`Image: ${alt}`));
    return a;
  }

  linkContext() {
    return {
      baseUrl: this.ctx.baseUrl,
      docHrefForPath: this.ctx.docHrefForPath,
      hashTarget: (hash) => {
        if (this.ids.has(hash)) {
          return hash;
        }
        return this.aliases.get(hash) || null;
      }
    };
  }
}

/**
 * Renders a markdown document.
 * @param {object} marked the Marked_Library namespace (only lexer is used)
 * @param {string} markdown the document text
 * @param {object} ctx { doc: Document, baseUrl: string, docHrefForPath(path, hash) }
 * @returns {{ title: string, fragment: DocumentFragment, headings: Array, aliases: Map }}
 */
export function renderMarkdown(marked, markdown, ctx) {
  const tokens = dropOwnContents(
    marked.lexer(String(markdown ?? ""), { gfm: true })
  );
  const { headings, aliases } = indexHeadings(tokens);
  const builder = new Builder(ctx.doc, ctx, aliases);
  builder.ids = new Set(headings.map((h) => h.id));
  let title = "";
  let rest = tokens;
  const firstIndex = tokens.findIndex((t) => t.type !== "space");
  const first = tokens[firstIndex];
  if (first && first.type === "heading" && first.depth === 1) {
    title = plainText(first.tokens).trim();
    rest = tokens.slice(firstIndex + 1);
  }
  const front = takeFrontMatter(rest);
  rest = front.rest;
  const fragment = ctx.doc.createDocumentFragment();
  if (front.entries.length) {
    fragment.appendChild(builder.frontLine(front.entries));
  }
  builder.blocks(fragment, rest);
  return {
    title,
    titleId: first && title ? first._docId : null,
    fragment,
    headings: headings.filter((h) => !(title && h.id === first._docId)),
    aliases
  };
}
