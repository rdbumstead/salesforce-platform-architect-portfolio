/**
 * @description       : Pure helpers for the cover letter sheet and its PDF. The letter text is
 *                      split into paragraphs on blank lines and into lines on single breaks, so
 *                      the greeting and the sign off keep their own lines. The PDF writes the
 *                      owner's header through c/documentPdf, the same header as the resume PDF,
 *                      then each paragraph as real selectable text with one line's space between
 *                      paragraphs, which is the blank line the on screen sheet shows. The header
 *                      is drawn by the page, never taken from the letter text.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/27/2026
 **/
import { DOCUMENT_LAYOUT, createPdfWriter, fileNamePart } from "c/documentPdf";

/** The shared document spec, with one body line of space after each paragraph. */
export const LETTER_LAYOUT = Object.freeze({
  ...DOCUMENT_LAYOUT,
  space: Object.freeze({
    ...DOCUMENT_LAYOUT.space,
    paragraphAfter: DOCUMENT_LAYOUT.type.text.size * DOCUMENT_LAYOUT.lineHeight
  })
});

/**
 * The letter as paragraphs of lines. Blank lines separate paragraphs, single breaks separate
 * lines inside one, and empty or space only lines are dropped.
 * @param {string} text the letter text
 * @returns {string[][]} paragraphs, each a list of lines
 */
export function letterParagraphs(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line)
    )
    .filter((lines) => lines.length > 0);
}

/**
 * Draws the header and the letter into a jsPDF document as real text. A paragraph stays on one
 * page when it fits. When trace is an array, every drawn piece is pushed onto it.
 * @param {object} doc a jsPDF document in points
 * @param {object} letter { header: { name, title, links }, content }
 * @param {object} options { family, trace }
 * @returns {object} the document
 */
export function writeLetterPdf(doc, letter, options = {}) {
  const layout = LETTER_LAYOUT;
  const writer = createPdfWriter(doc, {
    family: options.family,
    trace: options.trace,
    layout
  });
  const { type, space } = layout;
  writer.header(letter && letter.header);
  writer.setSection("letter");
  letterParagraphs(letter && letter.content).forEach((lines) => {
    const rows = [];
    lines.forEach((line) => {
      rows.push(...writer.paragraph("text", line, type.text));
    });
    writer.block(rows, space.paragraphAfter);
  });
  return writer.draw();
}

/**
 * Ryan-Bumstead-Cover-Letter-Acme-Financial.pdf: the owner's name when known, then
 * Cover-Letter, then the company when known.
 * @param {string} name the owner's name from the header
 * @param {string} company the company the visitor typed
 * @returns {string} the file name
 */
export function letterFileName(name, company) {
  const parts = [
    fileNamePart(name, "-", true),
    "Cover-Letter",
    fileNamePart(company, "-", true)
  ].filter((part) => part);
  return `${parts.join("-")}.pdf`;
}
