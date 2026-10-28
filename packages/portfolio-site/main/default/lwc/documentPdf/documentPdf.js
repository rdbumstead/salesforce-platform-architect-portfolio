/**
 * @description       : The owner's documents as text PDFs, shared by the resume and the cover
 *                      letter. It holds the one layout spec for both documents (page, fonts,
 *                      sizes, spacing, colours), its preview form as CSS custom properties
 *                      (previewStyle), jsPDF loading from the jsPDF_Library static resource with
 *                      the two Inter files from Portfolio_Fonts (createPdfLoader), and a block
 *                      writer (createPdfWriter) that lays out rows, keeps a block on one page,
 *                      draws real selectable text and clickable links, and can trace every piece
 *                      it draws. The owner's header (centred name, title, then the links side by
 *                      side) is written once here, so both documents carry the same header.
 *                      jsPDF and the fonts load only on the first download. When the fonts cannot
 *                      be fetched the PDF is still written, in the fallback font.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/27/2026
 **/
import { loadScript } from "lightning/platformResourceLoader";
import JSPDF_LIBRARY from "@salesforce/resourceUrl/jsPDF_Library";
import PORTFOLIO_FONTS from "@salesforce/resourceUrl/Portfolio_Fonts";

/** Preview pixels per PDF point. 10 pt body text shows at 16 px. */
export const PREVIEW_PX_PER_PT = 1.6;

/** The page, fonts, sizes, spacing and colours both documents share. */
export const DOCUMENT_LAYOUT = Object.freeze({
  page: Object.freeze({ format: "letter", unit: "pt", margin: 54 }),
  lineHeight: 1.4,
  colors: Object.freeze({
    paper: "#ffffff",
    ink: "#101828",
    link: "#1d4ed8",
    rule: "#101828",
    muted: "#475467",
    error: "#b42318"
  }),
  font: Object.freeze({
    family: "Inter",
    fallback: "helvetica",
    files: Object.freeze({
      normal: "inter-latin-400-normal.ttf",
      bold: "inter-latin-700-normal.ttf"
    })
  }),
  type: Object.freeze({
    name: Object.freeze({ size: 17.5, bold: true }),
    title: Object.freeze({ size: 10, bold: false }),
    links: Object.freeze({ size: 10, bold: false }),
    summary: Object.freeze({ size: 10, bold: false }),
    sectionTitle: Object.freeze({ size: 9, bold: true, upper: true }),
    roleHeading: Object.freeze({ size: 10, bold: true }),
    roleDates: Object.freeze({ size: 10, bold: false }),
    bullet: Object.freeze({ size: 10, bold: false }),
    label: Object.freeze({ size: 10, bold: true }),
    text: Object.freeze({ size: 10, bold: false }),
    subheading: Object.freeze({ size: 8, bold: true, upper: true })
  }),
  space: Object.freeze({
    headerGap: 2,
    summaryBefore: 6,
    headerAfter: 15,
    sectionBefore: 10,
    sectionTitleAfter: 5,
    ruleWidth: 1.25,
    ruleGap: 2,
    roleAfter: 10,
    bulletIndent: 15,
    bulletMarker: 5,
    itemGap: 2,
    subheadingBefore: 6,
    linkGap: 8
  }),
  marks: Object.freeze({ bullet: "•", linkSeparator: "•" })
});

const px = (points) =>
  `${Math.round(points * PREVIEW_PX_PER_PT * 100) / 100}px`;

/**
 * The spec as CSS custom properties for a preview sheet, in a style attribute string.
 * @param {object} layout the layout spec, DOCUMENT_LAYOUT by default
 * @returns {string} "--resume-name-size: 28px; ..." for the sheet's style attribute
 */
export function previewStyle(layout = DOCUMENT_LAYOUT) {
  const { type, space, colors, lineHeight } = layout;
  const vars = {
    "--resume-paper": colors.paper,
    "--resume-ink": colors.ink,
    "--resume-link": colors.link,
    "--resume-rule": colors.rule,
    "--resume-muted": colors.muted,
    "--resume-error": colors.error,
    "--resume-line-height": String(lineHeight),
    "--resume-rule-width": px(space.ruleWidth),
    "--resume-rule-gap": px(space.ruleGap),
    "--resume-header-gap": px(space.headerGap),
    "--resume-summary-before": px(space.summaryBefore),
    "--resume-header-after": px(space.headerAfter),
    "--resume-section-before": px(space.sectionBefore),
    "--resume-section-title-after": px(space.sectionTitleAfter),
    "--resume-role-after": px(space.roleAfter),
    "--resume-bullet-indent": px(space.bulletIndent),
    "--resume-item-gap": px(space.itemGap),
    "--resume-subheading-before": px(space.subheadingBefore),
    "--resume-link-gap": px(space.linkGap)
  };
  if (space.paragraphAfter !== undefined) {
    vars["--resume-paragraph-after"] = px(space.paragraphAfter);
  }
  Object.keys(type).forEach((key) => {
    const name = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    vars[`--resume-${name}-size`] = px(type[key].size);
    vars[`--resume-${name}-weight`] = type[key].bold ? "700" : "400";
  });
  return Object.keys(vars)
    .map((key) => `${key}: ${vars[key]}`)
    .join("; ");
}

/**
 * Base64 of an ArrayBuffer, in chunks so a large file does not overflow the argument list.
 * @param {ArrayBuffer} buffer the font file
 * @returns {string} base64 text for jsPDF's virtual file system
 */
export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(index, index + chunk)
    );
  }
  return btoa(binary);
}

/**
 * A file name part: every run of characters other than letters and digits becomes the joiner.
 * With trim, a joiner at either end is dropped too.
 * @param {string} text the name, company or title
 * @param {string} joiner "_" or "-"
 * @param {boolean} trim drop a joiner at the start or the end
 * @returns {string} the safe part
 */
export function fileNamePart(text, joiner = "_", trim = false) {
  const part = String(text || "").replace(/[^A-Za-z0-9]+/g, joiner);
  if (!trim) {
    return part;
  }
  let start = 0;
  let end = part.length;
  while (start < end && part[start] === joiner) {
    start += 1;
  }
  while (end > start && part[end - 1] === joiner) {
    end -= 1;
  }
  return part.slice(start, end);
}

/**
 * Loads jsPDF and the fonts for one component, once each, and makes documents. A failed load
 * is tried again on the next call.
 * @param {object} component the LightningElement that loads the script (loadScript needs it)
 * @param {object} layout the layout spec, DOCUMENT_LAYOUT by default
 * @returns {object} { ensureJsPdf, ensureFonts, registerFonts, createDocument }
 */
export function createPdfLoader(component, layout = DOCUMENT_LAYOUT) {
  let jsPdfPromise;
  let fontPromise;

  const ensureJsPdf = () => {
    if (!jsPdfPromise) {
      jsPdfPromise = loadScript(component, JSPDF_LIBRARY).catch((error) => {
        // Let the next click try again after a failed load.
        jsPdfPromise = undefined;
        throw error;
      });
    }
    return jsPdfPromise;
  };

  // The Inter files as base64 by style, or null when they cannot be fetched.
  const ensureFonts = () => {
    if (!fontPromise) {
      const files = layout.font.files;
      const styles = Object.keys(files);
      fontPromise = Promise.all(
        styles.map((style) =>
          fetch(`${PORTFOLIO_FONTS}/${files[style]}`).then((response) => {
            if (!response.ok) {
              throw new Error(
                `Font ${files[style]} returned ${response.status}`
              );
            }
            return response.arrayBuffer();
          })
        )
      )
        .then((buffers) =>
          styles.map((style, index) => ({
            style,
            file: files[style],
            data: toBase64(buffers[index])
          }))
        )
        .catch(() => {
          fontPromise = undefined;
          return null;
        });
    }
    return fontPromise;
  };

  // Registers the fonts and returns the family to write with, or the fallback family when
  // there are no fonts or jsPDF refuses them.
  const registerFonts = (doc, fonts) => {
    if (!fonts) {
      return layout.font.fallback;
    }
    try {
      fonts.forEach((font) => {
        doc.addFileToVFS(font.file, font.data);
        doc.addFont(font.file, layout.font.family, font.style);
      });
      return layout.font.family;
    } catch {
      return layout.font.fallback;
    }
  };

  /**
   * A new letter size document with the fonts registered.
   * @returns {Promise<object>} { doc, family }
   */
  const createDocument = async () => {
    const [, fonts] = await Promise.all([ensureJsPdf(), ensureFonts()]);
    // jsPDF 3.x UMD build registers its exports on the jspdf global.
    const jsPdfNamespace = window.jspdf;
    if (!jsPdfNamespace || typeof jsPdfNamespace.jsPDF !== "function") {
      throw new Error("jsPDF did not load.");
    }
    const doc = new jsPdfNamespace.jsPDF({
      unit: layout.page.unit,
      format: layout.page.format,
      compress: true
    });
    return { doc, family: registerFonts(doc, fonts) };
  };

  return { ensureJsPdf, ensureFonts, registerFonts, createDocument };
}

/**
 * Breaks text into lines no wider than the widths given, measured with the document's current
 * font. The first line can be narrower, for a bold label or a date in the same row.
 */
export function wrapText(doc, text, firstWidth, restWidth) {
  const words = String(text)
    .split(/\s+/)
    .filter((word) => word);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    const limit = lines.length === 0 ? firstWidth : restWidth;
    if (current && doc.getTextWidth(candidate) > limit) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current || lines.length === 0) {
    lines.push(current);
  }
  return lines;
}

/**
 * A block writer over a jsPDF document in points. The caller adds blocks of rows (a block never
 * splits across pages unless it is taller than a page, and keepWithNext keeps it with the next
 * block), then calls draw. Text is real text in reading order, links are clickable. When
 * options.trace is an array, every drawn piece is pushed onto it as
 * { section, kind, text, page, y } in drawing order.
 * @param {object} doc a jsPDF document in points
 * @param {object} options { family, trace, layout }
 * @returns {object} the writer
 */
export function createPdfWriter(doc, options = {}) {
  const layout = options.layout || DOCUMENT_LAYOUT;
  const family = options.family || layout.font.fallback;
  const trace = Array.isArray(options.trace) ? options.trace : null;
  const { type, space, colors, marks } = layout;
  const margin = layout.page.margin;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = pageWidth - margin * 2;
  const bottom = pageHeight - margin;
  const blocks = [];
  let section = "header";

  const setType = (style) => {
    doc.setFont(family, style.bold ? "bold" : "normal");
    doc.setFontSize(style.size);
  };
  const lineOf = (style) => style.size * layout.lineHeight;
  const measure = (text, style) => {
    setType(style);
    return doc.getTextWidth(text);
  };
  const shown = (text, style) => (style.upper ? text.toUpperCase() : text);

  // A row is one line box: its height and the pieces drawn in it, x absolute, y from its top.
  const textRow = (pieces, style, extra = 0) => ({
    height: lineOf(style) + extra,
    pieces: pieces.map((piece) => ({ ...piece, style: piece.style || style }))
  });
  const block = (rows, after, keepWithNext = false) => {
    blocks.push({ rows, after, keepWithNext, section });
  };
  const spacer = (amount) => {
    blocks.push({ spacer: amount });
  };

  const paragraph = (kind, text, style, indent = 0) => {
    setType(style);
    return wrapText(doc, text, width - indent, width - indent).map((part) =>
      textRow([{ kind, text: part, x: margin + indent }], style)
    );
  };

  const labelled = (kind, label, text, style, labelStyle) => {
    const labelText = `${label}:`;
    const labelWidth = measure(`${labelText} `, labelStyle);
    setType(style);
    return wrapText(doc, text, width - labelWidth, width).map((part, index) =>
      textRow(
        index === 0
          ? [
              {
                kind: `${kind}-label`,
                text: labelText,
                x: margin,
                style: labelStyle
              },
              { kind, text: part, x: margin + labelWidth }
            ]
          : [{ kind, text: part, x: margin }],
        style
      )
    );
  };

  /**
   * The owner's header: centred name, title and links side by side, then the summary with no
   * heading when there is one. One block, so it never splits.
   * @param {object} model { name, title, links: [{ label, url }], careerObjective }
   */
  const header = (model) => {
    if (!model) {
      return;
    }
    const links = model.links || [];
    const rows = [];
    const centred = (kind, text, style) => {
      const textWidth = measure(text, style);
      return textRow(
        [{ kind, text, x: margin + (width - textWidth) / 2 }],
        style,
        space.headerGap
      );
    };
    if (model.name) {
      rows.push(centred("name", model.name, type.name));
    }
    if (model.title) {
      rows.push(centred("title", model.title, type.title));
    }
    if (links.length) {
      const separator = marks.linkSeparator;
      const gap = space.linkGap;
      const separatorWidth = measure(separator, type.links);
      const widths = links.map((link) => measure(link.label, type.links));
      const total =
        widths.reduce((sum, value) => sum + value, 0) +
        (widths.length - 1) * (separatorWidth + gap * 2);
      let x = margin + (width - total) / 2;
      const pieces = [];
      links.forEach((link, index) => {
        if (index > 0) {
          pieces.push({ kind: "separator", text: separator, x: x + gap });
          x += separatorWidth + gap * 2;
        }
        pieces.push({ kind: "link", text: link.label, x, url: link.url });
        x += widths[index];
      });
      rows.push(textRow(pieces, type.links, space.headerGap));
    }
    if (model.careerObjective) {
      const summary = paragraph("summary", model.careerObjective, type.summary);
      summary[0].height += space.summaryBefore;
      summary[0].offset = space.summaryBefore;
      rows.push(...summary);
    }
    block(rows, space.headerAfter);
  };

  // Pagination and drawing, one block at a time.
  const draw = () => {
    const heightOf = (item) =>
      item.rows.reduce((sum, row) => sum + row.height, 0);
    let y = margin;
    let page = 1;
    let onPage = false;
    const newPage = () => {
      doc.addPage();
      page += 1;
      y = margin;
      onPage = false;
    };
    const drawRow = (row, label) => {
      const top = y + (row.offset || 0);
      row.pieces.forEach((piece) => {
        const style = piece.style;
        setType(style);
        const baseline = top + lineOf(style) / 2 + style.size * 0.35;
        if (piece.url) {
          doc.setTextColor(colors.link);
          doc.textWithLink(piece.text, piece.x, baseline, { url: piece.url });
        } else {
          doc.setTextColor(colors.ink);
          doc.text(piece.text, piece.x, baseline);
        }
        if (trace) {
          trace.push({
            section: label,
            kind: piece.kind,
            text: piece.text,
            page,
            y: Math.round(baseline)
          });
        }
      });
      if (row.rule) {
        const ruleY = top + row.height - space.ruleWidth / 2;
        doc.setDrawColor(colors.rule);
        doc.setLineWidth(space.ruleWidth);
        doc.line(margin, ruleY, margin + width, ruleY);
      }
      y += row.height;
      onPage = true;
    };

    blocks.forEach((item, index) => {
      if (item.spacer) {
        if (onPage) {
          y += item.spacer;
        }
        return;
      }
      let needed = heightOf(item);
      if (item.keepWithNext) {
        const next = blocks
          .slice(index + 1)
          .find((candidate) => candidate.rows);
        if (next) {
          needed += item.after + heightOf(next);
        }
      }
      if (onPage && y + needed > bottom) {
        newPage();
      }
      item.rows.forEach((row) => {
        if (onPage && y + row.height > bottom) {
          newPage();
        }
        drawRow(row, item.section);
      });
      y += item.after;
    });
    return doc;
  };

  return {
    layout,
    margin,
    width,
    get blockCount() {
      return blocks.length;
    },
    setSection(name) {
      section = name;
    },
    setType,
    lineOf,
    measure,
    shown,
    textRow,
    block,
    spacer,
    paragraph,
    labelled,
    header,
    draw
  };
}
