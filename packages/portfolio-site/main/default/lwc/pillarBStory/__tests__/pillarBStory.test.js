/**
 * @description       : Unit tests for pillarBStory: the six sections, captioned tables, the cost sources,
 *                      pre-sales framing, no video prototype, the architecture image
 *                      and its alt text and link, the decision matrix under section 3, the list
 *                      markers, the repeats cut, the cost table as phone cards, and tokens only
 *                      in the CSS.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import PillarBStory from "c/pillarBStory";

const HEADINGS = [
  "1. The client",
  "2. Discovery",
  "3. The decision matrix",
  "4. Cost and effort",
  "5. Solution design",
  "6. Outcome",
  "7. What I would revisit"
];

function createComponent() {
  const element = createElement("c-pillar-b-story", { is: PillarBStory });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));
const text = (node) => node.textContent.replace(/\s+/g, " ").trim();

describe("c-pillar-b-story", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("renders the seven section headings in order", () => {
    const element = createComponent();
    expect(qa(element, "h2.section-heading").map(text)).toEqual(HEADINGS);
  });

  it("gives both tables a caption and header cells with scope", () => {
    const element = createComponent();
    const tables = qa(element, "table");
    expect(tables).toHaveLength(2);
    tables.forEach((table) => {
      expect(text(table.querySelector("caption")).length).toBeGreaterThan(0);
      expect(table.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(
        0
      );
      expect(table.querySelectorAll('th[scope="row"]').length).toBeGreaterThan(
        0
      );
    });
    expect(text(tables[0].querySelector("caption"))).toBe(
      "Lifecycle concepts mapped to each option's objects"
    );
    expect(tables[1].querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("marks Education Cloud names as not verified in an org", () => {
    const element = createComponent();
    expect(text(q(element, ".footnote"))).toContain(
      "They are not verified in an org."
    );
  });

  it("names a public source on every ROI row", () => {
    const element = createComponent();
    const rows = qa(element, "table")[1].querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const links = row.querySelectorAll("a[href^='https://']");
      expect(links.length).toBeGreaterThan(0);
      links.forEach((a) => expect(a.rel).toBe("noopener noreferrer"));
    });
  });

  it("cites the public Power of Us and Nonprofit pricing pages and has no placeholder left", () => {
    const element = createComponent();
    const rows = qa(element, "table")[1].querySelectorAll("tbody tr");
    const hrefs = (row) =>
      Array.from(row.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    const powerOfUs =
      "https://help.salesforce.com/s/articleView?id=000385150&language=en_US&type=1";
    expect(hrefs(rows[0])).toContain(powerOfUs);
    expect(hrefs(rows[2])).toContain(powerOfUs);
    expect(hrefs(rows[2])).toContain(
      "https://www.salesforce.com/nonprofit/pricing/"
    );
    expect(text(rows[2])).toContain("$70 per user per month");
    expect(q(element, ".placeholder")).toBeNull();
    expect(text(q(element, "article"))).not.toMatch(/PLACEHOLDER/);
    expect(text(q(element, '[data-id="licence-sources"]'))).toContain(
      "read on 28 October 2026"
    );
  });

  it("ends with what I would revisit, after the outcome", () => {
    const element = createComponent();
    const outcome = q(element, '[data-section="outcome"]');
    const revisit = q(element, '[data-section="revisit"]');
    expect(
      outcome.compareDocumentPosition(revisit) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(text(revisit.querySelector("h2"))).toBe("7. What I would revisit");
    expect(text(revisit)).toContain("no assigned technical resource");
  });

  it("cites no scratch org reference as a cost source", () => {
    const element = createComponent();
    const hrefs = qa(element, ".cost-table a").map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs.some((href) => href.includes("scratch-orgs"))).toBe(false);
  });

  it("links the client's ten Power of Us licences to the public P10 page", () => {
    const element = createComponent();
    const item = q(element, '[data-id="client-licences"]');
    expect(text(item)).toContain("ten free licences under Power of Us");
    expect(text(item)).not.toContain("Power of Us (Power of Us");
    const link = item.querySelector("a");
    expect(link.getAttribute("href")).toBe(
      "https://help.salesforce.com/s/articleView?id=000385150&language=en_US&type=1"
    );
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
  });

  it("opens section 2 by framing the work as pre-sales", () => {
    const element = createComponent();
    const discovery = q(element, '[data-section="discovery"]');
    const first = discovery.querySelector("p");
    expect(first.dataset.id).toBe("framing");
    expect(text(first)).toBe(
      "This work was done in pre-sales, before the nonprofit chose a platform and before any build began."
    );
  });

  it("has no video prototype section and no D3 or D8 placeholder", () => {
    const element = createComponent();
    expect(q(element, '[data-section="video"]')).toBeNull();
    expect(q(element, '[data-placeholder="D3"]')).toBeNull();
    expect(q(element, '[data-placeholder="D8"]')).toBeNull();
    expect(text(q(element, "article"))).not.toMatch(/video/i);
  });

  it("shows the redrawn architecture from NL_Assets with alt text", () => {
    const element = createComponent();
    const img = q(element, "img.architecture-image");
    expect(img.getAttribute("src")).toContain(
      "NL_Assets/minimalist-architecture.svg"
    );
    expect(img.getAttribute("alt")).toContain("Object model");
    expect(text(q(element, "figcaption"))).toBe(
      "Redrawn from public object names.Open full size"
    );
    expect(qa(element, "ul.decisions li")).toHaveLength(7);
  });

  it("links the architecture image to its full size file in a new tab", () => {
    const element = createComponent();
    const link = q(element, "a.architecture-link");
    expect(link.contains(q(element, "img.architecture-image"))).toBe(true);
    expect(link.getAttribute("href")).toContain(
      "NL_Assets/minimalist-architecture.svg"
    );
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(q(element, "a.full-size-link").getAttribute("href")).toBe(
      link.getAttribute("href")
    );
  });

  it("puts the decision matrix right after section 3 and before section 4", () => {
    const element = createComponent();
    const matrix = q(element, "c-decision-matrix");
    expect(matrix).not.toBeNull();
    const three = q(element, '[data-section="matrix"]');
    const four = q(element, '[data-section="roi"]');
    expect(
      three.compareDocumentPosition(matrix) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      matrix.compareDocumentPosition(four) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("says fundraising is out of scope once and keeps the outcome to two sentences", () => {
    const element = createComponent();
    const all = text(q(element, "article"));
    expect(all.match(/fundraising is out of scope/gi)).toHaveLength(1);
    const outcome = text(q(element, '[data-section="outcome"] p'));
    expect(outcome.match(/\./g)).toHaveLength(2);
    expect(outcome).toContain("user acceptance testing");
  });

  it("labels every cost table cell for the phone card layout", () => {
    const element = createComponent();
    const cells = qa(element, ".cost-table tbody td");
    expect(cells).toHaveLength(12);
    cells.forEach((cell) => {
      expect(cell.dataset.label).toMatch(
        /^(Licence model|Implementation effort|Why|Source)$/
      );
    });
  });

  it("sets list markers back, because the shared reset removes them", () => {
    const css = readFileSync(join(__dirname, "..", "pillarBStory.css"), "utf8");
    expect(css).toMatch(
      /\.facts,\s*\.decisions,\s*\.not-built\s*\{[^}]*list-style:\s*disc/
    );
    expect(css).toMatch(/max-width:\s*599\.98px/);
  });

  it("never names the client", () => {
    const element = createComponent();
    const all = text(q(element, "article"));
    expect(all).toContain("regional adult literacy nonprofit");
    expect(all).not.toMatch(/Greenville|GLA\b|Literacy Association/);
  });

  it("styles only with design tokens, never a hex colour", () => {
    const css = readFileSync(join(__dirname, "..", "pillarBStory.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("makes every table scroll region keyboard reachable with a name", () => {
    const element = createComponent();
    const regions = qa(element, ".table-scroll");
    expect(regions).toHaveLength(2);
    regions.forEach((region) => {
      expect(region.getAttribute("tabindex")).toBe("0");
      expect(region.getAttribute("role")).toBe("region");
      expect(region.getAttribute("aria-label")).toMatch(
        /table, scrolls sideways$/
      );
    });
  });
});
