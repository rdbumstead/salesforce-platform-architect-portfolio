#!/usr/bin/env node
/**
 * Reads every resume PDF the way a machine reads it.
 *
 * The check runs the shipped resume code in Node: resumeFormat.js builds the view model and
 * draws it through c/documentPdf, into the jsPDF build from the jsPDF_Library static resource,
 * with the Inter files from Portfolio_Fonts. Module hooks resolve the LWC imports to the real
 * component files. Only the two platform imports are stand ins (the resource loader and the
 * resource URLs), because the check makes the document itself instead of loading a script tag.
 *
 * Each PDF is then read back through the pdf.js text layer and checked for:
 *   collisions      no two text boxes intersect on any page
 *   order           the text reads in the order of buildLines(model), and the content stream
 *                   runs in the same order as the page reads top to bottom
 *   roundTrip       every character the writer drew comes back from the text layer
 *   fields          every employer, title, date range and certification is recovered field by
 *                   field, by position and text alone (no resume parser is installed)
 *   reproducible    two builds of the same data give the same text layer
 *   pages           the page count is within the variant's budget
 *
 * Usage: node build/resume-pdf-check.mjs <resume data file> [--budget <file>] [--expected <file>]
 * The data file is a fixture reads file (every ResumeController.getResume read in it is used)
 * or one getResume payload. Prints one JSON object. Exits 1 when any check fails.
 */
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..');
const SOURCE = path.join(REPO_ROOT, 'packages', 'portfolio-site', 'main', 'default');
const LWC_DIR = path.join(SOURCE, 'lwc');
const STATIC_DIR = path.join(SOURCE, 'staticresources');
const LWC_URL = pathToFileURL(LWC_DIR + path.sep).href;
const VIRTUAL = 'resume-pdf-check:';

/** Coordinates in the PDF are written to two decimals, so anything under this is rounding. */
export const TOLERANCE = 0.01;

/**
 * Fixed for the check, so two builds can be compared on any machine. The shipped code never sets
 * it, so jsPDF stamps the time of the download in the local time zone. A PDF date string, not a
 * Date, because jsPDF writes a Date in the local zone.
 */
export const FIXED_CREATION_DATE = "D:20260101000000+00'00'";
export const FIXED_FILE_ID = '0123456789abcdef0123456789abcdef';

const VIRTUAL_SOURCES = {
  [`${VIRTUAL}platformResourceLoader`]:
    'export function loadScript() { return Promise.reject(new Error("not in the check")); }\n' +
    'export function loadStyle() { return Promise.reject(new Error("not in the check")); }\n',
  [`${VIRTUAL}resourceUrl`]: 'export default "/resource";\n'
};

let hooksInstalled = false;

/** Resolves c/name to the real component file and the two platform imports to stand ins. */
export function installLwcHooks() {
  if (hooksInstalled) {
    return;
  }
  hooksInstalled = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'lightning/platformResourceLoader') {
        return { url: `${VIRTUAL}platformResourceLoader`, shortCircuit: true };
      }
      if (specifier.startsWith('@salesforce/resourceUrl/')) {
        return { url: `${VIRTUAL}resourceUrl`, shortCircuit: true };
      }
      const component = /^c\/([A-Za-z0-9_]+)$/.exec(specifier);
      if (component) {
        const file = path.join(LWC_DIR, component[1], `${component[1]}.js`);
        return { url: pathToFileURL(file).href, shortCircuit: true };
      }
      const parent = context.parentURL || '';
      if (parent.startsWith(LWC_URL) && specifier.startsWith('.') && !path.extname(specifier)) {
        return { url: new URL(`${specifier}.js`, parent).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url.startsWith(VIRTUAL)) {
        return { format: 'module', source: VIRTUAL_SOURCES[url], shortCircuit: true };
      }
      if (url.startsWith(LWC_URL)) {
        const loaded = nextLoad(url, { ...context, format: 'module' });
        return { ...loaded, format: 'module', shortCircuit: true };
      }
      return nextLoad(url, context);
    }
  });
}

let shipped;

/** The shipped modules, jsPDF and the fonts, loaded once. */
export async function loadShipped() {
  if (shipped) {
    return shipped;
  }
  installLwcHooks();
  const format = await import(pathToFileURL(path.join(LWC_DIR, 'resumeBuilder', 'resumeFormat.js')).href);
  const layoutModule = await import(pathToFileURL(path.join(LWC_DIR, 'resumeBuilder', 'resumeLayout.js')).href);
  const documentPdf = await import(pathToFileURL(path.join(LWC_DIR, 'documentPdf', 'documentPdf.js')).href);
  const jsPdfSource = readFileSync(path.join(STATIC_DIR, 'jsPDF_Library.js'), 'utf8');
  const cjs = { exports: {} };
  new Function('module', 'exports', jsPdfSource)(cjs, cjs.exports);
  const layout = layoutModule.RESUME_LAYOUT;
  const files = layout.font.files;
  const fonts = Object.keys(files).map((style) => {
    const bytes = readFileSync(path.join(STATIC_DIR, 'Portfolio_Fonts', files[style]));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return { style, file: files[style], data: documentPdf.toBase64(buffer) };
  });
  shipped = { format, layout, documentPdf, jsPDF: cjs.exports.jsPDF, fonts };
  return shipped;
}

/** The page's view model options. The page has header and skills switches, both on by default. */
export const PAGE_OPTIONS = Object.freeze({ includeHeader: true, includeSkills: true });

/**
 * Renders one view model to PDF bytes the way the page's Download PDF does, through
 * createPdfLoader's registerFonts and writePdf, with the creation date and file id fixed.
 * @returns {Promise<{bytes: Uint8Array, trace: object[], pages: number, family: string}>}
 */
export async function renderModel(model) {
  const { format, layout, documentPdf, jsPDF, fonts } = await loadShipped();
  const doc = new jsPDF({ unit: layout.page.unit, format: layout.page.format, compress: true });
  const family = documentPdf.createPdfLoader(null, layout).registerFonts(doc, fonts);
  doc.setCreationDate(FIXED_CREATION_DATE);
  doc.setFileId(FIXED_FILE_ID);
  const trace = [];
  format.writePdf(doc, model, { family, trace });
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  return { bytes, trace, pages: doc.getNumberOfPages(), family };
}

let pdfjsModule;
async function pdfjs() {
  if (!pdfjsModule) {
    pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsModule;
}

/**
 * The text layer of a PDF: every text item with its page, box and font size, in content stream
 * order. The box runs from the baseline plus the font's descent to the baseline plus its ascent,
 * both from the embedded font as pdf.js reads it. pdf.js adds an item of spaces where it sees a
 * gap between two runs of text. Those items have no glyphs in the page, so they are left out.
 */
export async function readTextLayer(bytes) {
  const lib = await pdfjs();
  const task = lib.getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    verbosity: 0
  });
  const pdf = await task.promise;
  const pages = [];
  const items = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const [, , pageWidth, pageHeight] = page.view;
    pages.push({ number, width: pageWidth, height: pageHeight });
    const content = await page.getTextContent({ disableNormalization: true });
    content.items.forEach((item) => {
      if (typeof item.str !== 'string' || item.str.trim() === '') {
        return;
      }
      const [a, b, , , e, f] = item.transform;
      const size = Math.hypot(a, b);
      const style = content.styles[item.fontName] || {};
      const ascent = typeof style.ascent === 'number' ? style.ascent : 0.8;
      const descent = typeof style.descent === 'number' ? style.descent : -0.2;
      items.push({
        index: items.length,
        page: number,
        str: item.str,
        x: e,
        baseline: f,
        width: item.width,
        size,
        ascent,
        descent,
        fontName: item.fontName,
        box: {
          left: e,
          right: e + item.width,
          bottom: f + descent * size,
          top: f + ascent * size
        }
      });
    });
  }
  await task.destroy();
  return { pages, items };
}

const round2 = (value) => Math.round(value * 100) / 100;
const rect = (box) => ({
  left: round2(box.left),
  bottom: round2(box.bottom),
  right: round2(box.right),
  top: round2(box.top)
});

/** Every pair of text boxes on the same page that overlap by more than the tolerance. */
export function findCollisions(items, tolerance = TOLERANCE) {
  const collisions = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a.page !== b.page) {
        continue;
      }
      const across = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
      const down = Math.min(a.box.top, b.box.top) - Math.max(a.box.bottom, b.box.bottom);
      if (across > tolerance && down > tolerance) {
        collisions.push({
          page: a.page,
          first: { text: a.str, rect: rect(a.box) },
          second: { text: b.str, rect: rect(b.box) },
          overlap: { width: round2(across), height: round2(down) }
        });
      }
    }
  }
  return collisions;
}

/**
 * Rows as a reader sees them: by page, then top to bottom by baseline, then left to right.
 * Items whose baselines sit within half a point share a row.
 */
export function readingRows(items) {
  const sorted = items.slice().sort((a, b) => a.page - b.page || b.baseline - a.baseline || a.x - b.x);
  const rows = [];
  sorted.forEach((item) => {
    const last = rows[rows.length - 1];
    if (last && last.page === item.page && Math.abs(last.baseline - item.baseline) <= 0.5) {
      last.items.push(item);
    } else {
      rows.push({ page: item.page, baseline: item.baseline, items: [item] });
    }
  });
  rows.forEach((row) => {
    row.items.sort((a, b) => a.x - b.x);
    row.text = row.items.map((item) => item.str).join(' ');
    row.size = Math.max(...row.items.map((item) => item.size));
  });
  return rows;
}

const normal = (text) => String(text).replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Where a buildLines line should be found in the PDF text. A line the PDF shows word for word
 * is its own anchor. Otherwise the anchor is the part the PDF does show: the label of a link
 * line (the URL is the link target, not text), the title of an experience entry (the PDF puts
 * the employer and the dates in their own places), and the short name of a certification (the
 * PDF drops the issuer prefix, as shortCertName does).
 */
export function lineAnchors(line, section, shortCertName) {
  const text = String(line.text);
  const anchors = [text];
  if (/: https?:\/\//i.test(text)) {
    anchors.push(text.slice(0, text.search(/: https?:\/\//i)));
  }
  if (line.kind === 'entry') {
    anchors.push(text.split(' | ')[0].split(', ')[0]);
  }
  if (normal(section) === 'certifications' && line.kind === 'text') {
    const parts = text.split(', ');
    if (parts.length >= 2 && shortCertName) {
      anchors.push(shortCertName(parts[0], parts[1]));
    }
  }
  return anchors.filter((anchor) => anchor.trim() !== '');
}

/**
 * Reading order. Each buildLines line is looked for in the PDF text, read top to bottom, from
 * where the previous line was found. A line found only earlier is out of order. A line found
 * nowhere is missing. The content stream order is compared with the top to bottom order too,
 * since many parsers read the stream as it is.
 */
export function checkOrder(lines, items, shortCertName) {
  const rows = readingRows(items);
  const pageText = normal(rows.map((row) => row.text).join(' '));
  const outOfOrder = [];
  const missing = [];
  let cursor = 0;
  let section = '';
  let located = 0;
  lines.forEach((line, index) => {
    if (line.kind === 'spacer') {
      return;
    }
    if (line.kind === 'heading') {
      section = line.text;
    }
    const anchors = lineAnchors(line, section, shortCertName).map(normal);
    let found = -1;
    let anchorUsed = '';
    for (const anchor of anchors) {
      const at = pageText.indexOf(anchor, cursor);
      if (at >= 0) {
        found = at;
        anchorUsed = anchor;
        break;
      }
    }
    if (found >= 0) {
      located += 1;
      cursor = found + anchorUsed.length;
      return;
    }
    const earlier = anchors.find((anchor) => pageText.indexOf(anchor) >= 0);
    if (earlier) {
      outOfOrder.push({ line: index, kind: line.kind, text: line.text });
    } else {
      missing.push({ line: index, kind: line.kind, text: line.text });
    }
  });
  const visual = rows.flatMap((row) => row.items.map((item) => item.index));
  const stream = items.map((item) => item.index);
  const streamMatches = visual.every((value, position) => value === stream[position]);
  const total = lines.filter((line) => line.kind !== 'spacer').length;
  return {
    equal: outOfOrder.length === 0 && missing.length === 0 && streamMatches,
    located,
    total,
    outOfOrder,
    missing,
    streamMatchesReading: streamMatches
  };
}

/**
 * Characters as a reader compares them: runs of whitespace are one space, since pdf.js joins
 * two pieces on one line with a space it makes up from the gap between them.
 */
const flat = (text) => String(text).replace(/\s+/g, ' ').trim();

/**
 * The characters of two strings that line up, by longest common subsequence. The strings are
 * single rows of text, so the quadratic table is small.
 */
export function commonCharacters(expected, got) {
  const width = got.length + 1;
  let previous = new Array(width).fill(0);
  for (let i = 1; i <= expected.length; i += 1) {
    const current = new Array(width).fill(0);
    for (let j = 1; j <= got.length; j += 1) {
      current[j] =
        expected[i - 1] === got[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[got.length];
}

/**
 * Character round trip, row by row. The writer's trace says what it drew on each row (page and
 * baseline), and the text layer row on the same page within a point of that baseline must read
 * the same characters. pdf.js can merge two pieces on one row into one item (a bullet and its
 * text), so rows are compared, not items. pageHeight turns the trace's top down baseline into
 * the PDF's bottom up one.
 */
export function checkRoundTrip(trace, items, pageHeight = 792) {
  const drawn = [];
  trace.forEach((piece) => {
    const last = drawn[drawn.length - 1];
    if (last && last.page === piece.page && last.y === piece.y) {
      last.pieces.push(piece.text);
    } else {
      drawn.push({ page: piece.page, y: piece.y, pieces: [piece.text] });
    }
  });
  const rows = readingRows(items);
  const used = new Set();
  let total = 0;
  let matched = 0;
  const misses = [];
  drawn.forEach((row) => {
    const expected = flat(row.pieces.join(' '));
    const at = rows.findIndex(
      (candidate, index) =>
        !used.has(index) &&
        candidate.page === row.page &&
        Math.abs(pageHeight - candidate.baseline - row.y) <= 1
    );
    const got = at >= 0 ? flat(rows[at].text) : '';
    if (at >= 0) {
      used.add(at);
    }
    total += expected.length;
    const same = got === expected ? expected.length : commonCharacters(expected, got);
    matched += same;
    if (got !== expected) {
      misses.push({ page: row.page, y: row.y, expected, got });
    }
  });
  rows.forEach((row, index) => {
    if (!used.has(index)) {
      misses.push({ page: row.page, y: Math.round(pageHeight - row.baseline), expected: '', got: flat(row.text) });
    }
  });
  const percent = total === 0 ? 100 : Math.floor((matched / total) * 10000) / 100;
  return { percent, characters: total, matched, misses };
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A date range as months, from "Mon YYYY - Mon YYYY" or "Mon YYYY - Present", with anything
 * after a " | " (Remote) left off. Null when the text is not a range.
 */
export function monthRange(text) {
  const match = /^([A-Za-z]{3}) (\d{4}) - (?:([A-Za-z]{3}) (\d{4})|Present)$/.exec(String(text).split(' | ')[0].trim());
  if (!match) {
    return null;
  }
  const month = (name, year) => Number(year) * 12 + MONTH_NAMES.indexOf(name.toLowerCase());
  return { start: month(match[1], match[2]), end: match[3] ? month(match[3], match[4]) : Infinity };
}

/**
 * Reads the summary, experience and certifications back from the text layer by position alone.
 * A section starts at an all capitals row at the left margin in the section title size. A
 * smaller all capitals row (Retired) stays inside its section. A role row has a last piece set flush to the
 * right margin (its dates). An employer heading over several roles is a role row with a wide
 * gap above it, or at the top of a page, and another role row close under it. A row at the
 * left margin straight under a role row, with no gap, carries on its heading. A page break
 * does not end an employer's group.
 *
 * At the top of a page there is no gap above to go by, and an employer heading with a role
 * under it looks the same as a role with no highlights and the next role of the same employer:
 * same size, weight, left edge and gap between them. So when a group is still open from the
 * page before, the row opens a new group only when its dates span the dates of every role row
 * close under it, as an employer's overall span does. Otherwise it is the open group's next role.
 */
export function parseFields(items, layout, pageWidth = 612) {
  const rows = readingRows(items);
  const margin = layout.page.margin;
  const right = pageWidth - margin;
  const leading = layout.lineHeight;
  const closeGap = layout.space.roleAfter / 2;
  const sectionSize = layout.type.sectionTitle.size;
  const isCapitals = (row) =>
    row.items.length === 1 &&
    Math.abs(row.items[0].x - margin) < 0.5 &&
    /[A-Z]/.test(row.text) &&
    row.text === row.text.toUpperCase();
  const isSection = (row) => isCapitals(row) && Math.abs(row.size - sectionSize) < 0.1;
  const isRoleRow = (row) =>
    row.items.length >= 2 && Math.abs(row.items[row.items.length - 1].box.right - right) < 1;
  const pageStart = (index) => index === 0 || rows[index - 1].page !== rows[index].page;
  const gapBefore = (index) =>
    pageStart(index) ? Infinity : rows[index - 1].baseline - rows[index].baseline - rows[index].size * leading;
  let section = '';
  const summary = [];
  const experience = [];
  const certifications = [];
  // True when the dates span those of every role row in the close run under the row at index.
  const spansRolesBelow = (index, dates) => {
    const span = monthRange(dates);
    if (!span) {
      return true;
    }
    for (let below = index + 1; below < rows.length && gapBefore(below) < closeGap; below += 1) {
      if (isRoleRow(rows[below])) {
        const range = monthRange(rows[below].items[rows[below].items.length - 1].str);
        if (range && (range.start < span.start || range.end > span.end)) {
          return false;
        }
      }
    }
    return true;
  };
  let employer = null;
  let carry = null;
  rows.forEach((row, index) => {
    if (isSection(row)) {
      section = row.text;
      employer = null;
      carry = null;
      return;
    }
    if (section === 'EXPERIENCE' && isRoleRow(row)) {
      const left = row.items.slice(0, -1).map((item) => item.str).join(' ');
      const dates = row.items[row.items.length - 1].str;
      const next = rows[index + 1];
      const wide = gapBefore(index) >= closeGap;
      let opensGroup = wide && next && isRoleRow(next) && gapBefore(index + 1) < closeGap;
      if (opensGroup && pageStart(index) && employer) {
        opensGroup = spansRolesBelow(index, dates);
      }
      if (opensGroup) {
        employer = { employer: left, span: dates };
        carry = employer;
        return;
      }
      if (wide && !pageStart(index)) {
        employer = null;
      }
      const entry = { heading: left, dates, employer: employer ? employer.employer : null };
      experience.push(entry);
      carry = entry;
      return;
    }
    if (section === 'EXPERIENCE' && carry && Math.abs(row.items[0].x - margin) < 0.5 && gapBefore(index) < 0.5) {
      if (carry === employer) {
        employer.employer = `${employer.employer} ${row.text}`;
      } else {
        carry.heading = `${carry.heading} ${row.text}`;
      }
      return;
    }
    carry = null;
    if (section === 'SUMMARY') {
      summary.push(row.text);
    }
    if (section === 'CERTIFICATIONS') {
      certifications.push(row.text);
    }
  });
  return { summary: summary.join(' '), experience, certifications };
}

/**
 * Field by field: the summary under its Summary title, then for every role in the model its
 * title, employer and date range, and for every certification its line, must come back from
 * parseFields.
 */
export function checkFields(model, items, layout, employerLabel, pageWidth) {
  const parsed = parseFields(items, layout, pageWidth);
  const misses = [];
  let total = 0;
  const expectField = (what, expected, got) => {
    total += 1;
    if (expected !== got) {
      misses.push({ field: what, expected, got: got === undefined ? null : got });
    }
  };
  const objective = model.header ? model.header.careerObjective : '';
  if (objective) {
    expectField('summary', flat(objective), flat(parsed.summary));
  }
  const roles = model.employers.flatMap((group) =>
    group.roles.map((role) => ({ role, group }))
  );
  roles.forEach(({ role, group }, index) => {
    const found = parsed.experience[index] || {};
    const label = employerLabel(role.employer, role.isPartTime);
    if (group.isStacked) {
      expectField(`role ${index + 1} title`, role.title, found.heading);
      expectField(`role ${index + 1} employer`, group.employer, found.employer);
    } else {
      const heading = found.heading || '';
      const split = heading.lastIndexOf(', ');
      const gotTitle = label && split >= 0 ? heading.slice(0, split) : heading;
      const gotEmployer = label && split >= 0 ? heading.slice(split + 2) : '';
      expectField(`role ${index + 1} title`, role.title, gotTitle);
      expectField(`role ${index + 1} employer`, label, gotEmployer);
    }
    expectField(`role ${index + 1} dates`, role.datesText, found.dates);
  });
  const certificationLines = parsed.certifications.map(normal);
  const expectCertification = (what, text) => {
    total += 1;
    if (!certificationLines.includes(normal(text))) {
      misses.push({ field: what, expected: text, got: null });
    }
  };
  model.certificationGroups.forEach((group) =>
    group.certifications.forEach((cert) => expectCertification('certification', cert.text))
  );
  model.retiredCertifications.forEach((cert) => expectCertification('retired certification', cert.text));
  return { recovered: total - misses.length, total, misses, parsedRoles: parsed.experience.length };
}

const layerKey = (layer) =>
  JSON.stringify(layer.items.map((item) => [item.page, item.str, round2(item.x), round2(item.baseline), round2(item.width)]));

/**
 * Runs every check on one view model. budget is the page count allowed, or undefined for none.
 */
export async function checkModel(model, { budget } = {}) {
  const { format, layout } = await loadShipped();
  const first = await renderModel(model);
  const second = await renderModel(model);
  const layer = await readTextLayer(first.bytes);
  const again = await readTextLayer(second.bytes);
  const lines = format.buildLines(model);
  const collisions = findCollisions(layer.items);
  const order = checkOrder(lines, layer.items, format.shortCertName);
  const roundTrip = checkRoundTrip(first.trace, layer.items, layer.pages[0].height);
  const fields = checkFields(model, layer.items, layout, format.employerLabel, layer.pages[0].width);
  const reproducible = layerKey(layer) === layerKey(again);
  const sameBytes = Buffer.compare(Buffer.from(first.bytes), Buffer.from(second.bytes)) === 0;
  const pages = first.pages;
  const result = {
    family: first.family,
    pages,
    budget: budget === undefined ? null : budget,
    collisions,
    order,
    roundTrip,
    fields,
    reproducible,
    sameBytes
  };
  result.failures = failuresOf(result);
  return result;
}

/** The failed checks of one variant's result, by name. */
export function failuresOf(result) {
  const failures = [];
  if (result.collisions.length > 0) failures.push('collisions');
  if (!result.order.equal) failures.push('order');
  if (result.roundTrip.percent < 100 || result.roundTrip.misses.length > 0) failures.push('roundTrip');
  if (result.fields.misses.length > 0) failures.push('fields');
  if (!result.reproducible) failures.push('reproducible');
  if (result.budget !== null && result.pages > result.budget) failures.push('pages');
  return failures;
}

const GET_RESUME = /^ResumeController\.getResume\|(\{.*\})$/;

/** The resumes in a data file: every getResume read in a fixture reads file, or one payload. */
export function resumesFrom(data) {
  if (data && Array.isArray(data.roles)) {
    return [{ persona: data.persona || 'Resume', resume: data }];
  }
  return Object.keys(data || {})
    .map((key) => {
      const match = GET_RESUME.exec(key);
      return match ? { persona: JSON.parse(match[1]).persona, resume: data[key] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.persona.localeCompare(b.persona));
}

/**
 * The page has no switch for retired certifications: they show whenever the data holds one. So
 * the variant without them is the same data with the retired certifications taken out.
 */
export function withoutRetired(resume) {
  return { ...resume, certifications: (resume.certifications || []).filter((cert) => cert.isRetired !== true) };
}

/** The variants of every resume: with and without retired certifications. */
export function variantsOf(resumes) {
  return resumes.flatMap(({ persona, resume }) => [
    { name: `${persona} with retired`, resume },
    { name: `${persona} without retired`, resume: withoutRetired(resume) }
  ]);
}

/**
 * Each problem behind a failed check, as one line of text, so a known problem can be named
 * exactly and anything new still fails.
 */
export function problemsOf(result, check) {
  switch (check) {
    case 'collisions':
      return result.collisions.map((pair) => `${pair.first.text} | ${pair.second.text}`);
    case 'order':
      return [
        ...result.order.missing.map((line) => `missing: ${line.text}`),
        ...result.order.outOfOrder.map((line) => `out of order: ${line.text}`),
        ...(result.order.streamMatchesReading ? [] : ['stream order differs from reading order'])
      ];
    case 'roundTrip':
      return result.roundTrip.misses.map((miss) => `expected "${miss.expected}" got "${miss.got}"`);
    case 'fields':
      return result.fields.misses.map((miss) => `${miss.field}: ${miss.expected}`);
    case 'reproducible':
      return ['the text layer differs between two builds'];
    case 'pages':
      return [`${result.pages} pages over a budget of ${result.budget}`];
    default:
      return [];
  }
}

/**
 * Splits a variant's failed checks into expected and unexpected. expected lists known problems
 * as { variant, check, problem, reason }, where variant "*" means every variant. A check is
 * expected only when every one of its problems is listed.
 */
export function classifyFailures(name, result, expected = []) {
  const listed = (check, problem) =>
    expected.some(
      (entry) =>
        (entry.variant === '*' || entry.variant === name) && entry.check === check && entry.problem === problem
    );
  const expectedFailures = [];
  const unexpectedFailures = [];
  result.failures.forEach((check) => {
    const problems = problemsOf(result, check);
    if (problems.length > 0 && problems.every((problem) => listed(check, problem))) {
      expectedFailures.push(check);
    } else {
      unexpectedFailures.push(check);
    }
  });
  return { expectedFailures, unexpectedFailures };
}

/**
 * Runs every variant. budgets maps a variant name to its page budget. expected lists known
 * problems (see classifyFailures): such a problem is reported and does not fail the run.
 */
export async function runChecks(data, { budgets = {}, expected = [] } = {}) {
  const { format } = await loadShipped();
  const variants = [];
  for (const variant of variantsOf(resumesFrom(data))) {
    const model = format.buildViewModel(variant.resume, PAGE_OPTIONS);
    const result = await checkModel(model, { budget: budgets[variant.name] });
    Object.assign(result, classifyFailures(variant.name, result, expected));
    variants.push({ name: variant.name, ...result });
  }
  return {
    ok: variants.length > 0 && variants.every((variant) => variant.unexpectedFailures.length === 0),
    tolerance: TOLERANCE,
    variants
  };
}

/** One summary row per variant, for a table. */
export function summaryRows(report) {
  return report.variants.map((variant) => ({
    variant: variant.name,
    collisions: variant.collisions.length,
    roundTrip: variant.roundTrip.percent,
    orderEqual: variant.order.equal,
    fields: `${variant.fields.recovered}/${variant.fields.total}`,
    reproducible: variant.reproducible,
    pages: variant.budget === null ? `${variant.pages}` : `${variant.pages}/${variant.budget}`
  }));
}

function argValue(args, flag) {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
}

async function main(args) {
  const file = args.find((arg, index) => !arg.startsWith('--') && !(index > 0 && args[index - 1].startsWith('--')));
  if (!file) {
    console.error('Usage: node build/resume-pdf-check.mjs <resume data file> [--budget <file>] [--expected <file>]');
    process.exitCode = 2;
    return;
  }
  const readJson = (name) => JSON.parse(readFileSync(path.resolve(name), 'utf8'));
  const budgetFile = argValue(args, '--budget');
  const expectedFile = argValue(args, '--expected');
  const report = await runChecks(readJson(file), {
    budgets: budgetFile ? readJson(budgetFile) : {},
    expected: expectedFile ? readJson(expectedFile) : []
  });
  report.summary = summaryRows(report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
