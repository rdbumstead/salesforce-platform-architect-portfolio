/**
 * @description       : Tests for the PDF/UA tagging option of c/documentPdf. They draw real
 *                      documents with the shipped jsPDF build (the jsPDF_Library static
 *                      resource) and read the structure back out of the PDF source. veraPDF
 *                      PDF/UA-1 is the full check and runs by hand, since CI has no Java.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/19/2026
 **/
import { DOCUMENT_LAYOUT, createPdfWriter } from "c/documentPdf";

const fs = require("fs");
const path = require("path");
const util = require("util");

// jsdom has no TextEncoder, which jsPDF and the tagger both use in a browser.
global.TextEncoder = global.TextEncoder || util.TextEncoder;
global.TextDecoder = global.TextDecoder || util.TextDecoder;

// Loads the real jsPDF the way the check script does: the build is a UMD file.
function loadJsPdf() {
  const file = path.resolve(
    __dirname,
    "../../../staticresources/jsPDF_Library.js"
  );
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function("module", "exports", fs.readFileSync(file, "utf8"))(
    module,
    module.exports
  );
  return module.exports.jsPDF;
}

const JsPdf = loadJsPdf();

function writeDocument(options) {
  const doc = new JsPdf({ unit: "pt", format: "letter" });
  const writer = createPdfWriter(doc, options);
  const { type, space, marks } = DOCUMENT_LAYOUT;
  writer.header({
    name: "Seed Owner",
    title: "Seed Architect",
    links: [
      { label: "LinkedIn", url: "https://www.linkedin.com/in/seed-owner" },
      { label: "GitHub", url: "https://github.com/seed-owner" }
    ]
  });
  writer.setSection("Experience");
  const titleRow = writer.textRow(
    [{ kind: "section", text: "EXPERIENCE", x: writer.margin }],
    type.sectionTitle
  );
  titleRow.rule = true;
  writer.block([titleRow], space.sectionTitleAfter, true, {
    isSectionTitle: true
  });
  const rows = writer.paragraph("bullet", "Built the thing", type.bullet, 15);
  rows[0].pieces.unshift({
    kind: "marker",
    text: marks.bullet,
    x: writer.margin + 5,
    style: type.bullet
  });
  writer.block(rows, space.itemGap);
  writer.block(writer.paragraph("skill", "Apex, LWC", type.text), 2);
  writer.draw();
  // jsPDF writes the file as a binary string, so the structure reads as text.
  return doc.output();
}

describe("c/documentPdf tagging", () => {
  it("writes a structure tree, marked content, the language and the title when tagged", () => {
    const source = writeDocument({ tagged: true, title: "Seed Owner resume" });
    expect(source).toContain("/MarkInfo <</Marked true>>");
    expect(source).toContain("/StructTreeRoot");
    expect(source).toContain("/Type /StructElem /S /H1");
    expect(source).toContain("/Type /StructElem /S /H2");
    expect(source).toContain("/Type /StructElem /S /L ");
    expect(source).toContain("/Type /StructElem /S /LI");
    expect(source).toContain("/Type /StructElem /S /Lbl");
    expect(source).toContain("/Type /StructElem /S /LBody");
    expect(source).toContain("/Type /StructElem /S /Link");
    expect(source).toContain("/Type /StructElem /S /P");
    expect(source).toContain("/Lang (en)");
    expect(source).toContain("/Tabs /S");
    expect(source).toContain("/ViewerPreferences <</DisplayDocTitle true>>");
    expect(source).toContain("<pdfuaid:part>1</pdfuaid:part>");
    expect(source).toContain("Seed Owner resume");
  });

  it("marks the rule and the separator as artifacts and every text piece as content", () => {
    const source = writeDocument({ tagged: true, title: "T" });
    expect(source).toContain("/Artifact BMC");
    expect(source).toContain("/H1 <</MCID 0>> BDC");
    expect(source).toContain("/Link <</MCID");
  });

  it("writes the links as tagged annotations with a description", () => {
    const source = writeDocument({ tagged: true, title: "T" });
    expect(source).toContain("/Subtype /Link");
    expect(source).toContain("/StructParent");
    expect(source).toContain("/Contents (LinkedIn)");
    expect(source).toContain("/URI (https://github.com/seed-owner)");
    expect(source).toContain("/Type /OBJR");
  });

  it("writes none of it when the option is off, and draws the same text", () => {
    const plain = writeDocument({});
    const tagged = writeDocument({ tagged: true, title: "T" });
    expect(plain).not.toContain("/StructTreeRoot");
    expect(plain).not.toContain("/MarkInfo");
    expect(plain).not.toContain("BDC");
    // jsPDF draws text as hex or literal runs, so compare the draw operator count.
    const tj = (source) => (source.match(/\bTj\b|\bTJ\b/g) || []).length;
    expect(tj(tagged)).toBe(tj(plain));
  });

  it("names the document Document when no title is given", () => {
    const source = writeDocument({ tagged: true });
    expect(source).toContain('<rdf:li xml:lang="x-default">Document</rdf:li>');
  });
});
