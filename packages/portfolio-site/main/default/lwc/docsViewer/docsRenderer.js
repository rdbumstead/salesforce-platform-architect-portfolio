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
 *                      Mermaid blocks show their source in a labelled code block.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/

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
    if (isDiagram) {
      const caption = this.el("figcaption", "doc-code-caption");
      caption.appendChild(this.text(label));
      figure.appendChild(caption);
    }
    const pre = this.el("pre", "doc-pre");
    pre.setAttribute("tabindex", "0");
    pre.setAttribute("role", "region");
    pre.setAttribute("aria-label", `${label} ${this.codeCount}`);
    const code = this.el("code");
    code.appendChild(this.text(token.text || ""));
    pre.appendChild(code);
    figure.appendChild(pre);
    return figure;
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
    const wrap = this.el("div", "table-scroll");
    wrap.setAttribute("tabindex", "0");
    wrap.setAttribute("role", "region");
    const first = (token.header || [])[0];
    const name = first ? plainText(first.tokens).trim() : "";
    wrap.setAttribute(
      "aria-label",
      `Table ${this.tableCount}${name ? `: ${name}` : ""}, scrolls sideways`
    );
    const table = this.el("table");
    const thead = this.el("thead");
    const headRow = this.el("tr");
    (token.header || []).forEach((cell, i) => {
      const th = this.el("th");
      th.setAttribute("scope", "col");
      this.align(th, (token.align || [])[i]);
      this.inline(th, cell.tokens);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = this.el("tbody");
    for (const row of token.rows || []) {
      const tr = this.el("tr");
      row.forEach((cell, i) => {
        const td = this.el("td");
        this.align(td, (token.align || [])[i]);
        this.inline(td, cell.tokens);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
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
        return this.text(decodeEntities(token.text));
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
  const tokens = marked.lexer(String(markdown ?? ""), { gfm: true });
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
  const fragment = ctx.doc.createDocumentFragment();
  builder.blocks(fragment, rest);
  return {
    title,
    titleId: first && title ? first._docId : null,
    fragment,
    headings: headings.filter((h) => !(title && h.id === first._docId)),
    aliases
  };
}
