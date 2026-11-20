/**
 * @description       : Tags a jsPDF document for PDF/UA, so a screen reader gets the structure
 *                      the text page already has. jsPDF has no tagging calls, so this module
 *                      uses what the library exposes: the putPage, postPutResources and
 *                      putCatalog events, raw writes into the page content stream and
 *                      allocation of extra objects. The block writer in c/documentPdf hands it
 *                      each piece it draws by kind and block, and it writes a structure tree
 *                      (headings, paragraphs, lists, links) in drawing order, so the reading
 *                      order is the order of the text page. Every drawn piece sits inside a
 *                      marked content sequence. Rules, separators and the repeated "(continued)"
 *                      heading are artifacts. It also writes MarkInfo, the tab order, the
 *                      display of the document title and the PDF/UA identification in the XMP
 *                      metadata. The language and the title come from the caller.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/19/2026
 **/

/** A PDF literal string, with the three characters that need a backslash. */
const pdfString = (text) =>
  String(text)
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const xmlText = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** UTF-8 bytes as a binary string, the form jsPDF's writer takes for a stream. */
const utf8Binary = (text) =>
  Array.from(new TextEncoder().encode(text), (byte) =>
    String.fromCharCode(byte)
  ).join("");

/**
 * Tags one jsPDF document. Create it before anything is drawn, draw every piece through piece,
 * artifact and link, and save the document as usual. The structure is written when jsPDF
 * writes the file.
 * @param {object} doc a jsPDF document in points
 * @param {object} options { title, lang }: the document title and its language, "en" by default
 * @returns {object} { piece, artifact, link }
 */
export function createPdfTagger(doc, options = {}) {
  const title = options.title || "Document";
  const lang = options.lang || "en";
  const internal = doc.internal;
  const root = { tag: "Document", kids: [], parent: null };
  const pageMcids = {};
  const annots = [];
  const pendingAnnots = {};
  let section = null;
  let current = null;
  let blockId;
  let paragraph = null;
  let list = null;
  let role = null;
  let item = null;
  let itemBody = null;
  let rootObject;
  let metadataObject;

  if (typeof doc.setLanguage === "function") {
    doc.setLanguage(lang);
  }
  doc.setProperties({ title });

  const node = (tag, parent = root) => {
    const element = { tag, kids: [], parent };
    parent.kids.push(element);
    return element;
  };

  // Draws through paint inside a marked content sequence that belongs to the element.
  const mark = (element, paint) => {
    const page = internal.getCurrentPageInfo().pageNumber;
    const onPage = pageMcids[page] || (pageMcids[page] = []);
    const mcid = onPage.length;
    onPage.push(element);
    element.kids.push({ mcr: true, page, mcid });
    internal.write(`/${element.tag} <</MCID ${mcid}>> BDC`);
    paint();
    internal.write("EMC");
  };

  const artifact = (paint) => {
    internal.write("/Artifact BMC");
    paint();
    internal.write("EMC");
  };

  const parentOf = () => section || root;

  /**
   * Places one drawn piece in the tree by its kind and block, then draws it inside marked
   * content. A piece of a block that is not new joins the paragraph, list or role the block
   * has open.
   * @param {object} piece { kind, blockId }
   * @param {Function} paint draws the piece
   */
  const place = (piece, paint) => {
    if (piece.blockId !== blockId) {
      blockId = piece.blockId;
      paragraph = null;
      list = null;
      role = null;
      item = null;
      itemBody = null;
    }
    switch (piece.kind) {
      case "name":
        current = node("H1", root);
        break;
      case "title":
        current = node("P", root);
        break;
      case "separator":
      case "section-continued":
        artifact(paint);
        return;
      case "link":
        paragraph = paragraph || node("P", parentOf());
        current = node("Link", paragraph);
        break;
      case "section":
        section = node("Sect", root);
        current = node("H2", section);
        break;
      case "role":
      case "dates":
        role = role || node("H3", parentOf());
        current = role;
        break;
      case "marker":
        list = list || node("L", parentOf());
        item = node("LI", list);
        itemBody = null;
        current = node("Lbl", item);
        break;
      case "bullet":
        if (!item) {
          list = list || node("L", parentOf());
          item = node("LI", list);
        }
        itemBody = itemBody || node("LBody", item);
        current = itemBody;
        break;
      case "verify":
        paragraph = paragraph || node("P", parentOf());
        current = node("Link", paragraph);
        break;
      default:
        // employer, summary, skill, earlier, cert, retired, education, text and the labels that
        // sit in front of them: one paragraph per block, a label and its text share it.
        paragraph = paragraph || node("P", parentOf());
        current = paragraph;
    }
    mark(current, paint);
  };

  /**
   * A link annotation under the link element of the piece just drawn. rect is
   * [left, top, right, bottom] in points from the top left of the page.
   * @param {object} link { rect, url, alt }
   */
  const link = (info) => {
    const page = internal.getCurrentPageInfo().pageNumber;
    (pendingAnnots[page] = pendingAnnots[page] || []).push({
      element: current,
      rect: info.rect,
      url: info.url,
      alt: info.alt
    });
  };

  internal.events.subscribe("putPage", (data) => {
    internal.write(`/StructParents ${data.pageNumber - 1}`);
    internal.write("/Tabs /S");
    const found = pendingAnnots[data.pageNumber] || [];
    if (!found.length) {
      return;
    }
    const height = internal.pageSize.getHeight();
    const ids = found.map((entry) => {
      const added = internal.newAdditionalObject();
      entry.objId = added.objId;
      entry.key = doc.getNumberOfPages() + annots.length;
      entry.pageObj = data.objId;
      annots.push(entry);
      const [left, top, right, bottom] = entry.rect;
      added.content =
        `<</Type /Annot /Subtype /Link /Rect [${left.toFixed(2)} ${(height - bottom).toFixed(2)} ` +
        `${right.toFixed(2)} ${(height - top).toFixed(2)}] /Border [0 0 0] /F 4 /P ${data.objId} 0 R ` +
        `/StructParent ${entry.key} /Contents (${pdfString(entry.alt)}) ` +
        `/A <</S /URI /URI (${pdfString(entry.url)})>> >>`;
      return `${added.objId} 0 R`;
    });
    internal.write(`/Annots [${ids.join(" ")}]`);
  });

  internal.events.subscribe("postPutResources", () => {
    const all = [];
    const walk = (element) => {
      all.push(element);
      element.kids.forEach((kid) => {
        if (!kid.mcr) {
          walk(kid);
        }
      });
    };
    walk(root);
    all.forEach((element) => {
      element.oid = internal.newObjectDeferred();
    });
    rootObject = internal.newObjectDeferred();
    const parentTree = internal.newObjectDeferred();
    const pageObject = (number) => internal.getPageInfo(number).objId;
    const annotPage = (entry) =>
      Object.keys(pendingAnnots).find((page) =>
        pendingAnnots[page].includes(entry)
      );
    const firstPage = (element) => {
      const content = element.kids.find((kid) => kid.mcr);
      if (content) {
        return content.page;
      }
      for (const kid of element.kids) {
        const found = kid.mcr ? null : firstPage(kid);
        if (found) {
          return found;
        }
      }
      const own = annots.find((entry) => entry.element === element);
      return own ? Number(annotPage(own)) : null;
    };
    all.forEach((element) => {
      internal.newObjectDeferredBegin(element.oid, true);
      const kids = element.kids
        .map((kid) => {
          if (kid.mcr) {
            return `<</Type /MCR /Pg ${pageObject(kid.page)} 0 R /MCID ${kid.mcid}>>`;
          }
          return `${kid.oid} 0 R`;
        })
        .concat(
          annots
            .filter((entry) => entry.element === element)
            .map(
              (entry) =>
                `<</Type /OBJR /Pg ${entry.pageObj} 0 R /Obj ${entry.objId} 0 R>>`
            )
        );
      const page = firstPage(element);
      const parentId = element.parent ? element.parent.oid : rootObject;
      internal.write(
        `<</Type /StructElem /S /${element.tag} /P ${parentId} 0 R ` +
          `${page ? `/Pg ${pageObject(page)} 0 R ` : ""}/K [${kids.join(" ")}]>>`
      );
      internal.write("endobj");
    });
    const pages = doc.getNumberOfPages();
    internal.newObjectDeferredBegin(rootObject, true);
    internal.write(
      `<</Type /StructTreeRoot /K ${root.oid} 0 R /ParentTree ${parentTree} 0 R ` +
        `/ParentTreeNextKey ${pages + annots.length}>>`
    );
    internal.write("endobj");
    const numbers = [];
    for (let page = 1; page <= pages; page += 1) {
      const onPage = pageMcids[page] || [];
      numbers.push(
        `${page - 1} [${onPage.map((element) => `${element.oid} 0 R`).join(" ")}]`
      );
    }
    annots.forEach((entry) => {
      numbers.push(`${entry.key} ${entry.element.oid} 0 R`);
    });
    internal.newObjectDeferredBegin(parentTree, true);
    internal.write(`<</Nums [${numbers.join(" ")}]>>`);
    internal.write("endobj");
    // The XMP packet carries the title and says the file follows PDF/UA part 1.
    const xmp =
      '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">' +
      `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlText(title)}</rdf:li></rdf:Alt></dc:title>` +
      "<pdfuaid:part>1</pdfuaid:part></rdf:Description></rdf:RDF></x:xmpmeta>" +
      '<?xpacket end="w"?>';
    const bytes = utf8Binary(xmp);
    metadataObject = internal.newObject();
    internal.write(`<</Type /Metadata /Subtype /XML /Length ${bytes.length}>>`);
    internal.write("stream");
    internal.write(bytes);
    internal.write("endstream");
    internal.write("endobj");
  });

  internal.events.subscribe("putCatalog", () => {
    internal.write("/MarkInfo <</Marked true>>");
    internal.write(`/StructTreeRoot ${rootObject} 0 R`);
    internal.write("/ViewerPreferences <</DisplayDocTitle true>>");
    internal.write(`/Metadata ${metadataObject} 0 R`);
  });

  return { piece: place, artifact, link };
}
