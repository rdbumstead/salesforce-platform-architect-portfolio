/**
 * @description       : Unit tests for c/documentPdf, the layout, loader and block writer the
 *                      resume and the cover letter share.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/27/2026
 **/
import {
  DOCUMENT_LAYOUT,
  PREVIEW_PX_PER_PT,
  previewStyle,
  toBase64,
  fileNamePart,
  wrapText,
  createPdfLoader,
  createPdfWriter
} from "c/documentPdf";
import { loadScript } from "lightning/platformResourceLoader";

jest.mock("lightning/platformResourceLoader", () => {
  const universal = jest.requireActual("lightning/platformResourceLoader");
  return {
    __esModule: true,
    default: universal.default,
    loadScript: jest.fn(),
    loadStyle: jest.fn()
  };
});

function fakeDoc() {
  const state = { size: 10 };
  const doc = {
    internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } },
    pages: 1,
    setFont: jest.fn(),
    setFontSize: jest.fn((size) => {
      state.size = size;
    }),
    getTextWidth: jest.fn((text) => String(text).length * state.size * 0.5),
    setTextColor: jest.fn(),
    setDrawColor: jest.fn(),
    setLineWidth: jest.fn(),
    line: jest.fn(),
    text: jest.fn(),
    textWithLink: jest.fn(),
    addPage: jest.fn(() => {
      doc.pages += 1;
    }),
    addFileToVFS: jest.fn(),
    addFont: jest.fn()
  };
  return doc;
}

describe("c/documentPdf", () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete window.jspdf;
    delete global.fetch;
  });

  it("keeps white paper and dark ink in the shared layout", () => {
    expect(DOCUMENT_LAYOUT.colors.paper).toBe("#ffffff");
    expect(DOCUMENT_LAYOUT.page).toEqual({
      format: "letter",
      unit: "pt",
      margin: 54
    });
    const style = previewStyle();
    expect(style).toContain("--resume-paper: #ffffff");
    expect(style).toContain(
      `--resume-name-size: ${DOCUMENT_LAYOUT.type.name.size * PREVIEW_PX_PER_PT}px`
    );
    expect(style).not.toContain("--resume-paragraph-after");
    expect(
      previewStyle({
        ...DOCUMENT_LAYOUT,
        space: { ...DOCUMENT_LAYOUT.space, paragraphAfter: 14 }
      })
    ).toContain("--resume-paragraph-after: 22.4px");
  });

  it("encodes bytes as base64", () => {
    expect(toBase64(new Uint8Array([65, 66, 67]).buffer)).toBe("QUJD");
  });

  it("makes safe file name parts, trimming only when asked", () => {
    expect(fileNamePart("Ryan Bumstead", "_")).toBe("Ryan_Bumstead");
    expect(fileNamePart("Acme, Inc.", "-")).toBe("Acme-Inc-");
    expect(fileNamePart(" Acme, Inc. ", "-", true)).toBe("Acme-Inc");
    expect(fileNamePart(null, "-", true)).toBe("");
  });

  it("wraps on the widths given", () => {
    const doc = fakeDoc();
    expect(wrapText(doc, "aa bb cc", 30, 30)).toEqual(["aa bb", "cc"]);
    expect(wrapText(doc, "", 30, 30)).toEqual([""]);
  });

  it("loads jsPDF once, registers the fonts and retries a failed load", async () => {
    const doc = fakeDoc();
    window.jspdf = { jsPDF: jest.fn(() => doc) };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new Uint8Array([65]).buffer)
      })
    );
    loadScript.mockRejectedValueOnce(new Error("blocked"));
    const loader = createPdfLoader({});
    await expect(loader.createDocument()).rejects.toThrow("blocked");

    loadScript.mockResolvedValue();
    const made = await loader.createDocument();
    await loader.createDocument();
    expect(loadScript).toHaveBeenCalledTimes(2);
    expect(made.family).toBe("Inter");
    expect(doc.addFont).toHaveBeenCalledWith(
      "inter-latin-400-normal.ttf",
      "Inter",
      "normal"
    );
  });

  it("writes in the fallback font when the fonts cannot be fetched", async () => {
    const doc = fakeDoc();
    window.jspdf = { jsPDF: jest.fn(() => doc) };
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404 }));
    loadScript.mockResolvedValue();
    const made = await createPdfLoader({}).createDocument();
    expect(made.family).toBe("helvetica");
    expect(doc.addFont).not.toHaveBeenCalled();
  });

  it("says jsPDF did not load when the global is missing", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404 }));
    loadScript.mockResolvedValue();
    await expect(createPdfLoader({}).createDocument()).rejects.toThrow(
      "jsPDF did not load."
    );
  });

  it("writes the header centred with clickable links, then moves a block that does not fit to a new page", () => {
    const doc = fakeDoc();
    const trace = [];
    const writer = createPdfWriter(doc, { trace });
    writer.header({
      name: "Ryan Bumstead",
      title: "Architect",
      links: [
        { label: "LinkedIn", url: "https://www.linkedin.com/in/example" },
        { label: "Contact", url: "https://ryanbumstead.com/contact" }
      ]
    });
    writer.setSection("body");
    for (let index = 0; index < 60; index += 1) {
      writer.block(
        writer.paragraph("text", `Line ${index}`, DOCUMENT_LAYOUT.type.text),
        10
      );
    }
    writer.draw();

    expect(trace.slice(0, 2).map((piece) => piece.kind)).toEqual([
      "name",
      "title"
    ]);
    expect(doc.textWithLink).toHaveBeenCalledTimes(2);
    expect(
      trace.filter((piece) => piece.kind === "separator").map((p) => p.text)
    ).toEqual(["•"]);
    expect(doc.addPage).toHaveBeenCalled();
    expect(trace[trace.length - 1].page).toBe(doc.pages);
  });

  it("writes nothing for a missing header", () => {
    const doc = fakeDoc();
    const writer = createPdfWriter(doc);
    writer.header(null);
    expect(writer.blockCount).toBe(0);
    writer.draw();
    expect(doc.text).not.toHaveBeenCalled();
  });
});
